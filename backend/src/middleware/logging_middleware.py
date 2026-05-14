import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
import structlog

logger = structlog.get_logger(__name__)

class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate a unique request ID
        request_id = str(uuid.uuid4())
        
        # Get client IP if available
        client_ip = request.client.host if request.client else "unknown"
        
        # Bind request-specific info to the context
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            client_ip=client_ip,
        )
        
        # Do not log standard health checks constantly
        if request.url.path in ["/", "/health", "/api/v1/", "/api/v1/health"]:
            return await call_next(request)
            
        logger.info("Request started")
        
        start_time = time.time()
        
        try:
            response = await call_next(request)
            
            # Calculate latency
            latency_ms = round((time.time() - start_time) * 1000, 2)
            
            structlog.contextvars.bind_contextvars(
                status_code=response.status_code,
                latency_ms=latency_ms
            )
            
            if response.status_code >= 400:
                logger.warning("Request completed with error")
            else:
                logger.info("Request completed")
                
            return response
            
        except Exception as e:
            # Calculate latency even on failure
            latency_ms = round((time.time() - start_time) * 1000, 2)
            structlog.contextvars.bind_contextvars(
                status_code=500,
                latency_ms=latency_ms
            )
            logger.exception("Unhandled server error in request", error=str(e))
            raise
