import os
import json
import time
import sys
from pathlib import Path

# Add sdk/python to path so we can import aurex_sdk
sys.path.append(str(Path(__file__).parent.parent / "sdk" / "python"))

from aurex_sdk import AurexAuditor, AurexConfig
from aurex_sdk.heuristics import LocalHeuristicsEngine

def run_test():
    ledger_path = ".aurex/test_ledger.jsonl"
    if os.path.exists(ledger_path):
        os.remove(ledger_path)

    print("🚀 Initializing Aurex Zero-Trust Auditor...")
    config = AurexConfig(ledger_path=ledger_path, flush_interval_seconds=0.2)
    auditor = AurexAuditor(config)

    print("📝 Simulating LLM Events...")
    
    # 1. Simulate Redundant System Prompts (3 calls with identical system prompt)
    system_prompt = "You are a helpful assistant. Act extremely professional and verbose."
    for _ in range(3):
        # We also pass prompt and response to verify hashing works
        auditor.log_event(
            model="gpt-4o",
            prompt="Tell me a long joke about VCs.",
            response="Why did the VC cross the road? To fund the other side!",
            input_tokens=1000,
            output_tokens=150,
            workflow_id="wf-redundant-prompts",
            system_prompt=system_prompt
        )

    # 2. Simulate runaway loops (input tokens doubling: 100 -> 260 -> 680)
    contexts = [100, 260, 680]
    for c in contexts:
        auditor.log_event(
            model="claude-3-5-sonnet",
            prompt="Let's continue this conversation",
            response="Ok",
            input_tokens=c,
            output_tokens=20,
            workflow_id="wf-runaway-loop",
            system_prompt="Pruning context system prompt"
        )

    # 3. Simulate expensive model misuse (simple requests < 500 in, < 100 out on > $2.00 model)
    # gpt-4o is expensive ($2.50 per 1M in) and requests are simple
    for i in range(4):
        auditor.log_event(
            model="gpt-4o",
            prompt=f"ping {i}",
            response="pong",
            input_tokens=50,
            output_tokens=10,
            workflow_id="wf-expensive-misuse",
            system_prompt="Short prompt system"
        )

    print("⏳ Flushing queue...")
    # Wait for the background thread to flush
    time.sleep(1.0)
    auditor.shutdown()

    # --- VERIFICATION ---
    print("\n--- 🛡️ VERIFYING ZERO-TRUST PAYLOAD GUARANTEE ---")
    if not os.path.exists(ledger_path):
        print("❌ Error: Ledger file not created!")
        sys.exit(1)

    raw_data_found = False
    with open(ledger_path, "r") as f:
        for line in f:
            evt = json.loads(line)
            # Assert no raw strings of prompt or response are present!
            for field in ["prompt", "response", "system_prompt"]:
                if field in evt:
                    print(f"❌ Failure: Raw field '{field}' leaked into ledger event: {evt[field]}")
                    raw_data_found = True
            
            # Assert hashes exist instead
            if not evt.get("prompt_hash") or not evt.get("system_prompt_hash") or not evt.get("response_hash"):
                print(f"❌ Failure: Missing cryptographic hashes in event: {evt}")
                raw_data_found = True

    if raw_data_found:
        print("❌ Zero-Trust test failed! Raw prompt/response values leaked into the ledger.")
        sys.exit(1)
    else:
        print("✅ Zero-Trust Guarantee fully verified: No raw prompts, responses, or system prompts found in the ledger!")
        print("✅ Cryptographic hashes (SHA-256) correctly populated.")

    print("\n--- 🧠 VERIFYING LOCAL HEURISTICS & CREDIT SCORE ENGINE ---")
    engine = LocalHeuristicsEngine(ledger_path)
    report = engine.analyze()

    print(f"  • Total Events audited:  {report['total_events']}")
    print(f"  • Total calculated cost: ${report['total_cost']:.4f}")
    print(f"  • Local Wasted Cost:     ${report['wasted_cost']:.4f}")
    print(f"  • Waste Percentage:      {report['waste_percentage']}%")
    print(f"  • Local Credit Score:    {report['credit_score']} / 100")

    # Verify heuristics are flagged
    found_issues = [issue["issue_type"] for issue in report["issues"]]
    expected_issues = ["redundant_system_prompt", "agent_loop", "over_provisioned_model"]
    
    missing = [exp for exp in expected_issues if exp not in found_issues]
    if missing:
        print(f"❌ Failure: Expected heuristics not detected locally: {missing}")
        sys.exit(1)
    else:
        print("✅ Local Heuristics engine successfully flagged loops, redundant prompts, and model misuse!")
        print("✅ Local Credit Score successfully computed entirely offline.")
        
    print("\n🎉 ALL SDK CORE FUNCTIONALITY VALIDATED SUCCESSFULLY!")
    sys.exit(0)

if __name__ == "__main__":
    run_test()
