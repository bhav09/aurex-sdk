"""
FastAPI Routes for Aurex Backend
"""

import os
from fastapi import APIRouter, Depends, Request, HTTPException, Query, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, desc
from typing import List, Optional, Dict
from datetime import datetime
from pydantic import BaseModel

from src.database import get_db
from src.models import (
    LLMEvent,
    LLMEventCreate,
    LLMEventResponse,
    AuditSession,
    AuditSessionCreate,
    AuditSessionUpdate,
    AuditSessionResponse,
    AuditHistoryResponse
)
from src.utils.logger import get_logger

from . import auth
from .auth import get_current_user, get_current_user_optional

router = APIRouter()
logger = get_logger(__name__)
router.include_router(auth.router, prefix="/auth", tags=["auth"])


@router.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Aurex Backend",
        "version": "1.0.0"
    }


@router.get("/events", response_model=List[LLMEventResponse])
async def get_events(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    workflow_id: Optional[str] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Get LLM events with optional filtering
    """
    from src.models import AuditSession
    
    # Enforce tenant isolation
    sessions_query = select(AuditSession.id).where(func.lower(AuditSession.email) == func.lower(current_user))
    result = await db.execute(sessions_query)
    session_ids = [row[0] for row in result.all()]
    
    if not session_ids:
        return []
    
    query = select(LLMEvent).where(LLMEvent.upload_session_id.in_(session_ids))
    
    if workflow_id:
        query = query.where(LLMEvent.workflow_id == workflow_id)
    if provider:
        query = query.where(LLMEvent.provider == provider)
    if model:
        query = query.where(LLMEvent.model == model)
    
    query = query.order_by(desc(LLMEvent.timestamp)).offset(skip).limit(limit)
    
    events_result = await db.execute(query)
    return events_result.scalars().all()


@router.get("/workflows")
async def get_workflows(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Get list of all workflows with summary statistics
    """
    from src.models import AuditSession
    
    # Enforce tenant isolation
    sessions_query = select(AuditSession.id).where(func.lower(AuditSession.email) == func.lower(current_user))
    result = await db.execute(sessions_query)
    session_ids = [row[0] for row in result.all()]
    
    if not session_ids:
        return []
        
    # Group by workflow_id and get aggregates
    workflows_query = select(
        LLMEvent.workflow_id,
        func.count(LLMEvent.id).label('event_count'),
        func.sum(LLMEvent.cost).label('total_cost'),
        func.sum(LLMEvent.total_tokens).label('total_tokens'),
        func.min(LLMEvent.timestamp).label('start_time'),
        func.max(LLMEvent.timestamp).label('end_time')
    ).where(
        LLMEvent.workflow_id.isnot(None),
        LLMEvent.upload_session_id.in_(session_ids)
    ).group_by(
        LLMEvent.workflow_id
    )
    
    workflows_result = await db.execute(workflows_query)
    workflows = workflows_result.all()
    
    result = []
    for wf in workflows:
        result.append({
            "workflow_id": wf.workflow_id,
            "event_count": wf.event_count,
            "total_cost": round(wf.total_cost, 4) if wf.total_cost else 0,
            "total_tokens": wf.total_tokens or 0,
            "start_time": wf.start_time.isoformat() if wf.start_time else None,
            "end_time": wf.end_time.isoformat() if wf.end_time else None
        })
    
    return result


@router.get("/insights")
async def get_insights(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Get overall insights and detected issues across all events.
    Retrieves or dynamically computes the analysis results from the latest session.
    """
    from src.models import AuditSession
    from src.detection.engine import EnhancedDetectionEngine
    
    try:
        # Get absolute latest session for the user
        query = select(AuditSession).where(
            func.lower(AuditSession.email) == func.lower(current_user)
        ).order_by(desc(AuditSession.created_at))
        
        result = await db.execute(query)
        latest_session = result.scalars().first()
        
        if not latest_session:
            return {"aggregations": {}, "insights": []}
            
        if not latest_session.analysis_results:
            engine = EnhancedDetectionEngine(db, session_id=latest_session.id)
            analysis = await engine.analyze_complete()
            latest_session.analysis_results = analysis
            latest_session.credit_score = analysis.get("credit_score", 100)
            await db.commit()
            await db.refresh(latest_session)
            
        return latest_session.analysis_results
    except Exception as e:
        logger.exception("Error loading or generating insights")
        return {"aggregations": {}, "insights": [], "error": str(e)}


@router.get("/executive-summary")
async def get_executive_summary(
    email: str = Query(..., description="User email"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Get executive-level summary with C-suite friendly formatting
    """
    # Enforce resource ownership
    if current_user != email:
        raise HTTPException(status_code=403, detail="Not authorized to access this data")
        
    try:
        from src.models import AuditSession
        from src.detection.engine import EnhancedDetectionEngine
        
        # Get absolute latest session for the user
        query = select(AuditSession).where(
            func.lower(AuditSession.email) == func.lower(current_user)
        ).order_by(desc(AuditSession.created_at))
        
        result = await db.execute(query)
        latest_session = result.scalars().first()
        
        if not latest_session:
            return {"executive_summary": {}}
            
        if not latest_session.analysis_results:
            engine = EnhancedDetectionEngine(db, session_id=latest_session.id)
            analysis = await engine.analyze_complete()
            latest_session.analysis_results = analysis
            latest_session.credit_score = analysis.get("credit_score", 100)
            await db.commit()
            await db.refresh(latest_session)
            
        return latest_session.analysis_results
    
    except Exception as e:
        logger.exception("Error generating executive summary", email=email)
        raise HTTPException(status_code=500, detail=f"Error generating executive summary: {str(e)}")


@router.get("/insights/{workflow_id}")
async def get_workflow_insights(
    workflow_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get insights for a specific workflow
    """
    # Currently unsupported since Python detection is gone and workflow insights are not precomputed yet
    return {"insights": []}


@router.delete("/clear-data")
async def clear_data(
    confirm: bool = Query(False, description="Must be true to confirm deletion"),
    db: AsyncSession = Depends(get_db)
):
    """
    Clear all LLM events from the database
    
    WARNING: This endpoint is disabled in production for security.
    """
    raise HTTPException(
        status_code=403,
        detail="Disabled in production"
    )

@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Get overall statistics
    """
    from src.models import AuditSession
    
    sessions_query = select(AuditSession.id).where(func.lower(AuditSession.email) == func.lower(current_user))
    result = await db.execute(sessions_query)
    session_ids = [row[0] for row in result.all()]
    
    if not session_ids:
        return {
            "total_events": 0,
            "total_cost": 0,
            "total_tokens": 0,
            "unique_workflows": 0,
            "unique_models": 0,
            "date_range": {
                "first_event": None,
                "last_event": None
            }
        }
        
    total_events_query = select(func.count(LLMEvent.id)).where(LLMEvent.upload_session_id.in_(session_ids))
    total_events = (await db.execute(total_events_query)).scalar()
    
    total_cost_query = select(func.sum(LLMEvent.cost)).where(LLMEvent.upload_session_id.in_(session_ids))
    total_cost = (await db.execute(total_cost_query)).scalar() or 0
    
    total_tokens_query = select(func.sum(LLMEvent.total_tokens)).where(LLMEvent.upload_session_id.in_(session_ids))
    total_tokens = (await db.execute(total_tokens_query)).scalar() or 0
    
    unique_workflows_query = select(func.count(func.distinct(LLMEvent.workflow_id))).where(LLMEvent.upload_session_id.in_(session_ids))
    unique_workflows = (await db.execute(unique_workflows_query)).scalar()
    
    unique_models_query = select(func.count(func.distinct(LLMEvent.model))).where(LLMEvent.upload_session_id.in_(session_ids))
    unique_models = (await db.execute(unique_models_query)).scalar()
    
    # Date range
    first_event_query = select(func.min(LLMEvent.timestamp)).where(LLMEvent.upload_session_id.in_(session_ids))
    first_event = (await db.execute(first_event_query)).scalar()
    
    last_event_query = select(func.max(LLMEvent.timestamp)).where(LLMEvent.upload_session_id.in_(session_ids))
    last_event = (await db.execute(last_event_query)).scalar()
    
    return {
        "total_events": total_events,
        "total_cost": round(total_cost, 4),
        "total_tokens": total_tokens,
        "unique_workflows": unique_workflows,
        "unique_models": unique_models,
        "date_range": {
            "first_event": first_event.isoformat() if first_event else None,
            "last_event": last_event.isoformat() if last_event else None
        }
    }




@router.post("/upload/csv")
async def upload_csv(
    file: UploadFile = File(...),
    session_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Upload and parse LLM usage CSV/JSON log file.
    Inserts parsed events into database linked to the session_id.
    """
    import pandas as pd
    import io
    from datetime import datetime
    import uuid
    from src.utils.pricing import calculate_cost, extract_provider_from_model
    
    contents = await file.read()
    filename = file.filename.lower()
    
    try:
        if filename.endswith(".json"):
            import json
            raw_data = json.loads(contents.decode("utf-8"))
            if isinstance(raw_data, dict):
                raw_data = [raw_data]
            chunks = [pd.DataFrame(raw_data)]
        else:
            chunks = pd.read_csv(io.BytesIO(contents), chunksize=1000)
    except Exception as e:
        logger.exception("Failed to read upload file")
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV/JSON: {str(e)}")
        
    def clean_header(h):
        h = str(h).strip().lower()
        h = h.replace(" ", "_").replace("-", "_").replace("(", "").replace(")", "")
        return h

    def parse_numeric(val):
        if pd.isna(val) or val is None:
            return 0
        if isinstance(val, (int, float)):
            return val
        s = str(val).strip().replace(",", "")
        try:
            if "." in s:
                return float(s)
            return int(s)
        except ValueError:
            return 0
            
    events_inserted = 0
    import json
    
    for chunk in chunks:
        chunk.columns = [clean_header(col) for col in chunk.columns]
        
        for idx, row in chunk.iterrows():
            # First, try to extract metadata dictionary
            meta_dict = {}
            for col in ["metadata", "jsonpayload", "payload", "labels", "resource"]:
                if col in row and pd.notna(row[col]):
                    val = row[col]
                    if isinstance(val, str):
                        val = val.strip()
                        if (val.startswith("{") and val.endswith("}")) or (val.startswith("[") and val.endswith("]")):
                            try:
                                val = json.loads(val)
                            except:
                                pass
                    if isinstance(val, dict):
                        meta_dict.update(val)
            
            ts_val = None
            for col in ["timestamp", "date", "created", "starting_at", "ending_at", "time", "logging_time"]:
                if col in row and pd.notna(row[col]) and not isinstance(row[col], dict):
                    try:
                        ts_val = pd.to_datetime(row[col])
                        break
                    except:
                        continue
            if ts_val is None and meta_dict:
                for k in ["timestamp", "date", "created", "starting_at", "ending_at", "time", "logging_time"]:
                    if k in meta_dict:
                        try:
                            ts_val = pd.to_datetime(meta_dict[k])
                            break
                        except:
                            continue
            if ts_val is None:
                ts_val = datetime.utcnow()
                
            model_val = None
            for col in ["model", "model_id", "modelid"]:
                if col in row and pd.notna(row[col]) and not isinstance(row[col], dict):
                    model_val = str(row[col]).strip()
                    break
            if (not model_val or model_val.lower() == "nan" or model_val.lower() == "unknown") and meta_dict:
                for k in ["model", "model_id", "modelid", "model_name"]:
                    if k in meta_dict:
                        model_val = str(meta_dict[k]).strip()
                        break
                        
            # Map files without model names (AWS Bedrock schema) to a default bedrock model
            if not model_val or model_val.lower() == "nan" or model_val.lower() == "unknown":
                is_bedrock = False
                bedrock_indicators = {"inputtokencount", "outputtokencount", "invocationlatency", "invocations"}
                if any(col in bedrock_indicators for col in row.index):
                    is_bedrock = True
                if is_bedrock:
                    model_val = "claude-3-5-sonnet"
                else:
                    model_val = "unknown"
                    
            input_tokens = 0
            for col in ["input_tokens", "prompt_tokens", "input_token_count", "inputtokencount", "n_context_tokens_total", "prompt_token_count"]:
                if col in row and pd.notna(row[col]) and not isinstance(row[col], dict):
                    try:
                        input_tokens = parse_numeric(row[col])
                        break
                    except:
                        continue
            if input_tokens == 0 and meta_dict:
                for k in ["input_token_count", "input_tokens", "prompt_tokens", "prompt_token_count"]:
                    if k in meta_dict:
                        input_tokens = parse_numeric(meta_dict[k])
                        break
                        
            output_tokens = 0
            for col in ["output_tokens", "completion_tokens", "output_token_count", "outputtokencount", "n_generated_tokens_total", "completion_token_count"]:
                if col in row and pd.notna(row[col]) and not isinstance(row[col], dict):
                    try:
                        output_tokens = parse_numeric(row[col])
                        break
                    except:
                        continue
            if output_tokens == 0 and meta_dict:
                for k in ["output_token_count", "output_tokens", "completion_tokens", "completion_token_count"]:
                    if k in meta_dict:
                        output_tokens = parse_numeric(meta_dict[k])
                        break
                        
            total_tokens = 0
            for col in ["total_tokens", "tokens", "total_token_count", "totaltokencount"]:
                if col in row and pd.notna(row[col]) and not isinstance(row[col], dict):
                    try:
                        total_tokens = parse_numeric(row[col])
                        break
                    except:
                        continue
            if total_tokens == 0 and meta_dict:
                for k in ["total_tokens", "tokens", "total_token_count", "totaltokencount"]:
                    if k in meta_dict:
                        total_tokens = parse_numeric(meta_dict[k])
                        break
            if total_tokens == 0:
                total_tokens = input_tokens + output_tokens
                
            cache_read_tokens = 0
            for col in ["cache_read_tokens", "cache_read_input_tokens", "cache_read_tokens_count", "cache_read"]:
                if col in row and pd.notna(row[col]) and not isinstance(row[col], dict):
                    try:
                        cache_read_tokens = parse_numeric(row[col])
                        break
                    except:
                        continue
            if cache_read_tokens == 0 and meta_dict:
                for k in ["cache_read_tokens", "cache_read_input_tokens", "cache_read_tokens_count", "cache_read"]:
                    if k in meta_dict:
                        cache_read_tokens = parse_numeric(meta_dict[k])
                        break
                        
            cache_creation_tokens = 0
            for col in ["cache_creation_tokens", "cache_creation_input_tokens", "cache_creation_tokens_count", "cache_creation", "cache_write_tokens"]:
                if col in row and pd.notna(row[col]) and not isinstance(row[col], dict):
                    try:
                        cache_creation_tokens = parse_numeric(row[col])
                        break
                    except:
                        continue
            if cache_creation_tokens == 0 and meta_dict:
                for k in ["cache_creation_tokens", "cache_creation_input_tokens", "cache_creation_tokens_count", "cache_creation", "cache_write_tokens"]:
                    if k in meta_dict:
                        cache_creation_tokens = parse_numeric(meta_dict[k])
                        break

            cost_val = 0.0
            for col in ["cost", "amount", "total_cost", "cost_usd", "total_cost_usd", "price"]:
                if col in row and pd.notna(row[col]) and not isinstance(row[col], dict):
                    try:
                        cost_val = parse_numeric(row[col])
                        break
                    except:
                        continue
            if cost_val == 0.0 and meta_dict:
                for k in ["cost", "amount", "total_cost", "cost_usd", "total_cost_usd", "price"]:
                    if k in meta_dict:
                        cost_val = parse_numeric(meta_dict[k])
                        break
            if cost_val == 0.0:
                cost_val = calculate_cost(
                    model_val, 
                    input_tokens, 
                    output_tokens,
                    cache_read_tokens=cache_read_tokens,
                    cache_creation_tokens=cache_creation_tokens
                )
                
            provider_val = extract_provider_from_model(model_val)
            
            workflow_id = None
            for col in ["workflow_id", "workflow", "session_id", "session"]:
                if col in row and pd.notna(row[col]) and col != "session_id" and not isinstance(row[col], dict):
                    workflow_id = str(row[col])
                    break
                    
            system_prompt_hash = None
            for col in ["system_prompt_hash", "systemprompt_hash", "systemprompthash", "prompt_hash", "prompthash", "sys_hash", "sys_prompt_hash"]:
                if col in row and pd.notna(row[col]) and not isinstance(row[col], dict):
                    system_prompt_hash = str(row[col])
                    break
                    
            context_length = None
            for col in ["context_length", "contextlength", "context_tokens", "contexttokens", "input_tokens", "prompt_tokens"]:
                if col in row and pd.notna(row[col]) and not isinstance(row[col], dict):
                    try:
                        context_length = parse_numeric(row[col])
                        break
                    except:
                        continue
            if context_length is None:
                context_length = input_tokens
                
            extra_metadata = {}
            for col in chunk.columns:
                if col not in ["timestamp", "date", "created", "starting_at", "ending_at", "time", "logging_time",
                               "model", "model_id", "modelid", "input_tokens", "prompt_tokens", 
                               "input_token_count", "inputtokencount", "n_context_tokens_total", "prompt_token_count",
                               "output_tokens", "completion_tokens", "output_token_count", "outputtokencount", 
                               "n_generated_tokens_total", "completion_token_count", "total_tokens", "tokens", 
                               "total_token_count", "totaltokencount", "cost", "amount", "total_cost", 
                               "cost_usd", "total_cost_usd", "price", "workflow_id", "workflow", "session_id", "session"]:
                    if pd.notna(row[col]):
                        val = row[col]
                        if hasattr(val, "item"):
                            val = val.item()
                        extra_metadata[col] = val
                        
            if meta_dict:
                extra_metadata.update(meta_dict)
                
            if system_prompt_hash:
                extra_metadata["system_prompt_hash"] = system_prompt_hash
                
            extra_metadata["cache_read_tokens"] = cache_read_tokens
            extra_metadata["cache_creation_tokens"] = cache_creation_tokens

            from src.models import LLMEvent
            event = LLMEvent(
                id=str(uuid.uuid4()),
                timestamp=ts_val.to_pydatetime() if hasattr(ts_val, "to_pydatetime") else ts_val,
                provider=provider_val,
                model=model_val,
                workflow_id=workflow_id,
                upload_session_id=session_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                cost=cost_val,
                prompt=str(row.get("prompt")) if "prompt" in row and pd.notna(row["prompt"]) else None,
                response=str(row.get("response")) if "response" in row and pd.notna(row["response"]) else None,
                system_prompt_hash=system_prompt_hash,
                context_length=context_length,
                extra_metadata=extra_metadata
            )
            db.add(event)
            events_inserted += 1
            
    await db.commit()
    logger.info("Events ingested successfully via upload", count=events_inserted, session_id=session_id)
    
    from src.utils.analytics import log_analytics_event
    log_analytics_event(
        event_type="file_upload",
        email=current_user,
        session_id=session_id,
        extra_metadata={
            "filename": file.filename,
            "events_ingested": events_inserted
        }
    )
    
    return {
        "status": "success",
        "events_ingested": events_inserted,
        "upload_session_id": session_id
    }


# ============================================================================
# AUDIT SESSION ENDPOINTS
# ============================================================================

@router.post("/audit/sessions", response_model=AuditSessionResponse)
async def create_audit_session(
    session_data: AuditSessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[str] = Depends(get_current_user_optional)
):
    """
    Create a new audit session with user information
    """
    from src.models import AuditSession
    import uuid
    import json
    from src.api.auth import redis_client
    
    email = session_data.email.lower()
    
    is_authenticated = False
    if current_user:
        if current_user.lower() == email:
            is_authenticated = True
        else:
            raise HTTPException(status_code=403, detail="Not authorized to create a session for this email")
            
    if not is_authenticated:
        otp_raw = await redis_client.get(f"otp:{email}")
        
        if not otp_raw:
            raise HTTPException(status_code=403, detail="Email verification required")
            
        otp_data = json.loads(otp_raw)
        if not otp_data.get("verified"):
            raise HTTPException(status_code=403, detail="Email verification required")
    
    try:
        # Create new audit session
        audit_session = AuditSession(
            id=str(uuid.uuid4()),
            user_name=session_data.user_name,
            email=session_data.email,
            company_name=session_data.company_name,
            file_name=session_data.file_name,
            file_type=session_data.file_type
        )

        
        db.add(audit_session)
        await db.commit()
        await db.refresh(audit_session)
        
        logger.info("Audit session created", session_id=audit_session.id, email=session_data.email)
        from src.utils.analytics import log_analytics_event
        log_analytics_event(
            event_type="session_create",
            email=session_data.email,
            session_id=audit_session.id,
            extra_metadata={
                "user_name": session_data.user_name,
                "company_name": session_data.company_name,
                "file_name": session_data.file_name,
                "file_type": session_data.file_type
            }
        )
        return audit_session
    
    except Exception as e:
        await db.rollback()
        logger.exception("Error creating audit session", error=str(e), email=session_data.email)
        raise HTTPException(status_code=500, detail=f"Error creating audit session: {str(e)}")


@router.patch("/audit/sessions/{session_id}", response_model=AuditSessionResponse)
async def update_audit_session(
    session_id: str,
    update_data: AuditSessionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Update audit session with analysis results
    """
    from src.models import AuditSession
    
    try:
        # Find session
        query = select(AuditSession).where(AuditSession.id == session_id)
        result = await db.execute(query)
        session = result.scalars().first()
        
        if not session:
            raise HTTPException(status_code=404, detail="Audit session not found")
            
        # IDOR check: Verify ownership
        if session.email.lower() != current_user.lower():
            raise HTTPException(status_code=403, detail="Not authorized to modify this session")
        
        # Update fields
        update_dict = update_data.dict(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(session, key, value)
        
        session.updated_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(session)
        
        logger.info("Audit session updated", session_id=session_id)
        from src.utils.analytics import log_analytics_event
        log_analytics_event(
            event_type="analysis_complete",
            email=current_user,
            session_id=session_id,
            extra_metadata={
                "credit_score": getattr(session, "credit_score", None),
                "total_cost": getattr(session, "total_cost", None),
                "wasted_cost": getattr(session, "wasted_cost", None),
                "waste_percentage": getattr(session, "waste_percentage", None)
            }
        )
        return session
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Error updating audit session", error=str(e), session_id=session_id)
        raise HTTPException(status_code=500, detail=f"Error updating audit session: {str(e)}")


@router.get("/audit/sessions/{session_id}", response_model=AuditSessionResponse)
async def get_audit_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Get a specific audit session by ID
    """
    from src.models import AuditSession
    
    query = select(AuditSession).where(AuditSession.id == session_id)
    result = await db.execute(query)
    session = result.scalars().first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Audit session not found")
        
    # IDOR check: Verify ownership
    if session.email.lower() != current_user.lower():
        raise HTTPException(status_code=403, detail="Not authorized to access this session")
    
    return session


@router.get("/audit/history/{email}", response_model=AuditHistoryResponse)
async def get_audit_history(
    email: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Get audit history for a specific email address
    
    Returns all past audits for the user, sorted by most recent first.
    """
    if current_user != email:
        raise HTTPException(status_code=403, detail="Not authorized to access this data")
        
    from src.models import AuditSession
    
    try:
        # Get total count
        count_query = select(func.count(AuditSession.id)).where(AuditSession.email == email)
        total = (await db.execute(count_query)).scalar()
        
        # Get sessions
        sessions_query = select(AuditSession).where(
            AuditSession.email == email
        ).order_by(
            desc(AuditSession.created_at)
        ).offset(skip).limit(limit)
        
        sessions_result = await db.execute(sessions_query)
        sessions = sessions_result.scalars().all()
        
        return {
            "sessions": sessions,
            "total": total
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching audit history: {str(e)}")


@router.get("/audit/company/{company_name}")
async def get_company_audits(
    company_name: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Get all audits for a specific company
    
    Useful for company-level analytics and tracking.
    """
    from src.models import AuditSession
    
    domain = current_user.split("@")[1].lower() if "@" in current_user else ""
    generic_domains = {
        "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", 
        "aol.com", "zoho.com", "protonmail.com", "proton.me", "mail.com", 
        "yandex.com", "live.com", "gmx.com"
    }
    
    # Check if they have an active session with this company
    user_sessions_query = select(func.count(AuditSession.id)).where(
        func.lower(AuditSession.email) == func.lower(current_user),
        func.lower(AuditSession.company_name) == func.lower(company_name)
    )
    user_sessions = (await db.execute(user_sessions_query)).scalar()
    
    # Check domain alignment (exclude generic domains)
    domain_allowed = False
    if domain and domain not in generic_domains:
        domain_name = domain.split(".")[0]
        if (company_name.lower() == domain or 
            company_name.lower() == domain_name or 
            domain in company_name.lower() or 
            domain_name in company_name.lower()):
            domain_allowed = True
            
    if not user_sessions and not domain_allowed:
        raise HTTPException(status_code=403, detail="Not authorized to access company data")
        
    
    try:
        # Get total count
        count_query = select(func.count(AuditSession.id)).where(AuditSession.company_name == company_name)
        total = (await db.execute(count_query)).scalar()
        
        # Get sessions
        sessions_query = select(AuditSession).where(
            AuditSession.company_name == company_name
        ).order_by(
            desc(AuditSession.created_at)
        ).offset(skip).limit(limit)
        
        sessions_result = await db.execute(sessions_query)
        sessions = sessions_result.scalars().all()
        
        # Calculate company-level stats
        avg_score_query = select(func.avg(AuditSession.credit_score)).where(
            AuditSession.company_name == company_name,
            AuditSession.credit_score.isnot(None)
        )
        avg_score = (await db.execute(avg_score_query)).scalar()
        
        total_wasted_query = select(func.sum(AuditSession.wasted_cost)).where(
            AuditSession.company_name == company_name,
            AuditSession.wasted_cost.isnot(None)
        )
        total_wasted = (await db.execute(total_wasted_query)).scalar()
        
        return {
            "company_name": company_name,
            "total_audits": total,
            "average_credit_score": round(avg_score, 1) if avg_score else None,
            "total_wasted_cost": round(total_wasted, 2) if total_wasted else 0,
            "sessions": [
                {
                    "id": s.id,
                    "user_name": s.user_name,
                    "email": s.email,
                    "credit_score": s.credit_score,
                    "wasted_cost": s.wasted_cost,
                    "created_at": s.created_at.isoformat()
                }
                for s in sessions
            ]
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching company audits: {str(e)}")


@router.delete("/audit/sessions/{session_id}")
async def delete_audit_session(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a specific audit session
    
    WARNING: This endpoint is disabled in production for security.
    """
    raise HTTPException(
        status_code=403,
        detail="Disabled in production"
    )


class ClickEventPayload(BaseModel):
    button_id: str
    email: Optional[str] = None
    session_id: Optional[str] = None


@router.post("/analytics/click")
async def track_click(
    payload: ClickEventPayload
):
    """
    Track a frontend CTA button click and log to analytics.
    """
    from src.utils.analytics import log_analytics_event
    log_analytics_event(
        event_type="button_click",
        event_name=payload.button_id,
        email=payload.email,
        session_id=payload.session_id
    )
    return {"status": "success"}


class OptimizationRequest(BaseModel):
    issue_type: str
    issue_title: str
    weekly_cost: float
    one_line_summary: str
    message: str
    chat_history: Optional[List[Dict[str, str]]] = []


@router.post("/optimization/generate")
async def generate_optimization(
    payload: OptimizationRequest,
    current_user: str = Depends(get_current_user)
):
    """
    Generate interactive, contextual engineering optimizations for the copilot agent.
    """
    issue_type = payload.issue_type.lower()
    msg = payload.message.lower()
    
    # Initialize response with tailored technical remediation guidance
    response = ""
    
    if "code" in msg or "fix" in msg or "snippet" in msg or "how to" in msg or "implement" in msg:
        if "prompt" in issue_type or "system" in issue_type or "cache" in issue_type:
            response = (
                "Here is the production-ready code snippet to implement **Prompt Caching** for your static system instructions. "
                "This moves repeated prompt headers to ephemeral cache, cutting costs by up to 50% on Anthropic and 80% on DeepSeek:\n\n"
                "```python\n"
                "# For Anthropic Claude (cache-control block)\n"
                "import anthropic\n"
                "client = anthropic.Anthropic()\n\n"
                "response = client.messages.create(\n"
                "    model=\"claude-3-5-sonnet-20241022\",\n"
                "    max_tokens=1024,\n"
                "    system=[\n"
                "        {\n"
                "            \"type\": \"text\",\n"
                "            \"text\": \"You are a helpful assistant executing complex data audits...\",\n"
                "            \"cache_control\": {\"type\": \"ephemeral\"}  # Marks this block for caching\n"
                "        }\n"
                "    ],\n"
                "    messages=[{\"role\": \"user\", \"content\": \"Analyze this dataset.\"}]\n"
                ")\n"
                "```\n\n"
                "And here is how to verify cache hits in the response:\n"
                "```python\n"
                "print(response.usage.cache_read_input_tokens) # Tokens read from cache (cheap!)\n"
                "print(response.usage.cache_creation_input_tokens) # Tokens written to cache\n"
                "```"
            )
        elif "model" in issue_type or "expensive" in issue_type or "misuse" in issue_type:
            response = (
                "To optimize model routes and avoid expensive models for low-complexity inputs, you can introduce a "
                "**Dynamic Router Middleware**:\n\n"
                "```python\n"
                "import tiktoken\n\n"
                "def estimate_tokens(text: str) -> int:\n"
                "    encoding = tiktoken.encoding_for_model(\"gpt-4o\")\n"
                "    return len(encoding.encode(text))\n\n"
                "def route_request(prompt: str) -> str:\n"
                "    token_count = estimate_tokens(prompt)\n"
                "    \n"
                "    # Route simple queries (< 200 tokens) to the faster, cheaper mini model\n"
                "    if token_count < 200:\n"
                "        return \"gpt-4o-mini\"\n"
                "    return \"gpt-4o\"\n"
                "```\n\n"
                "This guarantees that lightweight tasks (like classification or yes/no assertions) are run on $0.15/1M token models instead of $2.50/1M token models."
            )
        elif "loop" in issue_type or "agent" in issue_type:
            response = (
                "Here is the standard middleware to prevent **Agent Loops** (monotonic context growth or rapid retries) "
                "from consuming your API budget. This maintains a running counter of execution steps and raises an exception if a loop is detected:\n\n"
                "```python\n"
                "import time\n"
                "from collections import defaultdict\n\n"
                "class LoopDetector:\n"
                "    def __init__(self, max_steps: int = 5, window_seconds: float = 60.0):\n"
                "        self.max_steps = max_steps\n"
                "        self.window_seconds = window_seconds\n"
                "        self.history = defaultdict(list) # session_id -> list of timestamps\n\n"
                "    def record_step(self, session_id: str):\n"
                "        now = time.time()\n"
                "        timestamps = self.history[session_id]\n"
                "        # Remove timestamps outside window\n"
                "        self.history[session_id] = [t for t in timestamps if now - t < self.window_seconds]\n"
                "        self.history[session_id].append(now)\n"
                "        \n"
                "        if len(self.history[session_id]) > self.max_steps:\n"
                "            raise RuntimeError(f\"Agent Loop Detected for session {session_id}! Aborting to save tokens.\")\n"
                "```"
            )
        elif "explosion" in issue_type or "context" in issue_type:
            response = (
                "To resolve context explosion issues, you should limit context growth by trimming older history "
                "or summarizing old turns before passing them back to the model. Here is a python helper:\n\n"
                "```python\n"
                "def truncate_chat_history(messages: list, max_tokens: int = 4000) -> list:\n"
                "    # Keep system message, keep latest N turns within token budget\n"
                "    system_msg = [m for m in messages if m.get(\"role\") == \"system\"]\n"
                "    user_assistant_msgs = [m for m in messages if m.get(\"role\") != \"system\"]\n"
                "    \n"
                "    truncated = []\n"
                "    total_tokens = 0\n"
                "    \n"
                "    # Iterate backwards to keep the most recent messages\n"
                "    for msg in reversed(user_assistant_msgs):\n"
                "        msg_tokens = len(msg[\"content\"]) // 4 # Simple approximation\n"
                "        if total_tokens + msg_tokens > max_tokens:\n"
                "            break\n"
                "        truncated.insert(0, msg)\n"
                "        total_tokens += msg_tokens\n"
                "        \n"
                "    return system_msg + truncated\n"
                "```"
            )
        else:
            response = (
                "Here is a generic recommendation template for this issue:\n\n"
                "```python\n"
                "# 1. Monitor token ingestion metrics\n"
                "# 2. Configure rate limits and retry guardrails\n"
                "def execute_remediation(payload):\n"
                "    # Implement your custom logic here\n"
                "    pass\n"
                "```"
            )
    elif "why" in msg or "explain" in msg or "cause" in msg:
        response = (
            f"The primary driver of the **{payload.issue_title}** issue is redundancy in model operations. "
            f"According to the audit logs, this is causing a weekly loss of **${payload.weekly_cost:.2f}**.\n\n"
            f"**Underlying Cause:**\n"
            f"1. *{payload.one_line_summary}*\n"
            f"2. High frequency call triggers with no intermediate client-side caching or state sharing.\n"
            f"3. Over-provisioning capabilities (e.g. running basic reasoning queries on flagship models)."
        )
    else:
        response = (
            f"Hello! I am your Aurex Agent. I'm ready to help you optimize and remediate **{payload.issue_title}** "
            f"(saving you **${payload.weekly_cost:.2f}/week**).\n\n"
            f"Would you like me to:\n"
            f"- Generate a production-ready **python code patch** for this issue?\n"
            f"- Explain the **architectural cause** of the leak?\n"
            f"- Outline the **confidence score** or effort parameters for the remediation?"
        )
        
    return {"response": response}


