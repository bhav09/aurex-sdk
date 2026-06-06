from typing import Dict, Any, Callable
from aurex_sdk.auditor import AurexAuditor
import sys

def create_self_diagnostics_tool(workflow_id: str) -> Dict[str, Any]:
    """
    Returns an OpenAI-compatible tool schema that allows the agent to self-report
    unrecoverable failures (e.g., repeatedly broken tools, missing credentials).
    """
    return {
        "type": "function",
        "function": {
            "name": "aurex_report_task_failure",
            "description": "Call this tool if you are completely stuck, missing required credentials, or a tool you need is repeatedly failing. This will halt the workflow and notify the developer.",
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "The specific reason why the task cannot proceed (e.g., 'Missing database credentials', 'Tool X returned 500 error 3 times')."
                    },
                    "failure_type": {
                        "type": "string",
                        "enum": ["repeatedly_broken_tool", "missing_credentials", "complete_task_failure", "other"],
                        "description": "Categorize the type of failure."
                    }
                },
                "required": ["reason", "failure_type"]
            }
        }
    }

def handle_self_diagnostics_call(workflow_id: str, reason: str, failure_type: str) -> str:
    """
    The callback function that should be executed when the agent calls `aurex_report_task_failure`.
    It instantly trips the local BudgetGuard circuit breaker for this workflow.
    """
    try:
        auditor = AurexAuditor()
        # Escalate failure directly to the cloud and block the workflow
        auditor.mark_failure(
            workflow_id=workflow_id,
            error_message=f"Agent Self-Reported Failure [{failure_type}]: {reason}"
        )
        # Force the session cost over the limit to immediately trip the budget guard locally
        with auditor._lock:
            # We add a massive dummy cost to instantly trigger the budget breaker 
            # for subsequent calls in this workflow.
            auditor._session_costs[workflow_id] = auditor._session_costs.get(workflow_id, 0.0) + 999999.0
            
        print(f"[Aurex SDK] Circuit breaker tripped by agent self-diagnostics for workflow '{workflow_id}'.", file=sys.stderr)
        return "Failure reported. The workflow will now be halted by the Aurex circuit breaker."
    except Exception as e:
        print(f"[Aurex SDK] Failed to handle self diagnostics: {e}", file=sys.stderr)
        return "Failed to report."
