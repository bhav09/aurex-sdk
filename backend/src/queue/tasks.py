from typing import Dict, Any
from src.utils.logger import get_logger
import resend
from app.config import settings

logger = get_logger(__name__)

async def send_email_task(ctx: Dict[Any, Any], to_email: str, subject: str, text: str) -> bool:
    """
    Background task to send an email via Resend
    """
    resend.api_key = settings.resend_api_key
    if not resend.api_key:
        logger.warning("RESEND_API_KEY not set. Cannot send background email.", to_email=to_email)
        return False
        
    try:
        resend.Emails.send({
            "from": "Aurex <notifications@noreply.heyaurex.com>",
            "to": [to_email],
            "subject": subject,
            "text": text
        })
        logger.info("Background email sent successfully", to_email=to_email)
        return True
    except Exception as e:
        logger.error("Failed to send background email", error=str(e), to_email=to_email)
        raise e
