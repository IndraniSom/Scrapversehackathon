"""BidRadar backend package and local server entry point."""

import uvicorn

from backend.config import Settings


def main() -> None:
    """Run the FastAPI processing service with validated bind settings."""
    settings = Settings()
    uvicorn.run(
        "backend.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )
