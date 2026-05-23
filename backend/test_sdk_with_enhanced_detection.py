"""
Test Script: Verify SDK Integration with Enhanced Detection Engine
Tests that the SDK can send events and the enhanced detection engine analyzes them correctly.
"""

import asyncio
import requests
import json
from datetime import datetime

# Configuration
API_BASE_URL = "http://localhost:8000"

# ⚠️ IMPORTANT: Replace this with YOUR FULL API key from the UI!
# The key you just created starts with: ax_live_be...
# It should be 40+ characters long (e.g., ax_live_be1234567890abcdef...)
# Copy the ENTIRE key that was shown when you created it in the UI
API_KEY = "ax_live_beeacb7fb8fa508ebf869d50c7d9e8a8cc7d31dcd8d7d8e4"

async def test_sdk_integration():
    """Test SDK event ingestion and enhanced analysis"""
    
    print("=" * 80)
    print("Testing SDK Integration with Enhanced Detection Engine")
    print("=" * 80)
    
    # Step 1: Send test events via SDK endpoint
    print("\n1. Sending test LLM events via SDK endpoint...")
    
    test_events = [
        {
            "model": "gpt-4-turbo",
            "prompt_tokens": 1500,
            "completion_tokens": 500,
            "workflow_id": "document_analysis",
            "feature": "Document Processing",  # For better workflow naming
            "timestamp": datetime.utcnow().isoformat()
        },
        {
            "model": "gpt-4-turbo",
            "prompt_tokens": 1500,  # Same prompt (caching opportunity)
            "completion_tokens": 450,
            "workflow_id": "document_analysis",
            "feature": "Document Processing",
            "timestamp": datetime.utcnow().isoformat()
        },
        {
            "model": "gpt-4-turbo",
            "prompt_tokens": 1500,  # Same prompt again
            "completion_tokens": 480,
            "workflow_id": "document_analysis",
            "feature": "Document Processing",
            "timestamp": datetime.utcnow().isoformat()
        },
        {
            "model": "gpt-4-turbo",  # Expensive model for simple task
            "prompt_tokens": 200,
            "completion_tokens": 50,
            "workflow_id": "quick_query",
            "feature": "Quick Queries",
            "timestamp": datetime.utcnow().isoformat()
        },
        {
            "model": "gpt-3.5-turbo",  # Cheaper model for simple task
            "prompt_tokens": 180,
            "completion_tokens": 45,
            "workflow_id": "quick_query_optimized",
            "feature": "Quick Queries",
            "timestamp": datetime.utcnow().isoformat()
        }
    ]
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    for i, event in enumerate(test_events, 1):
        response = requests.post(
            f"{API_BASE_URL}/api/v1/sdk/events",
            headers=headers,
            json=event
        )
        
        if response.status_code == 200:
            print(f"   ✓ Event {i}/5 sent successfully")
        else:
            print(f"   ✗ Event {i}/5 failed: {response.status_code} - {response.text}")
            return
    
    print("\n2. Waiting for events to be processed...")
    await asyncio.sleep(2)
    
    # Step 2: Trigger analysis
    print("\n3. Triggering enhanced detection analysis...")
    
    # Get the session ID from the most recent upload
    # In production, you'd get this from the SDK response
    # For now, we'll query the sessions endpoint
    
    response = requests.get(
        f"{API_BASE_URL}/api/v1/audit/sessions",
        headers=headers
    )
    
    if response.status_code != 200:
        print(f"   ✗ Failed to get sessions: {response.status_code}")
        return
    
    sessions = response.json()
    if not sessions:
        print("   ✗ No sessions found")
        return
    
    latest_session = sessions[-1]
    session_id = latest_session["id"]
    
    print(f"   Session ID: {session_id}")
    
    # Step 3: Get analysis results
    print("\n4. Fetching enhanced analysis results...")
    
    response = requests.get(
        f"{API_BASE_URL}/api/v1/audit/sessions/{session_id}/analysis",
        headers=headers
    )
    
    if response.status_code != 200:
        print(f"   ✗ Failed to get analysis: {response.status_code}")
        return
    
    analysis = response.json()
    
    # Step 4: Verify enhanced features
    print("\n5. Verifying Enhanced Detection Features:")
    print("-" * 80)
    
    # Check executive summary
    exec_summary = analysis.get("executive_summary", {})
    print(f"\n   Executive Summary:")
    print(f"   - Credit Score: {exec_summary.get('credit_score', 'N/A')}/100")
    print(f"   - Waste Percentage: {exec_summary.get('waste_percentage', 'N/A')}%")
    print(f"   - Annual Savings: ${exec_summary.get('annual_savings_projection', 'N/A')}")
    
    # Check workflow naming
    workflows = analysis.get("workflow_breakdown", [])
    print(f"\n   Workflow Naming (Feature #1):")
    for wf in workflows[:3]:
        print(f"   - {wf.get('workflow_id', 'N/A')} ({wf.get('naming_category', 'N/A')}, confidence: {wf.get('naming_confidence', 'N/A')})")
    
    # Check advanced analysis
    advanced = analysis.get("advanced_analysis", {})
    
    if advanced:
        print(f"\n   ✓ Advanced Analysis Section Found!")
        
        # Model efficiency
        model_eff = advanced.get("model_efficiency", {})
        if model_eff.get("opportunities"):
            print(f"\n   Model Efficiency (Feature #3):")
            for opp in model_eff["opportunities"][:2]:
                print(f"   - {opp.get('workflow_id')}: Switch from {opp.get('current_model')} to {opp.get('recommended_model')}")
                print(f"     Savings: ${opp.get('potential_savings')} ({opp.get('savings_percentage')}%)")
        
        # Prompt efficiency
        prompt_eff = advanced.get("prompt_efficiency", {})
        if prompt_eff.get("inefficient_workflows"):
            print(f"\n   Prompt Efficiency (Feature #4):")
            for wf in prompt_eff["inefficient_workflows"][:2]:
                print(f"   - {wf.get('workflow_id')}: Ratio {wf.get('prompt_completion_ratio')}")
                print(f"     Compression potential: {wf.get('compression_potential_tokens')} tokens")
        
        # Caching opportunities
        caching = advanced.get("caching_opportunities", {})
        if caching.get("opportunities"):
            print(f"\n   Caching Opportunities (Feature #5):")
            for opp in caching["opportunities"][:2]:
                print(f"   - {opp.get('workflow_id')}: {opp.get('repetitions')} repetitions")
                print(f"     Savings: ${opp.get('potential_savings')} ({opp.get('savings_percentage')}%)")
        
        # Output length
        output_opt = advanced.get("output_length_optimization", {})
        if output_opt.get("wasteful_workflows"):
            print(f"\n   Output Length Optimization (Feature #6):")
            for wf in output_opt["wasteful_workflows"][:2]:
                print(f"   - {wf.get('workflow_id')}: Avg {wf.get('avg_output_tokens')} tokens")
                print(f"     Recommended max_tokens: {wf.get('recommended_max_tokens')}")
        
        # Provider comparison
        provider_comp = advanced.get("provider_comparison", {})
        if provider_comp.get("comparisons"):
            print(f"\n   Provider Comparison (Feature #7):")
            for comp in provider_comp["comparisons"][:2]:
                print(f"   - {comp.get('task_category')}: Switch from {comp.get('current_provider')} to {comp.get('recommended_provider')}")
                print(f"     Savings: ${comp.get('potential_savings')} ({comp.get('savings_percentage')}%)")
    
    # Check detection config
    config = analysis.get("detection_config", {})
    if config:
        print(f"\n   Detection Config (Feature #2 - Configurable Thresholds):")
        print(f"   - Context Explosion Threshold: {config.get('context_explosion_threshold', 'N/A')}")
        print(f"   - Expensive Model Threshold: ${config.get('expensive_model_threshold', 'N/A')}/1M")
        print(f"   - Cache Repetition Threshold: {config.get('cache_repetition_threshold', 'N/A')}")
    
    print("\n" + "=" * 80)
    print("✓ SDK Integration Test Complete!")
    print("=" * 80)
    
    # Save full analysis to file
    with open("test_analysis_output.json", "w") as f:
        json.dump(analysis, f, indent=2)
    print("\nFull analysis saved to: test_analysis_output.json")


if __name__ == "__main__":
    print("\nIMPORTANT: Replace API_KEY with your actual key from the UI!")
    print("The key should start with 'ax_live_'")
    print()
    
    # Run the test
    asyncio.run(test_sdk_integration())

# Made with Bob
