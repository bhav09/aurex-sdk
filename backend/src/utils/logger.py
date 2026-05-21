import logging
import os
import sys

import structlog
from opentelemetry import trace

def add_otel_trace_id(logger, log_method, event_dict):
    """
    Injects OTel trace_id into structlog logs
    """
    span = trace.get_current_span()
    if span and span.is_recording():
        event_dict["trace_id"] = format(span.get_span_context().trace_id, '032x')
        event_dict["span_id"] = format(span.get_span_context().span_id, '016x')
    return event_dict

def setup_logger():
    """
    Configure structlog and standard logging.
    Development gets pretty, colorful console logs.
    Production gets JSON logs.
    """
    # Check if we're in debug mode
    debug = os.getenv("DEBUG", "True").lower() == "true"
    
    # Configure standard logging to redirect to structlog
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=logging.DEBUG if debug else logging.INFO,
    )

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        add_otel_trace_id,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if debug:
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True)
        ]
    else:
        processors = shared_processors + [
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer()
        ]

    structlog.configure(
        processors=processors,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

def get_logger(name=__name__):
    """
    Get a structured logger instance.
    """
    return structlog.get_logger(name)

# Initialize configuration when the module is imported
setup_logger()
