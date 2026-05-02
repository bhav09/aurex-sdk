# Bug Fixes Applied

## Issue 1: SQLAlchemy Reserved Name Conflict

**Error:**
```
sqlalchemy.exc.InvalidRequestError: Attribute name 'metadata' is reserved when using the Declarative API.
```

**Root Cause:**
SQLAlchemy reserves the name `metadata` for its internal use in declarative models.

**Fix Applied:**
Renamed the field from `metadata` to `extra_metadata` throughout the codebase:

### Files Modified:
1. `src/models/llm_event.py` - Changed column name and Pydantic models
2. `src/ingestion/json_ingestion.py` - Updated field name in event creation
3. `src/ingestion/csv_ingestion.py` - Updated field name in all parsers (Anthropic, OpenAI, Bedrock)
4. `test_integration.py` - Updated test data

### Changes:
```python
# Before
metadata = Column(JSON, nullable=True)
metadata: Optional[Dict[str, Any]] = None

# After
extra_metadata = Column(JSON, nullable=True)
extra_metadata: Optional[Dict[str, Any]] = None
```

## Issue 2: Deprecated FastAPI on_event

**Warning:**
```
on_event is deprecated, use lifespan event handlers instead.
```

**Fix Applied:**
Updated `main.py` to use modern lifespan context manager:

```python
# Before
@app.on_event("startup")
async def startup_event():
    init_db()

# After
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    yield
    # Shutdown
    pass

app = FastAPI(..., lifespan=lifespan)
```

## Verification

✅ Server starts successfully on http://0.0.0.0:8000
✅ Database initializes without errors
✅ No deprecation warnings
✅ All API endpoints accessible

## Testing

Run the integration tests:
```bash
cd backend
python test_integration.py
```

Access API documentation:
```
http://localhost:8000/docs