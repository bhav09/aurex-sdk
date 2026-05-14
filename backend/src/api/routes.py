"""
FastAPI Routes for Aurex Backend
"""

import os
from fastapi import APIRouter, Depends, UploadFile, File, Request, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

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
from src.ingestion import ingest_csv_file, ingest_llm_use_sessions, ingest_single_json_file
from src.detection import analyze_workflow, analyze_all
from src.detection.enhanced_engine import EnhancedDetectionEngine
from sqlalchemy import func, desc
from src.utils.logger import get_logger

from . import auth
from .auth import get_current_user

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
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Get LLM events with optional filtering
    
    Query parameters:
    - skip: Number of records to skip (pagination)
    - limit: Maximum number of records to return
    - workflow_id: Filter by workflow ID
    - provider: Filter by provider (openai, anthropic, ollama)
    - model: Filter by model name
    """
    from src.models import AuditSession
    
    query = db.query(LLMEvent)
    
    # Enforce tenant isolation (only see events uploaded in sessions owned by current_user)
    sessions = db.query(AuditSession.id).filter(func.lower(AuditSession.email) == func.lower(current_user)).all()
    session_ids = [s[0] for s in sessions]
    if session_ids:
        query = query.filter(LLMEvent.upload_session_id.in_(session_ids))
    else:
        # Return empty if user has no sessions
        return []
    
    if workflow_id:
        query = query.filter(LLMEvent.workflow_id == workflow_id)
    if provider:
        query = query.filter(LLMEvent.provider == provider)
    if model:
        query = query.filter(LLMEvent.model == model)
    
    events = query.order_by(desc(LLMEvent.timestamp)).offset(skip).limit(limit).all()
    
    return events


@router.get("/workflows")
async def get_workflows(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Get list of all workflows with summary statistics
    """
    from src.models import AuditSession
    
    # Enforce tenant isolation
    sessions = db.query(AuditSession.id).filter(func.lower(AuditSession.email) == func.lower(current_user)).all()
    session_ids = [s[0] for s in sessions]
    if not session_ids:
        return []
        
    # Group by workflow_id and get aggregates
    workflows = db.query(
        LLMEvent.workflow_id,
        func.count(LLMEvent.id).label('event_count'),
        func.sum(LLMEvent.cost).label('total_cost'),
        func.sum(LLMEvent.total_tokens).label('total_tokens'),
        func.min(LLMEvent.timestamp).label('start_time'),
        func.max(LLMEvent.timestamp).label('end_time')
    ).filter(
        LLMEvent.workflow_id.isnot(None),
        LLMEvent.upload_session_id.in_(session_ids)
    ).group_by(
        LLMEvent.workflow_id
    ).all()
    
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
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Get overall insights and detected issues across all events
    """
    from src.models import AuditSession
    
    # Analyze with enhanced engine for the specific user
    engine = EnhancedDetectionEngine(db, email=current_user)
    analysis = engine.analyze_complete()
    
    sessions = db.query(AuditSession.id).filter(func.lower(AuditSession.email) == func.lower(current_user)).all()
    session_ids = [s[0] for s in sessions]
    
    if not session_ids:
        return analysis
    
    # Add additional aggregations for the user's data
    total_events = db.query(func.count(LLMEvent.id)).filter(
        LLMEvent.upload_session_id.in_(session_ids)
    ).scalar()
    
    # Cost by provider
    provider_costs = db.query(
        LLMEvent.provider,
        func.sum(LLMEvent.cost).label('total_cost')
    ).filter(
        LLMEvent.upload_session_id.in_(session_ids)
    ).group_by(LLMEvent.provider).all()
    
    # Cost by model
    model_costs = db.query(
        LLMEvent.model,
        func.sum(LLMEvent.cost).label('total_cost'),
        func.count(LLMEvent.id).label('count')
    ).filter(
        LLMEvent.upload_session_id.in_(session_ids)
    ).group_by(LLMEvent.model).order_by(desc('total_cost')).limit(10).all()
    
    # Daily costs
    daily_costs = db.query(
        func.date(LLMEvent.timestamp).label('date'),
        func.sum(LLMEvent.cost).label('total_cost')
    ).filter(
        LLMEvent.upload_session_id.in_(session_ids)
    ).group_by(func.date(LLMEvent.timestamp)).order_by('date').all()
    
    analysis["aggregations"] = {
        "total_events": total_events,
        "provider_breakdown": {
            p.provider: round(p.total_cost, 4) if p.total_cost else 0 for p in provider_costs if p.provider
        },
        "top_models": [
            {
                "model": m.model,
                "cost": round(m.total_cost, 4) if m.total_cost else 0,
                "count": m.count
            }
            for m in model_costs if m.model
        ],
        "daily_costs": [
            {
                "date": str(d.date),
                "cost": round(d.total_cost, 4) if d.total_cost else 0
            }
            for d in daily_costs if d.date
        ]
    }
    
    return analysis


@router.get("/executive-summary")
async def get_executive_summary(
    email: str = Query(..., description="User email"),
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Get executive-level summary with C-suite friendly formatting
    
    Returns:
    - Big red number (wasted cost)
    - Top 3 issues with one-click fixes
    - Workflow cost breakdown
    - ROI projections
    """
    # Enforce resource ownership
    if current_user != email:
        raise HTTPException(status_code=403, detail="Not authorized to access this data")
        
    try:
        engine = EnhancedDetectionEngine(db, email=email)
        analysis = engine.analyze_complete()
        
        return analysis
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating executive summary: {str(e)}")


@router.get("/insights/{workflow_id}")
async def get_workflow_insights(
    workflow_id: str,
    db: Session = Depends(get_db)
):
    """
    Get insights for a specific workflow
    """
    # Check if workflow exists
    workflow_exists = db.query(LLMEvent).filter(
        LLMEvent.workflow_id == workflow_id
    ).first()
    
    if not workflow_exists:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    analysis = analyze_workflow(db, workflow_id)
    
    return analysis


@router.delete("/clear-data")
async def clear_data(
    confirm: bool = Query(False, description="Must be true to confirm deletion"),
    db: Session = Depends(get_db)
):
    """
    Clear all LLM events from the database
    
    WARNING: This endpoint is disabled in production for security.
    """
    raise HTTPException(
        status_code=403,
        detail="Disabled in production"
    )


@router.post("/upload/csv")
async def upload_csv(
    file: UploadFile = File(...),
    csv_type: Optional[str] = Query(None, description="CSV type: anthropic, openai, or bedrock"),
    session_id: Optional[str] = Query(None, description="Existing AuditSession ID"),
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Upload and process CSV file from LLM providers
    
    Supported formats:
    - Anthropic usage export
    - OpenAI usage export
    - AWS Bedrock CloudWatch metrics
    
    Query parameters:
    - csv_type: Specify CSV format (auto-detected if not provided)
    """
    if not (file.filename.endswith('.csv') or file.filename.endswith('.json')):
        raise HTTPException(status_code=400, detail="File must be a CSV or JSON")
    
    # Verify session ownership if provided
    if session_id:
        from src.models import AuditSession
        session = db.query(AuditSession).filter(AuditSession.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Audit session not found")
        if session.email.lower() != current_user.lower():
            raise HTTPException(status_code=403, detail="Not authorized to use this session")
            
    # 50MB file size limit to prevent DoS
    MAX_FILE_SIZE = 50 * 1024 * 1024
    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File size exceeds the 50MB limit")
    
    try:
        # Read file content
        content = await file.read()
        
        # Double check size after reading
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File size exceeds the 50MB limit")
        
        # Parse CSV
        from io import BytesIO
        import uuid
        file_obj = BytesIO(content)
        
        # Generate or use provided upload session ID
        upload_session_id = session_id if session_id else str(uuid.uuid4())
        
        if file.filename.endswith('.json'):
            import json
            from src.ingestion.json_ingestion import parse_llm_use_session_data
            
            # Read JSON content
            try:
                session_data = json.loads(content.decode('utf-8'))
                
                # Check if it's an array of sessions or a single session
                if isinstance(session_data, list):
                    events = []
                    for item in session_data:
                        events.extend(parse_llm_use_session_data(item, "json-upload"))
                else:
                    events = parse_llm_use_session_data(session_data, "json-upload")
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid JSON format")
        else:
            # Process as CSV
            events = ingest_csv_file(file_obj, csv_type)
        
        if not events:
            raise HTTPException(status_code=400, detail="No events found in CSV")
        
        # Store events in database with upload_session_id
        # Optimize insertions using bulk_save_objects with chunking
        batch_size = 5000
        stored_count = 0
        current_batch = []
        
        for event_data in events:
            event_dict = event_data.dict()
            event_dict['upload_session_id'] = upload_session_id
            current_batch.append(LLMEvent(**event_dict))
            stored_count += 1
            
            if len(current_batch) >= batch_size:
                db.bulk_save_objects(current_batch)
                db.commit()
                current_batch = []
                
        if current_batch:
            db.bulk_save_objects(current_batch)
            db.commit()
        
        response = {
            "status": "success",
            "events_ingested": stored_count,
            "filename": file.filename,
            "csv_type": csv_type or "auto-detected",
            "upload_session_id": upload_session_id
        }
        
        logger.info("CSV uploaded", filename=file.filename, events_count=stored_count)
        return response
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.exception("Error processing CSV upload", error=str(e), filename=file.filename)
        raise HTTPException(status_code=500, detail=f"Error processing CSV: {str(e)}")


@router.post("/ingest/json")
async def ingest_json(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Upload and process JSON session file from llm-use
    """
    if not file.filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="File must be a JSON")
    
    # 50MB file size limit
    MAX_FILE_SIZE = 50 * 1024 * 1024
    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File size exceeds the 50MB limit")
    
    try:
        # Save temporarily
        import tempfile
        import os
        with tempfile.NamedTemporaryFile(delete=False, suffix='.json') as tmp:
            content = await file.read()
            if len(content) > MAX_FILE_SIZE:
                os.unlink(tmp.name)
                raise HTTPException(status_code=413, detail="File size exceeds the 50MB limit")
            tmp.write(content)
            tmp_path = tmp.name
        
        # Parse JSON
        events = ingest_single_json_file(tmp_path)
        
        if not events:
            os.unlink(tmp_path)
            raise HTTPException(status_code=400, detail="No events found in JSON")
        
        # Store events in database using bulk insert
        import uuid
        upload_session_id = str(uuid.uuid4())
        
        batch_size = 5000
        stored_count = 0
        current_batch = []
        
        for event_data in events:
            event_dict = event_data.dict()
            event_dict['upload_session_id'] = upload_session_id
            current_batch.append(LLMEvent(**event_dict))
            stored_count += 1
            
            if len(current_batch) >= batch_size:
                db.bulk_save_objects(current_batch)
                db.commit()
                current_batch = []
                
        if current_batch:
            db.bulk_save_objects(current_batch)
            db.commit()
        
        # Clean up temp file
        os.unlink(tmp_path)
        
        logger.info("JSON session uploaded", filename=file.filename, events_count=stored_count)
        return {
            "status": "success",
            "events_ingested": stored_count,
            "filename": file.filename
        }
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        logger.exception("Error processing JSON session upload", error=str(e), filename=file.filename)
        raise HTTPException(status_code=500, detail=f"Error processing JSON: {str(e)}")


@router.post("/ingest/llm-use-sessions")
async def ingest_sessions(
    session_dir: Optional[str] = Query(None, description="Path to llm-use sessions directory"),
    db: Session = Depends(get_db)
):
    """
    Ingest all session files from llm-use directory
    
    WARNING: This endpoint is disabled in production for security.
    """
    raise HTTPException(
        status_code=403,
        detail="Disabled in production"
    )


@router.get("/stats")
async def get_stats(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Get overall statistics
    """
    from src.models import AuditSession
    
    sessions = db.query(AuditSession.id).filter(func.lower(AuditSession.email) == func.lower(current_user)).all()
    session_ids = [s[0] for s in sessions]
    
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
        
    total_events = db.query(func.count(LLMEvent.id)).filter(
        LLMEvent.upload_session_id.in_(session_ids)
    ).scalar()
    
    total_cost = db.query(func.sum(LLMEvent.cost)).filter(
        LLMEvent.upload_session_id.in_(session_ids)
    ).scalar() or 0
    
    total_tokens = db.query(func.sum(LLMEvent.total_tokens)).filter(
        LLMEvent.upload_session_id.in_(session_ids)
    ).scalar() or 0
    
    unique_workflows = db.query(func.count(func.distinct(LLMEvent.workflow_id))).filter(
        LLMEvent.upload_session_id.in_(session_ids)
    ).scalar()
    
    unique_models = db.query(func.count(func.distinct(LLMEvent.model))).filter(
        LLMEvent.upload_session_id.in_(session_ids)
    ).scalar()
    
    # Date range
    first_event = db.query(func.min(LLMEvent.timestamp)).filter(
        LLMEvent.upload_session_id.in_(session_ids)
    ).scalar()
    
    last_event = db.query(func.max(LLMEvent.timestamp)).filter(
        LLMEvent.upload_session_id.in_(session_ids)
    ).scalar()
    
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




# ============================================================================
# AUDIT SESSION ENDPOINTS
# ============================================================================

@router.post("/audit/sessions", response_model=AuditSessionResponse)
async def create_audit_session(
    session_data: AuditSessionCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new audit session with user information
    
    This should be called when a user uploads a file, before processing it.
    Returns the session ID to be used for storing analysis results.
    """
    from src.models import AuditSession
    import uuid
    from src.api.auth import otp_store
    
    email = session_data.email.lower()
    otp_data = otp_store.get(email)
    if not otp_data or not otp_data.get("verified"):
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
        db.commit()
        db.refresh(audit_session)
        
        logger.info("Audit session created", session_id=audit_session.id, email=session_data.email)
        return audit_session
    
    except Exception as e:
        db.rollback()
        logger.exception("Error creating audit session", error=str(e), email=session_data.email)
        raise HTTPException(status_code=500, detail=f"Error creating audit session: {str(e)}")


@router.patch("/audit/sessions/{session_id}", response_model=AuditSessionResponse)
async def update_audit_session(
    session_id: str,
    update_data: AuditSessionUpdate,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Update audit session with analysis results
    
    This should be called after processing the file to store:
    - Credit score
    - Cost metrics
    - Analysis results
    """
    from src.models import AuditSession
    
    try:
        # Find session
        session = db.query(AuditSession).filter(AuditSession.id == session_id).first()
        
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
        
        db.commit()
        db.refresh(session)
        
        logger.info("Audit session updated", session_id=session_id)
        return session
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.exception("Error updating audit session", error=str(e), session_id=session_id)
        raise HTTPException(status_code=500, detail=f"Error updating audit session: {str(e)}")


@router.get("/audit/sessions/{session_id}", response_model=AuditSessionResponse)
async def get_audit_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    Get a specific audit session by ID
    """
    from src.models import AuditSession
    
    session = db.query(AuditSession).filter(AuditSession.id == session_id).first()
    
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
    db: Session = Depends(get_db),
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
        total = db.query(func.count(AuditSession.id)).filter(
            AuditSession.email == email
        ).scalar()
        
        # Get sessions
        sessions = db.query(AuditSession).filter(
            AuditSession.email == email
        ).order_by(
            desc(AuditSession.created_at)
        ).offset(skip).limit(limit).all()
        
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
    db: Session = Depends(get_db),
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
    user_sessions = db.query(func.count(AuditSession.id)).filter(
        AuditSession.email == current_user,
        AuditSession.company_name == company_name
    ).scalar()
    
    if not user_sessions and domain.lower() not in company_name.lower():
        raise HTTPException(status_code=403, detail="Not authorized to access company data")
        
    
    try:
        # Get total count
        total = db.query(func.count(AuditSession.id)).filter(
            AuditSession.company_name == company_name
        ).scalar()
        
        # Get sessions
        sessions = db.query(AuditSession).filter(
            AuditSession.company_name == company_name
        ).order_by(
            desc(AuditSession.created_at)
        ).offset(skip).limit(limit).all()
        
        # Calculate company-level stats
        avg_score = db.query(func.avg(AuditSession.credit_score)).filter(
            AuditSession.company_name == company_name,
            AuditSession.credit_score.isnot(None)
        ).scalar()
        
        total_wasted = db.query(func.sum(AuditSession.wasted_cost)).filter(
            AuditSession.company_name == company_name,
            AuditSession.wasted_cost.isnot(None)
        ).scalar()
        
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
    db: Session = Depends(get_db)
):
    """
    Delete a specific audit session
    
    WARNING: This endpoint is disabled in production for security.
    """
    raise HTTPException(
        status_code=403,
        detail="Disabled in production"
    )


