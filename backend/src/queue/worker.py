import os
from arq import create_pool
from arq.connections import RedisSettings
from src.queue.tasks import send_email_task
from app.config import settings

# Parse redis URL
redis_url = getattr(settings, "redis_url", "redis://localhost:6379/0")
# We just extract the host and port naively for the Arq RedisSettings or parse it properly
# For simplicity, passing host and port from env or assuming localhost
redis_host = "localhost"
redis_port = 6379
if "redis://" in redis_url:
    parts = redis_url.replace("redis://", "").split(":")
    if len(parts) >= 2:
        redis_host = parts[0]
        redis_port = int(parts[1].split("/")[0])

redis_settings = RedisSettings(host=redis_host, port=redis_port)

class WorkerSettings:
    functions = [send_email_task]
    redis_settings = redis_settings
    
    on_startup = None
    on_shutdown = None
