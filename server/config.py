"""Server settings. Values come from the environment or a `.env` file (repo root or server/)."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

SERVER_DIR = Path(__file__).resolve().parent
REPO_DIR = SERVER_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="HORIZON_",
        env_file=(REPO_DIR / ".env", SERVER_DIR / ".env"),
        extra="ignore",
    )

    db_path: Path = REPO_DIR / "data" / "horizon.db"
    allowed_origins: str = "http://localhost:3000"
    # Upload traces to hud.ai. Off by default: Horizon is local-first and never phones home
    # unless asked.
    telemetry_sync: bool = False

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
