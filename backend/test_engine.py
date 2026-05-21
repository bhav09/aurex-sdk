import asyncio
from src.database import get_db_context
from src.detection.engine import EnhancedDetectionEngine

async def run():
    async with get_db_context() as db:
        # We pass email to load all events for that user, or pass None to load ALL events in DB
        engine = EnhancedDetectionEngine(db, email=None)
        res = await engine.analyze_complete()
        import json
        print(json.dumps(res, indent=2))

if __name__ == "__main__":
    asyncio.run(run())
