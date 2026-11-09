"""Environment-based configuration. Secrets are only ever read from the environment / .env."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "ScamShield AI"
    environment: str = "development"
    database_url: str = "sqlite:///./scamshield.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Limits
    max_input_chars: int = 5000
    rate_limit_per_minute: int = 60

    # AI provider (optional). Without a key the heuristic engine runs alone.
    # ai_provider: "auto" (Gemini if GEMINI_API_KEY is set, else Claude), "gemini", "anthropic" or "none".
    ai_provider: str = "auto"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.8-flash"
    anthropic_api_key: str | None = None
    ai_model: str = "claude-opus-5-5"
    ai_effort: str = "low"
    ai_timeout_seconds: float = 30.0

    # Network checks
    enable_url_fetch: bool = True  # safe, SSRF-protected fetch of submitted URLs
    enable_domain_age: bool = True  # RDAP lookup (no key required)
    fetch_timeout_seconds: float = 5.0
    fetch_max_bytes: int = 262_144
    fetch_max_redirects: int = 5

    # Threat intelligence (optional)
    google_safe_browsing_api_key: str | None = None
    virustotal_api_key: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def active_ai_provider(self) -> str | None:
        p = (self.ai_provider or "auto").lower()
        if p in ("auto", "gemini") and self.gemini_api_key:
            return "gemini"
        if p in ("auto", "anthropic") and self.anthropic_api_key:
            return "anthropic"
        return None

    @property
    def active_ai_model(self) -> str | None:
        return {"gemini": self.gemini_model, "anthropic": self.ai_model}.get(self.active_ai_provider or "")

    @property
    def ai_enabled(self) -> bool:
        return self.active_ai_provider is not None


@lru_cache
def get_settings() -> Settings:
    return Settings()
