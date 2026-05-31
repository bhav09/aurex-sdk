"""
Aurex Backend - Main Application Entry Point
FastAPI application for LLM cost optimization
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
import os

# Create app/config.py directory structure if it doesn't exist
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent))

from app.config import settings

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

from src.api import router
from src.database import init_db, engine
from src.middleware.logging_middleware import LoggingMiddleware
from src.utils.logger import get_logger
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    # VULN-06 Defense: Enforce strong JWT secret in production mode
    is_prod = not settings.debug and os.getenv("PYTEST_CURRENT_TEST") is None
    if is_prod and settings.jwt_secret == "dev-secret-key-change-in-prod":
        logger.error("FATAL: Production mode detected but using default JWT secret key.")
        raise ValueError("Cannot start in production mode with default JWT secret.")

    print("Initializing database...")
    await init_db()
    
    # Instrument SQLAlchemy
    SQLAlchemyInstrumentor().instrument(
        engine=engine.sync_engine,
    )
    
    print("Database initialized successfully")
    print("Aurex Backend is ready!")
    yield
    # Shutdown (if needed)
    print("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title="Aurex Backend",
    description="LLM Cost Optimization and Analysis System",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Instrument FastAPI for OpenTelemetry
FastAPIInstrumentor.instrument_app(app)

# Configure rate limiter with in-memory storage to avoid Redis connection issues locally
from src.utils.limiter import limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Configure CORS
origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(origins)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add structured logging middleware
app.add_middleware(LoggingMiddleware)

# Global exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled server error", error=str(exc), path=request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    logger.warning("HTTP Exception", status_code=exc.status_code, detail=exc.detail, path=request.url.path)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

# Include API routes
app.include_router(router, prefix="/api/v1", tags=["api"])


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Aurex Backend",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


if __name__ == "__main__":
    # Get configuration from settings singleton
    host = settings.api_host
    port = settings.api_port
    debug = settings.debug
    
    print(f"""
    ╔═══════════════════════════════════════╗
    ║         Aurex Backend v1.0.0         ║
    ║   LLM Cost Optimization System        ║
    ╚═══════════════════════════════════════╝
    
    🚀 Starting server...
    📍 Host: {host}
    🔌 Port: {port}
    🐛 Debug: {debug}
    📚 API Docs: http://{host}:{port}/docs
    
    """)
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=debug,
        log_level="info"
    )


