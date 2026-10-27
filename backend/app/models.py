from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

MaxStops = Literal["ANY", "NON_STOP", "ONE_STOP", "TWO_STOPS"]


class DatePrice(BaseModel):
    depart_date: date
    return_date: date | None = None
    price: float
    currency: str


class Leg(BaseModel):
    airline_code: str
    airline_name: str
    flight_number: str
    origin: str
    destination: str
    departure: datetime
    arrival: datetime
    duration_min: int


class FlightOption(BaseModel):
    price: float | None
    currency: str
    stops: int
    duration_min: int
    legs: list[Leg]
    return_legs: list[Leg] = []
    self_transfer: bool = False


class CalendarRequest(BaseModel):
    origins: list[str] = Field(min_length=1)
    destinations: list[str] = Field(min_length=1)
    date_from: date
    date_to: date
    trip_days: int | None = Field(default=None, ge=1, le=60)
    max_stops: MaxStops = "ANY"
    currency: str | None = None


class FlightsRequest(BaseModel):
    origins: list[str] = Field(min_length=1)
    destinations: list[str] = Field(min_length=1)
    depart_date: date
    return_date: date | None = None
    max_stops: MaxStops = "ANY"
    currency: str | None = None
    limit: int = Field(default=20, ge=1, le=100)


class CombosRequest(BaseModel):
    origin: str
    destination: str
    date_from: date
    date_to: date
    hubs: list[str] | None = None
    currency: str | None = None
    # Días permitidos entre llegar al hub y salir del hub (0 = mismo día)
    max_layover_days: int = Field(default=1, ge=0, le=3)


class Combo(BaseModel):
    depart_date: date
    hub: str
    first_leg_date: date
    second_leg_date: date
    first_leg_price: float
    second_leg_price: float
    total_price: float
    currency: str
    direct_price: float | None
    savings: float | None
    google_flights_url_first: str
    google_flights_url_second: str


class ComboVerifyRequest(BaseModel):
    origin: str
    hub: str
    destination: str
    first_leg_date: date
    second_leg_date: date
    currency: str | None = None
    # Margen mínimo para un self-transfer (recoger maleta, migración, re-check-in)
    min_connection_min: int = Field(default=180, ge=60, le=1440)


class VerifiedCombo(BaseModel):
    first: FlightOption
    second: FlightOption
    connection_min: int
    total_price: float
    currency: str


class Verdict(BaseModel):
    level: Literal["excelente", "bueno", "normal", "caro", "sin_datos"]
    percentile: float | None
    median: float | None
    samples: int


class WatchIn(BaseModel):
    origin: str
    destination: str
    date_from: date
    date_to: date
    trip_days: int | None = Field(default=None, ge=1, le=60)
    max_stops: MaxStops = "ANY"
    target_price: float | None = None
    currency: str | None = None
    include_combos: bool = False
