"""Minimal runtime-only server and immutable demo-data settings."""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DEMO_DATA = Path(__file__).resolve().parents[2] / "data" / "demo"


class Settings(BaseSettings):
    """Configure only bundle location and local server bind values."""

    model_config = SettingsConfigDict(
        env_prefix="BIDRADAR_",
        extra="ignore",
        validate_default=True,
    )
    demo_data_dir: Path = DEFAULT_DEMO_DATA
    host: str = Field(default="127.0.0.1", min_length=1)
    port: int = Field(default=8000, ge=1, le=65535)
