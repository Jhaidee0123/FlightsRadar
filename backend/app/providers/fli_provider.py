"""Proveedor basado en `fli`, que llama la API interna de Google Flights.

Gratis y útil para desarrollo, pero no oficial: puede romperse si Google cambia algo.
"""

import re
import threading
import time
from datetime import date, timedelta

from fli.core.parsers import resolve_airport
from fli.search import _decoders
from fli.models import (
    Airport,
    DateSearchFilters,
    FlightResult,
    FlightSearchFilters,
    FlightSegment,
    MaxStops as FliMaxStops,
    PassengerInfo,
    SortBy,
    TripType,
)
from fli.search import SearchDates, SearchFlights

from app.config import get_settings
from app.models import DatePrice, FlightOption, Leg, MaxStops
from app.providers.base import ProviderThrottled

STOPS = {
    "ANY": FliMaxStops.ANY,
    "NON_STOP": FliMaxStops.NON_STOP,
    "ONE_STOP": FliMaxStops.ONE_STOP_OR_FEWER,
    "TWO_STOPS": FliMaxStops.TWO_OR_FEWER_STOPS,
}


# Google responde 200 con un código de error en vez de datos cuando limita las consultas.
_ERROR_PAYLOAD = re.compile(r'\["wrb\.fr",null,null,null,null,\[\d+\]')
CACHE_TTL_SECONDS = 30 * 60
EMPTY_RETRY_DELAY_SECONDS = 1.5


class _GuardedClient:
    """Envuelve el cliente HTTP de fli para detectar el bloqueo de Google."""

    def __init__(self, client) -> None:
        self._client = client

    def post(self, *args, **kwargs):
        response = self._client.post(*args, **kwargs)
        if _ERROR_PAYLOAD.search(response.text[:500]):
            raise ProviderThrottled("Google Flights está limitando las consultas. Reintenta en unos minutos.")
        return response

    def __getattr__(self, name):
        return getattr(self._client, name)


def _guarded(searcher):
    searcher.client = _GuardedClient(searcher.client)
    return searcher


def _airport(code: str) -> Airport:
    """Miembro del enum que conserva el código pedido.

    En fli algunos códigos son alias de otro aeropuerto con el mismo nombre (SMR ->
    GYE, ambos "Simón Bolívar"), y fli envía a Google el nombre del miembro: SMR
    terminaría buscando Guayaquil. Para esos casos se crea un miembro con el código real.
    """
    member = resolve_airport(code)
    if member.name == code:
        return member
    alias = object.__new__(Airport)
    alias._name_ = code
    alias._value_ = member.value
    return alias


# El decodificador de respuestas de fli (flights==0.9.0) tampoco conoce los alias.
for _code in Airport.__members__:
    _decoders._AIRPORT_BY_CODE.setdefault(_code, _airport(_code))


def _airports(codes: list[str]) -> list[list]:
    return [[_airport(c.strip().upper()), 0] for c in codes]


def _leg(leg) -> Leg:
    return Leg(
        airline_code=leg.airline.name.removeprefix("_"),
        airline_name=leg.airline.value,
        flight_number=leg.flight_number,
        origin=leg.departure_airport.name,
        destination=leg.arrival_airport.name,
        departure=leg.departure_datetime,
        arrival=leg.arrival_datetime,
        duration_min=leg.duration,
    )


class FliProvider:
    name = "fli"

    def __init__(self) -> None:
        s = get_settings()
        self._lang = s.default_language
        self._country = s.default_country
        self._cache: dict[tuple, tuple[float, list]] = {}
        self._cache_lock = threading.Lock()

    def _cached(self, key: tuple, fetch):
        """Evita repetir consultas idénticas: reduce la carga y el riesgo de bloqueo."""
        now = time.monotonic()
        with self._cache_lock:
            hit = self._cache.get(key)
            if hit and hit[0] > now:
                return hit[1]
        result = fetch()
        if not result:
            # Google a veces responde vacío una consulta que segundos después sí trae datos.
            time.sleep(EMPTY_RETRY_DELAY_SECONDS)
            result = fetch()
        if result:
            with self._cache_lock:
                self._cache[key] = (now + CACHE_TTL_SECONDS, result)
        return result

    def calendar(self, origins, destinations, date_from, date_to, trip_days, max_stops, currency):
        key = ("cal", tuple(origins), tuple(destinations), date_from, date_to, trip_days, max_stops, currency)
        return self._cached(
            key,
            lambda: self._calendar(origins, destinations, date_from, date_to, trip_days, max_stops, currency),
        )

    def flights(self, origins, destinations, depart_date, return_date, max_stops, currency, limit):
        key = ("fl", tuple(origins), tuple(destinations), depart_date, return_date, max_stops, currency, limit)
        return self._cached(
            key,
            lambda: self._flights(origins, destinations, depart_date, return_date, max_stops, currency, limit),
        )

    def _calendar(
        self,
        origins: list[str],
        destinations: list[str],
        date_from: date,
        date_to: date,
        trip_days: int | None,
        max_stops: MaxStops,
        currency: str,
    ) -> list[DatePrice]:
        date_from = max(date_from, date.today())
        if date_to < date_from:
            return []
        segments = [
            FlightSegment(
                departure_airport=_airports(origins),
                arrival_airport=_airports(destinations),
                travel_date=date_from.isoformat(),
            )
        ]
        if trip_days:
            segments.append(
                FlightSegment(
                    departure_airport=_airports(destinations),
                    arrival_airport=_airports(origins),
                    travel_date=(date_from + timedelta(days=trip_days)).isoformat(),
                )
            )
        filters = DateSearchFilters(
            trip_type=TripType.ROUND_TRIP if trip_days else TripType.ONE_WAY,
            passenger_info=PassengerInfo(adults=1),
            flight_segments=segments,
            stops=STOPS[max_stops],
            from_date=date_from.isoformat(),
            to_date=date_to.isoformat(),
            duration=trip_days,
        )
        results = _guarded(SearchDates()).search(
            filters, currency=currency, language=self._lang, country=self._country
        )
        out = []
        for r in results or []:
            out.append(
                DatePrice(
                    depart_date=r.date[0].date(),
                    return_date=r.date[1].date() if len(r.date) > 1 else None,
                    price=r.price,
                    currency=r.currency or currency,
                )
            )
        return sorted(out, key=lambda d: d.depart_date)

    def _flights(
        self,
        origins: list[str],
        destinations: list[str],
        depart_date: date,
        return_date: date | None,
        max_stops: MaxStops,
        currency: str,
        limit: int,
    ) -> list[FlightOption]:
        segments = [
            FlightSegment(
                departure_airport=_airports(origins),
                arrival_airport=_airports(destinations),
                travel_date=depart_date.isoformat(),
            )
        ]
        if return_date:
            segments.append(
                FlightSegment(
                    departure_airport=_airports(destinations),
                    arrival_airport=_airports(origins),
                    travel_date=return_date.isoformat(),
                )
            )
        filters = FlightSearchFilters(
            trip_type=TripType.ROUND_TRIP if return_date else TripType.ONE_WAY,
            passenger_info=PassengerInfo(adults=1),
            flight_segments=segments,
            stops=STOPS[max_stops],
            sort_by=SortBy.CHEAPEST,
        )
        # En ida y vuelta fli expande cada ida con sus regresos; top_n limita esa expansión.
        results = _guarded(SearchFlights()).search(
            filters,
            top_n=min(limit, 5),
            currency=currency,
            language=self._lang,
            country=self._country,
        )
        out: list[FlightOption] = []
        seen: set[tuple] = set()
        for r in results or []:
            option = self._round_trip(r, currency) if isinstance(r, tuple) else self._one_way(r, currency)
            key = tuple(l.airline_code + l.flight_number for l in option.legs + option.return_legs)
            if key in seen:
                continue
            seen.add(key)
            out.append(option)
        out.sort(key=lambda f: (f.price is None, f.price or 0))
        return out[:limit]

    @staticmethod
    def _one_way(r: FlightResult, currency: str) -> FlightOption:
        return FlightOption(
            price=r.price,
            currency=r.currency or currency,
            stops=r.stops,
            duration_min=r.duration,
            legs=[_leg(l) for l in r.legs],
            self_transfer=bool(r.self_transfer),
        )

    @staticmethod
    def _round_trip(pair: tuple[FlightResult, ...], currency: str) -> FlightOption:
        outbound, inbound = pair[0], pair[-1]
        # Google entrega el total ida+vuelta en el resultado del regreso.
        return FlightOption(
            price=inbound.price if inbound.price is not None else outbound.price,
            currency=inbound.currency or outbound.currency or currency,
            stops=max(outbound.stops, inbound.stops),
            duration_min=outbound.duration,
            legs=[_leg(l) for l in outbound.legs],
            return_legs=[_leg(l) for l in inbound.legs],
            self_transfer=bool(outbound.self_transfer or inbound.self_transfer),
        )
