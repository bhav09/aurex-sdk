import sys
import argparse
import os
from .heuristics import LocalHeuristicsEngine

def run_cli():
    parser = argparse.ArgumentParser(
        description="Aurex Zero-Trust Local-First Audit CLI & CI/CD Build Breaker"
    )
    parser.add_argument(
        "--ledger",
        default=".aurex/ledger.jsonl",
        help="Path to the local Aurex ledger file (default: .aurex/ledger.jsonl)"
    )
    parser.add_argument(
        "--fail-under",
        type=int,
        default=0,
        help="Break build if local Token Credit Score falls below this score (e.g. 80)"
    )
    parser.add_argument(
        "--max-waste-usd",
        type=float,
        default=float("inf"),
        help="Break build if calculated local waste exceeds this amount in USD"
    )
    parser.add_argument(
        "--max-spend-usd",
        type=float,
        default=float("inf"),
        help="Break build if total spend exceeds this amount in USD"
    )

    args = parser.parse_args()

    if not os.path.exists(args.ledger):
        print(f"\033[93m[Aurex Warning] Local ledger not found at: {args.ledger}\033[0m")
        print("Run some LLM requests first using AurexAuditor to populate the ledger.")
        sys.exit(0)

    # Trigger heuristics analysis
    engine = LocalHeuristicsEngine(args.ledger)
    report = engine.analyze()

    total_events = report["total_events"]
    total_cost = report["total_cost"]
    wasted_cost = report["wasted_cost"]
    waste_percentage = report["waste_percentage"]
    credit_score = report["credit_score"]
    issues = report["issues"]

    # Select color based on Credit Score severity
    if credit_score >= 85:
        score_color = "\033[92m" # Green
    elif credit_score >= 70:
        score_color = "\033[93m" # Yellow
    else:
        score_color = "\033[91m" # Red

    print("\n" + "="*55)
    print(f"      🛡️  Aurex Local FinOps Audit Report")
    print("="*55)
    print(f"  • Local Ledger File:    {args.ledger}")
    print(f"  • Total LLM Requests:   {total_events:,}")
    print(f"  • Total Spend USD:      ${total_cost:.4f}")
    print(f"  • Wasted Spend USD:     ${wasted_cost:.4f}")
    print(f"  • Waste Ratio:          {waste_percentage}%")
    print(f"  • Token Credit Score:   {score_color}{credit_score} / 100\033[0m")
    print("="*55)

    if issues:
        print("\n🔎 Detected Waste Drivers:")
        for idx, issue in enumerate(issues[:5], 1):
            sev = issue["severity"]
            sev_color = "\033[91m" if sev == "CRITICAL" else "\033[93m"
            print(f"  {idx}. {sev_color}[{sev}]\033[0m \033[1m{issue['title']}\033[0m (-${issue['cost_impact']:.2f})")
            print(f"     └─ {issue['summary']}")
            print(f"     └─ CTA: \033[96m{issue['cta']}\033[0m")
        if len(issues) > 5:
            print(f"  ... and {len(issues) - 5} more issues.")
    else:
        print("\n\033[92m🎉 Excellent! No cost leakage or loop risks detected in the ledger.\033[0m")

    print("="*55)

    # Evaluate CI/CD rules
    failed = False
    fail_reasons = []

    if args.fail_under > 0 and credit_score < args.fail_under:
        failed = True
        fail_reasons.append(
            f"Credit Score ({credit_score}) is below the required threshold of {args.fail_under}."
        )

    if wasted_cost > args.max_waste_usd:
        failed = True
        fail_reasons.append(
            f"Wasted cost (${wasted_cost:.4f}) exceeds the maximum allowed waste of ${args.max_waste_usd:.4f}."
        )

    if total_cost > args.max_spend_usd:
        failed = True
        fail_reasons.append(
            f"Total spend (${total_cost:.4f}) exceeds the maximum budget of ${args.max_spend_usd:.4f}."
        )

    if failed:
        print("\n\033[91m🚨 BUILD BREAKER TRIPPED! CI/CD Audit Failed:\033[0m")
        for reason in fail_reasons:
            print(f"  ❌ {reason}")
        print("\nPlease optimize your LLM orchestration (e.g. enable caching, prune context) before deploying.")
        print("="*55 + "\n")
        sys.exit(1)
    else:
        print("\n\033[92m✅ CI/CD BUILD PASSED. Cost & efficiency policies are fully satisfied.\033[0m\n")
        sys.exit(0)

if __name__ == "__main__":
    run_cli()
