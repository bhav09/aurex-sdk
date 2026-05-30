"""
API package.

`router` aggregates the legacy `routes` router with the Phase 1 routers.
All are mounted by main.py under `/api/v1`.
"""
from fastapi import APIRouter

from .routes import router as legacy_router
from .keys import router as keys_router
from .projects import router as projects_router
from .ledger import router as ledger_router
from .dashboard import router as dashboard_router

router = APIRouter()
router.include_router(legacy_router)
router.include_router(keys_router)
router.include_router(projects_router)
router.include_router(ledger_router)
router.include_router(dashboard_router)

__all__ = ["router"]
