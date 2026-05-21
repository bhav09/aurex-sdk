"""
FastAPI Routes for Aurex Backend
"""

import os
from fastapi import APIRouter, Depends, Request, HTTPException, Query, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, desc
from typing import List, Optional
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
            df = pd.read_json(io.BytesIO(contents))
        else:
            df = pd.read_csv(io.BytesIO(contents))
    except Exception as e:
        logger.exception("Failed to read upload file")
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV/JSON: {str(e)}")
        
    def clean_header(h):
        h = str(h).strip().lower()
        h = h.replace(" ", "_").replace("-", "_").replace("(", "").replace(")", "")
        return h
        
    df.columns = [clean_header(col) for col in df.columns]
    
    events_inserted = 0
    
    for idx, row in df.iterrows():
        ts_val = None
        for col in ["timestamp", "date", "created", "starting_at", "ending_at", "time"]:
            if col in row and pd.notna(row[col]):
                try:
                    ts_val = pd.to_datetime(row[col])
                    break
                except:
                    continue
        if ts_val is None:
            ts_val = datetime.utcnow()
            
        model_val = "unknown"
        for col in ["model", "model_id", "modelid"]:
            if col in row and pd.notna(row[col]):
                model_val = str(row[col])
                break
                
        input_tokens = 0
        for col in ["input_tokens", "prompt_tokens", "input_token_count", "inputtokencount", "n_context_tokens_total", "prompt_token_count"]:
            if col in row and pd.notna(row[col]):
                try:
                    input_tokens = int(row[col])
                    break
                except:
                    continue
                    
        output_tokens = 0
        for col in ["output_tokens", "completion_tokens", "output_token_count", "outputtokencount", "n_generated_tokens_total", "completion_token_count"]:
            if col in row and pd.notna(row[col]):
                try:
                    output_tokens = int(row[col])
                    break
                except:
                    continue
                    
        total_tokens = 0
        for col in ["total_tokens", "tokens", "total_token_count", "totaltokencount"]:
            if col in row and pd.notna(row[col]):
                try:
                    total_tokens = int(row[col])
                    break
                except:
                    continue
        if total_tokens == 0:
            total_tokens = input_tokens + output_tokens
            
        cost_val = 0.0
        for col in ["cost", "amount", "total_cost", "cost_usd", "total_cost_usd", "price"]:
            if col in row and pd.notna(row[col]):
                try:
                    cost_val = float(row[col])
                    break
                except:
                    continue
        if cost_val == 0.0:
            cost_val = calculate_cost(model_val, input_tokens, output_tokens)
            
        provider_val = extract_provider_from_model(model_val)
        
        workflow_id = None
        for col in ["workflow_id", "workflow", "session_id", "session"]:
            if col in row and pd.notna(row[col]) and col != "session_id":
                workflow_id = str(row[col])
                break
                
        # Extract system_prompt_hash
        system_prompt_hash = None
        for col in ["system_prompt_hash", "systemprompt_hash", "systemprompthash", "prompt_hash", "prompthash", "sys_hash", "sys_prompt_hash"]:
            if col in row and pd.notna(row[col]):
                system_prompt_hash = str(row[col])
                break
                
        # Extract context_length
        context_length = None
        for col in ["context_length", "contextlength", "context_tokens", "contexttokens", "input_tokens", "prompt_tokens"]:
            if col in row and pd.notna(row[col]):
                try:
                    context_length = int(row[col])
                    break
                except:
                    continue
        if context_length is None:
            context_length = input_tokens
            
        # Put extra fields in extra_metadata
        extra_metadata = {}
        for col in df.columns:
            if col not in ["timestamp", "date", "created", "starting_at", "ending_at", "time", 
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
                    
        if system_prompt_hash:
            extra_metadata["system_prompt_hash"] = system_prompt_hash

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
    
    # Simple check: current user must have the company domain in their email
    # A robust check would look at user's actual registered company in DB
    domain = current_user.split("@")[1] if "@" in current_user else ""
    # We verify if they are allowed by checking if they've had any sessions with this company
    user_sessions_query = select(func.count(AuditSession.id)).where(
        AuditSession.email == current_user,
        AuditSession.company_name == company_name
    )
    user_sessions = (await db.execute(user_sessions_query)).scalar()
    
    if not user_sessions and domain.lower() not in company_name.lower():
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


