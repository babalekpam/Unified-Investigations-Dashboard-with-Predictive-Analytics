"""Runtime configuration for the analytics service.

Everything here comes from the environment. In Azure the values are projected from Key
Vault into the container; nothing sensitive is defaulted to a working value, which is why
the API credential has no default at all.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GSIH_", env_file=".env", extra="ignore")

    # Serving warehouse (PostgreSQL locally, Azure Database for PostgreSQL in the cloud).
    db_url: str = "postgresql+psycopg2://gsih:gsih@localhost:5432/gsih"

    # The investigations API, which owns the write path for scores and forecasts.
    api_base_url: str = "http://localhost:8080"
    api_token: str | None = None

    # MLflow tracking. Points at the Databricks-managed tracking server in deployed
    # environments; a local directory keeps runs reproducible on a laptop.
    mlflow_tracking_uri: str = "file:./mlruns"
    mlflow_experiment: str = "gsih-vandalism-risk"

    model_version: str = "1.0.0"

    # How much history the training job reads.
    training_window_days: int = 540

    # Guardrail: a model below this average precision is not promoted, on the principle
    # that no forecast is better than one the security team will learn to ignore.
    min_average_precision: float = 0.10

    @property
    def model_name(self) -> str:
        return f"vandalism-risk-{self.model_version}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
