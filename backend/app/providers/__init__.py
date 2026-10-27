from functools import lru_cache

from app.providers.base import FlightProvider
from app.providers.fli_provider import FliProvider


@lru_cache
def get_provider() -> FlightProvider:
    return FliProvider()
