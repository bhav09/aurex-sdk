import os
import json
from datetime import datetime
from typing import Dict, Any, Optional
from app.config import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)

# BigQuery Client Initialization
bq_client = None
bq_table_id = None

# Local Fallback File
BACKUP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
BACKUP_FILE = os.path.join(BACKUP_DIR, "analytics_events.jsonl")

def init_bigquery():
    global bq_client, bq_table_id
    credentials_path = getattr(settings, "google_application_credentials", "/Users/bhavishya/VSC Projects/tbank/aurex-495417-8ed2dc84792c.json")
    
    if not os.path.exists(credentials_path):
        logger.warning("Google Application Credentials file not found. Analytics will fall back to local logs.", path=credentials_path)
        return False
        
    try:
        from google.cloud import bigquery
        from google.oauth2 import service_account
        
        # Explicitly load credentials
        credentials = service_account.Credentials.from_service_account_file(credentials_path)
        bq_client = bigquery.Client(project="aurex-495417", credentials=credentials)
        
        # Enforce dataset & table existence
        dataset_id = f"{bq_client.project}.aurex_analytics"
        dataset = bigquery.Dataset(dataset_id)
        dataset.location = "US"
        
        try:
            bq_client.get_dataset(dataset_id)
        except Exception:
            # Create dataset if missing
            logger.info("Creating BigQuery dataset", dataset_id=dataset_id)
            bq_client.create_dataset(dataset, timeout=30)
            
        bq_table_id = f"{dataset_id}.events"
        
        schema = [
            bigquery.SchemaField("timestamp", "TIMESTAMP", mode="REQUIRED"),
            bigquery.SchemaField("event_type", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("event_name", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("email", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("session_id", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("metadata", "STRING", mode="NULLABLE"),
        ]
        
        table = bigquery.Table(bq_table_id, schema=schema)
        try:
            bq_client.get_table(bq_table_id)
        except Exception:
            logger.info("Creating BigQuery table", table_id=bq_table_id)
            bq_client.create_table(table, timeout=30)
            
        logger.info("BigQuery Analytics Client initialized successfully", table_id=bq_table_id)
        return True
    except Exception as e:
        logger.error("Failed to initialize Google BigQuery client. Falling back to local logging.", error=str(e))
        return False

# Initialize at startup
init_bigquery()

def log_analytics_event(
    event_type: str,
    event_name: Optional[str] = None,
    email: Optional[str] = None,
    session_id: Optional[str] = None,
    extra_metadata: Optional[Dict[str, Any]] = None
):
    """
    Log an analytics event to Google BigQuery with a robust local fallback.
    """
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    # Serialize metadata to string
    meta_str = json.dumps(extra_metadata) if extra_metadata else None
    
    row = {
        "timestamp": timestamp,
        "event_type": event_type,
        "event_name": event_name,
        "email": email,
        "session_id": session_id,
        "metadata": meta_str
    }
    
    # 1. Local Fallback Logging (Always write locally to ensure zero data loss)
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        with open(BACKUP_FILE, "a") as f:
            f.write(json.dumps(row) + "\n")
    except Exception as e:
        logger.error("Failed to write local backup analytics log", error=str(e))
        
    # 2. BigQuery Streaming Insert
    global bq_client, bq_table_id
    if bq_client and bq_table_id:
        try:
            errors = bq_client.insert_rows_json(bq_table_id, [row])
            if errors:
                logger.error("BigQuery insert_rows_json returned errors", errors=errors)
            else:
                logger.info("Analytics event successfully streamed to BigQuery", event_type=event_type, event_name=event_name)
        except Exception as e:
            logger.error("Failed to stream event to BigQuery", error=str(e))
            if "expired" in str(e).lower() or "auth" in str(e).lower():
                init_bigquery()
    else:
        init_bigquery()
