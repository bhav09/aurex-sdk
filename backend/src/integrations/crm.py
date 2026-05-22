"""
CRM Integration - Synchronizes lead metadata to a CRM endpoint
"""

import os
import logging
import httpx
from typing import Dict, Any, Optional

logger = logging.getLogger("aurex.crm")


async def sync_lead_to_crm(
    email: str,
    user_name: str,
    company_name: str,
    credit_score: int,
    waste_percentage: float,
    total_cost: float,
    wasted_cost: float,
    annual_savings: float
) -> bool:
    """
    Asynchronously sends lead details to the CRM webhook endpoint.
    Returns True if successful, False otherwise.
    """
    crm_url = os.getenv("CRM_WEBHOOK_URL")
    if not crm_url:
        logger.info("CRM_WEBHOOK_URL is not set; skipping CRM sync.")
        return False

    payload = {
        "email": email,
        "user_name": user_name,
        "company_name": company_name,
        "credit_score": credit_score,
        "waste_percentage": waste_percentage,
        "total_cost": total_cost,
        "wasted_cost": wasted_cost,
        "annual_savings": annual_savings,
        "source": "Aurex Audit Audit Session"
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(crm_url, json=payload)
            if response.status_code >= 400:
                logger.error(
                    f"CRM webhook returned status code {response.status_code}: {response.text}"
                )
                return False
            logger.info(f"Successfully synced lead {email} to CRM.")
            return True
    except Exception as e:
        logger.error(f"Failed to sync lead to CRM: {e}")
        return False
