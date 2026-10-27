from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    turso_database_url: str = ""
    turso_auth_token: str = ""
    local_db_path: str = "flightsradar.db"

    default_currency: str = "COP"
    default_language: str = "es"
    default_country: str = "CO"

    hubs: str = "BOG,PTY,MIA,FLL,MEX,LAX,SFO,JFK,MAD"

    # 0 = sin revisión automática; las rutas se revisan a mano desde el Radar.
    watch_interval_minutes: int = 0

    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    cors_origins: str = "http://localhost:3000"

    @property
    def hub_list(self) -> list[str]:
        return [h.strip().upper() for h in self.hubs.split(",") if h.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
