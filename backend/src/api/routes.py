"""
FastAPI Routes for Aurex Backend
"""

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
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

router = APIRouter()


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
    db: Session = Depends(get_db)
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
    query = db.query(LLMEvent)
    
    if workflow_id:
        query = query.filter(LLMEvent.workflow_id == workflow_id)
    if provider:
        query = query.filter(LLMEvent.provider == provider)
    if model:
        query = query.filter(LLMEvent.model == model)
    
    events = query.order_by(desc(LLMEvent.timestamp)).offset(skip).limit(limit).all()
    
    return events


@router.get("/workflows")
async def get_workflows(db: Session = Depends(get_db)):
    """
    Get list of all workflows with summary statistics
    """
    # Group by workflow_id and get aggregates
    workflows = db.query(
        LLMEvent.workflow_id,
        func.count(LLMEvent.id).label('event_count'),
        func.sum(LLMEvent.cost).label('total_cost'),
        func.sum(LLMEvent.total_tokens).label('total_tokens'),
        func.min(LLMEvent.timestamp).label('start_time'),
        func.max(LLMEvent.timestamp).label('end_time')
    ).filter(
        LLMEvent.workflow_id.isnot(None)
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
async def get_insights(db: Session = Depends(get_db)):
    """
    Get overall insights and detected issues across all events
    """
    analysis = analyze_all(db)
    
    # Add additional aggregations
    total_events = db.query(func.count(LLMEvent.id)).scalar()
    
    # Cost by provider
    provider_costs = db.query(
        LLMEvent.provider,
        func.sum(LLMEvent.cost).label('total_cost')
    ).group_by(LLMEvent.provider).all()
    
    # Cost by model
    model_costs = db.query(
        LLMEvent.model,
        func.sum(LLMEvent.cost).label('total_cost'),
        func.count(LLMEvent.id).label('count')
    ).group_by(LLMEvent.model).order_by(desc('total_cost')).limit(10).all()
    
    # Daily costs
    daily_costs = db.query(
        func.date(LLMEvent.timestamp).label('date'),
        func.sum(LLMEvent.cost).label('total_cost')
    ).group_by(func.date(LLMEvent.timestamp)).order_by('date').all()
    
    analysis["aggregations"] = {
        "total_events": total_events,
        "provider_breakdown": {
            p.provider: round(p.total_cost, 4) for p in provider_costs
        },
        "top_models": [
            {
                "model": m.model,
                "cost": round(m.total_cost, 4),
                "count": m.count
            }
            for m in model_costs
        ],
        "daily_costs": [
            {
                "date": str(d.date),
                "cost": round(d.total_cost, 4)
            }
            for d in daily_costs
        ]
    }
    
    return analysis


@router.get("/executive-summary")
async def get_executive_summary(db: Session = Depends(get_db)):
    """
    Get executive-level summary with C-suite friendly formatting
    
    Returns:
    - Big red number (wasted cost)
    - Top 3 issues with one-click fixes
    - Workflow cost breakdown
    - ROI projections
    """
    try:
        engine = EnhancedDetectionEngine(db)
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
    
    WARNING: This will delete ALL data. Use with caution.
    
    Query parameters:
    - confirm: Must be set to true to confirm deletion
    """
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail="Must set confirm=true to delete all data"
        )
    
    try:
        # Count events before deletion
        count_before = db.query(func.count(LLMEvent.id)).scalar()
        
        # Delete all events
        db.query(LLMEvent).delete()
        db.commit()
        
        return {
            "status": "success",
            "message": f"Deleted {count_before} events",
            "events_deleted": count_before
        }
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error clearing data: {str(e)}")


@router.post("/upload/csv")
async def upload_csv(
    file: UploadFile = File(...),
    csv_type: Optional[str] = Query(None, description="CSV type: anthropic, openai, or bedrock"),
    clear_existing: bool = Query(False, description="Clear existing data before upload"),
    db: Session = Depends(get_db)
):
    """
    Upload and process CSV file from LLM providers
    
    Supported formats:
    - Anthropic usage export
    - OpenAI usage export
    - AWS Bedrock CloudWatch metrics
    
    Query parameters:
    - csv_type: Specify CSV format (auto-detected if not provided)
    - clear_existing: If true, clears all existing data before upload
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    try:
        # Clear existing data if requested
        deleted_count = 0
        if clear_existing:
            deleted_count = db.query(func.count(LLMEvent.id)).scalar()
            db.query(LLMEvent).delete()
            db.commit()
        
        # Read file content
        content = await file.read()
        
        # Parse CSV
        from io import BytesIO
        import uuid
        file_obj = BytesIO(content)
        
        # Generate upload session ID
        upload_session_id = str(uuid.uuid4())
        
        events = ingest_csv_file(file_obj, csv_type)
        
        if not events:
            raise HTTPException(status_code=400, detail="No events found in CSV")
        
        # Store events in database with upload_session_id
        stored_count = 0
        for event_data in events:
            event_dict = event_data.dict()
            event_dict['upload_session_id'] = upload_session_id
            event = LLMEvent(**event_dict)
            db.add(event)
            stored_count += 1
        
        db.commit()
        
        response = {
            "status": "success",
            "events_ingested": stored_count,
            "filename": file.filename,
            "csv_type": csv_type or "auto-detected",
            "upload_session_id": upload_session_id
        }
        
        if clear_existing:
            response["events_deleted"] = deleted_count
        
        return response
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error processing CSV: {str(e)}")


@router.post("/ingest/json")
async def ingest_json(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload and process JSON session file from llm-use
    """
    if not file.filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="File must be a JSON")
    
    try:
        # Save temporarily
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.json') as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        # Parse JSON
        events = ingest_single_json_file(tmp_path)
        
        if not events:
            raise HTTPException(status_code=400, detail="No events found in JSON")
        
        # Store events in database
        stored_count = 0
        for event_data in events:
            event = LLMEvent(**event_data.dict())
            db.add(event)
            stored_count += 1
        
        db.commit()
        
        # Clean up temp file
        import os
        os.unlink(tmp_path)
        
        return {
            "status": "success",
            "events_ingested": stored_count,
            "filename": file.filename
        }
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error processing JSON: {str(e)}")


@router.post("/ingest/llm-use-sessions")
async def ingest_sessions(
    session_dir: Optional[str] = Query(None, description="Path to llm-use sessions directory"),
    db: Session = Depends(get_db)
):
    """
    Ingest all session files from llm-use directory
    
    Default location: ~/.llm-use/sessions
    """
    try:
        events = ingest_llm_use_sessions(session_dir)
        
        if not events:
            raise HTTPException(
                status_code=404,
                detail="No session files found. Check that llm-use has been run and sessions exist."
            )
        
        # Store events in database
        stored_count = 0
        for event_data in events:
            event = LLMEvent(**event_data.dict())
            db.add(event)
            stored_count += 1
        
        db.commit()
        
        return {
            "status": "success",
            "events_ingested": stored_count,
            "session_dir": session_dir or "~/.llm-use/sessions"
        }
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error ingesting sessions: {str(e)}")


@router.get("/stats")
async def get_stats(db: Session = Depends(get_db)):
    """
    Get overall statistics
    """
    total_events = db.query(func.count(LLMEvent.id)).scalar()
    total_cost = db.query(func.sum(LLMEvent.cost)).scalar() or 0
    total_tokens = db.query(func.sum(LLMEvent.total_tokens)).scalar() or 0
    
    unique_workflows = db.query(func.count(func.distinct(LLMEvent.workflow_id))).scalar()
    unique_models = db.query(func.count(func.distinct(LLMEvent.model))).scalar()
    
    # Date range
    first_event = db.query(func.min(LLMEvent.timestamp)).scalar()
    last_event = db.query(func.max(LLMEvent.timestamp)).scalar()
    
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
        
        return audit_session
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating audit session: {str(e)}")


@router.patch("/audit/sessions/{session_id}", response_model=AuditSessionResponse)
async def update_audit_session(
    session_id: str,
    update_data: AuditSessionUpdate,
    db: Session = Depends(get_db)
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
        
        # Update fields
        update_dict = update_data.dict(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(session, key, value)
        
        session.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(session)
        
        return session
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating audit session: {str(e)}")


@router.get("/audit/sessions/{session_id}", response_model=AuditSessionResponse)
async def get_audit_session(
    session_id: str,
    db: Session = Depends(get_db)
):
    """
    Get a specific audit session by ID
    """
    from src.models import AuditSession
    
    session = db.query(AuditSession).filter(AuditSession.id == session_id).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Audit session not found")
    
    return session


@router.get("/audit/history/{email}", response_model=AuditHistoryResponse)
async def get_audit_history(
    email: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """
    Get audit history for a specific email address
    
    Returns all past audits for the user, sorted by most recent first.
    """
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
    db: Session = Depends(get_db)
):
    """
    Get all audits for a specific company
    
    Useful for company-level analytics and tracking.
    """
    from src.models import AuditSession
    
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
    """
    from src.models import AuditSession
    
    try:
        session = db.query(AuditSession).filter(AuditSession.id == session_id).first()
        
        if not session:
            raise HTTPException(status_code=404, detail="Audit session not found")
        
        db.delete(session)
        db.commit()
        
        return {
            "status": "success",
            "message": f"Audit session {session_id} deleted"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error deleting audit session: {str(e)}")


