from datetime import date
from typing import Protocol

from app.models import DatePrice, FlightOption, MaxStops


class FlightProvider(Protocol):
    """Fuente de precios. Permite cambiar fli por SearchApi/SerpApi sin tocar los servicios."""

    name: str

    def calendar(
        self,
        origins: list[str],
        destinations: list[str],
        date_from: date,
        date_to: date,
        trip_days: int | None,
        max_stops: MaxStops,
        currency: str,
    ) -> list[DatePrice]:
        """Precio más bajo por fecha de salida (o por par salida/regreso si trip_days)."""
        ...

    def flights(
        self,
        origins: list[str],
        destinations: list[str],
        depart_date: date,
        return_date: date | None,
        max_stops: MaxStops,
        currency: str,
        limit: int,
    ) -> list[FlightOption]:
        """Itinerarios concretos para una fecha."""
        ...


class ProviderThrottled(Exception):
    """La fuente de precios está limitando las consultas temporalmente."""
