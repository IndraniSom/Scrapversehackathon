"""Install signed processing routes on the FastAPI application."""

from fastapi import FastAPI

from backend.assessment_api import router as assessment_router
from backend.proposal_package_api import router as proposal_package_router
from backend.tender_intelligence_api import router as tender_intelligence_router
from backend.worker_callback import router as worker_callback_router
from backend.worker_routes import router as worker_router


def install_internal_routes(app: FastAPI) -> None:
    """Register every signed worker and processing endpoint once."""
    for route in (assessment_router, proposal_package_router, worker_router, worker_callback_router, tender_intelligence_router):
        app.include_router(route)
