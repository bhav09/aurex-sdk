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

from src.api import router
from src.database import init_db

# Load environment variables
load_dotenv()


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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    port = int(os.getenv("API_PORT", "8000"))
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


