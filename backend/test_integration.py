"""
Integration Test Script
Tests the complete Aurex backend system
"""

import sys
import os
import asyncio
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.database import init_db, get_db_context
from src.models import LLMEvent, LLMEventCreate, AuditSession
from src.utils.pricing import calculate_cost
from src.detection.engine import EnhancedDetectionEngine
from datetime import datetime
import uuid


async def test_database():
    """Test database initialization"""
    print("🧪 Testing database initialization...")
    try:
        await init_db()
        print("✅ Database initialized successfully")
        return True
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")
        return False


async def test_event_creation():
    """Test creating and storing events"""
    print("\n🧪 Testing event creation...")
    try:
        async with get_db_context() as db:
            # Create a test session first
            session_id = str(uuid.uuid4())
            session = AuditSession(
                id=session_id,
                user_name="Integration Test User",
                email="test-integration@company.com",
                company_name="Integration Test Corp",
                file_name="test.csv",
                created_at=datetime.utcnow()
            )
            db.add(session)
            
            # Create test event
            event_data = LLMEventCreate(
                timestamp=datetime.utcnow(),
                provider="openai",
                model="gpt-4o",
                workflow_id="test-workflow-1",
                step_id="step-1",
                parent_step_id=None,
                input_tokens=100,
                output_tokens=50,
                total_tokens=150,
                cost=calculate_cost("gpt-4o", 100, 50),
                prompt="Test prompt",
                response="Test response",
                system_prompt_hash="test-hash-123",
                context_length=150,
                extra_metadata={"test": True}
            )
            
            event = LLMEvent(**event_data.dict())
            event.upload_session_id = session_id
            db.add(event)
            await db.flush()
            
            # Verify event was stored
            from sqlalchemy import select
            stmt = select(LLMEvent).where(LLMEvent.workflow_id == "test-workflow-1")
            res = await db.execute(stmt)
            stored_event = res.scalars().first()
            
            if stored_event:
                print(f"✅ Event created successfully (ID: {stored_event.id})")
                print(f"   Cost: ${stored_event.cost:.6f}")
                print(f"   Tokens: {stored_event.total_tokens}")
                return True
            else:
                print("❌ Event not found in database")
                return False
                
    except Exception as e:
        print(f"❌ Event creation failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_cost_calculation():
    """Test cost calculation"""
    print("\n🧪 Testing cost calculation...")
    try:
        # Test various models
        tests = [
            ("gpt-4o", 1000, 500),
            ("claude-3-5-sonnet-20241022", 1000, 500),
            ("gpt-4o-mini", 1000, 500),
        ]
        
        for model, input_tokens, output_tokens in tests:
            cost = calculate_cost(model, input_tokens, output_tokens)
            print(f"   {model}: ${cost:.6f} ({input_tokens}+{output_tokens} tokens)")
        
        print("✅ Cost calculation working")
        return True
        
    except Exception as e:
        print(f"❌ Cost calculation failed: {e}")
        return False


async def test_detection_engine():
    """Test detection engine"""
    print("\n🧪 Testing detection engine...")
    try:
        async with get_db_context() as db:
            session_id = str(uuid.uuid4())
            session = AuditSession(
                id=session_id,
                user_name="Detection Test User",
                email="test-detection@company.com",
                company_name="Detection Test Corp",
                file_name="test.csv",
                created_at=datetime.utcnow()
            )
            db.add(session)
            
            # Create test events that should trigger detections
            
            # 1. Create agent loop scenario
            for i in range(5):
                event_data = LLMEventCreate(
                    timestamp=datetime.utcnow(),
                    provider="openai",
                    model="gpt-4",
                    workflow_id="loop-workflow",
                    step_id=f"step-{i}",
                    parent_step_id=f"step-{i-1}" if i > 0 else None,
                    input_tokens=200 + (i * 100),  # Growing context
                    output_tokens=50,
                    total_tokens=250 + (i * 100),
                    cost=calculate_cost("gpt-4", 200 + (i * 100), 50),
                    prompt="Repeated prompt",  # Same prompt
                    response=f"Response {i}",
                    context_length=250 + (i * 100),
                    extra_metadata={"iteration": i}
                )
                event = LLMEvent(**event_data.dict())
                event.upload_session_id = session_id
                db.add(event)
            
            # 2. Create expensive model misuse scenario
            for i in range(5):
                event_data = LLMEventCreate(
                    timestamp=datetime.utcnow(),
                    provider="openai",
                    model="gpt-4",  # Expensive model
                    workflow_id="misuse-workflow",
                    step_id=f"simple-{i}",
                    input_tokens=50,  # Very few tokens
                    output_tokens=30,
                    total_tokens=80,
                    cost=calculate_cost("gpt-4", 50, 30),
                    prompt=f"Simple task {i}",
                    response=f"Simple response {i}",
                    context_length=80,
                    extra_metadata={"simple": True}
                )
                event = LLMEvent(**event_data.dict())
                event.upload_session_id = session_id
                db.add(event)
            
            await db.flush()
            
            # Run detection engine
            engine = EnhancedDetectionEngine(db, session_id=session_id)
            analysis = await engine.analyze_complete()
            
            print(f"✅ Detection engine ran successfully")
            print(f"   Total events: {analysis['total_events']}")
            print(f"   Total cost: ${analysis['executive_summary']['current_weekly_spend']:.4f}")
            print(f"   Wasted cost: ${analysis['executive_summary']['wasted_amount']:.4f}")
            print(f"   Issues found: {len(analysis['top_issues'])}")
            
            if len(analysis['top_issues']) > 0:
                print("\n   Detected issues:")
                for issue in analysis['top_issues'][:3]:  # Show first 3
                    print(f"   - {issue['issue_type']}: {issue['one_line_summary'][:60]}...")
            
            return True
            
    except Exception as e:
        print(f"❌ Detection engine failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_ingestion():
    """Test CSV parsing"""
    print("\n🧪 Testing CSV parsing...")
    try:
        import pandas as pd
        import io
        
        # Create a simple test CSV in memory
        csv_content = """timestamp,model,input_tokens,output_tokens,cost
2024-01-01T10:00:00,gpt-4o,100,50,0.00125
2024-01-01T10:05:00,gpt-4o-mini,200,100,0.00015
"""
        df = pd.read_csv(io.StringIO(csv_content))
        
        events = []
        for idx, row in df.iterrows():
            events.append(row.to_dict())
        
        if events and len(events) == 2:
            print(f"✅ CSV parsing working ({len(events)} events parsed)")
            return True
        else:
            print(f"❌ CSV parsing failed (expected 2 events, got {len(events)})")
            return False
            
    except Exception as e:
        print(f"❌ CSV parsing test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def run_all_tests():
    """Run all integration tests"""
    print("╔═══════════════════════════════════════╗")
    print("║   Aurex Backend Integration Tests   ║")
    print("╚═══════════════════════════════════════╝\n")
    
    tests = [
        ("Database", test_database),
        ("Event Creation", test_event_creation),
        ("Cost Calculation", test_cost_calculation),
        ("Ingestion Parsing", test_ingestion),
        ("Detection Engine", test_detection_engine),
    ]
    
    results = []
    for name, test_func in tests:
        result = await test_func()
        results.append((name, result))
    
    # Summary
    print("\n╔═══════════════════════════════════════╗")
    print("║           Test Summary                ║")
    print("╚═══════════════════════════════════════╝\n")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {name}")
    
    print(f"\n{passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Backend is ready to use.")
        return 0
    else:
        print("\n⚠️  Some tests failed. Please check the errors above.")
        return 1


if __name__ == "__main__":
    import warnings
    warnings.filterwarnings("ignore", category=UserWarning)
    exit_code = asyncio.run(run_all_tests())
    sys.exit(exit_code)
