"""
Slack Integration - Sends Slack alerts using Block Kit formatting
"""

import logging
import httpx
from typing import Dict, Any, Optional

logger = logging.getLogger("aurex.slack")


async def send_slack_alert(
    webhook_url: str,
    session_id: str,
    company_name: str,
    user_name: str,
    email: str,
    credit_score: int,
    total_cost: float,
    wasted_cost: float,
    waste_percentage: float,
    top_issues: list = None,
    dashboard_url: str = None
) -> bool:
    """
    Sends a rich Slack Block Kit message to a webhook URL.
    Returns True if the notification was sent successfully, False otherwise.
    """
    if not webhook_url:
        logger.warning("Slack webhook url is empty; skipping alert.")
        return False

    if not dashboard_url:
        # Fallback URL
        dashboard_url = f"https://aurex.dev/dashboard/audit/{session_id}"

    # Structure top issues section
    issues_text = ""
    if top_issues:
        for idx, issue in enumerate(top_issues[:3]):  # Show up to 3 issues
            title = issue.get("title", "Unknown issue")
            severity = issue.get("severity", "MEDIUM")
            weekly_cost = issue.get("weekly_cost", 0.0)
            emoji = "🔴" if severity == "CRITICAL" else ("🟠" if severity == "HIGH" else "🟡")
            issues_text += f"{emoji} *{title}* (Severity: {severity})\nCost Impact: ${weekly_cost:.2f}/wk\n\n"
    else:
        issues_text = "No critical issues detected."

    # Format waste percentage and credit score nicely
    score_emoji = "⭐" if credit_score >= 80 else ("⚠️" if credit_score >= 50 else "🚨")

    payload = {
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": "🚨 Aurex AI Budget Alert: Potential Waste Detected",
                    "emoji": True
                }
            },
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": f"*Company:*\n{company_name}"
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*User:*\n{user_name} ({email})"
                    }
                ]
            },
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": f"*Token Credit Score:*\n{score_emoji} *{credit_score}* / 100"
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*Waste Percentage:*\n🔴 *{waste_percentage:.1f}%*"
                    }
                ]
            },
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": f"*Total Spend Tracked:*\n${total_cost:.2f}"
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*Wasted Cost:*\n${wasted_cost:.2f}"
                    }
                ]
            },
            {
                "type": "divider"
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Top Detected Waste Categories:*\n\n{issues_text}"
                }
            },
            {
                "type": "divider"
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "View Audit Dashboard",
                            "emoji": True
                        },
                        "url": dashboard_url,
                        "style": "primary"
                    }
                ]
            }
        ]
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(webhook_url, json=payload)
            if response.status_code >= 400:
                logger.error(
                    f"Slack webhook returned status code {response.status_code}: {response.text}"
                )
                return False
            return True
    except Exception as e:
        logger.error(f"Failed to send Slack alert: {e}")
        return False
