"""
Aurex Backend - Main Application Entry Point
FastAPI application for LLM cost optimization
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
import os
from dotenv import load_dotenv

# Load environment variables as early as possible
load_dotenv()

from src.api import router
from src.database import init_db
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
    print("Initializing database...")
    init_db()
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

# Configure CORS
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
allowed_origins = [
    frontend_url,
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(allowed_origins)),
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
    # Get configuration from environment
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("PORT", os.getenv("API_PORT", "8000")))
    debug = os.getenv("DEBUG", "True").lower() == "true"
    
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


