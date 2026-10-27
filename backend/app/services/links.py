from datetime import date
from urllib.parse import urlencode

from app.config import get_settings


def google_flights_url(
    origin: str,
    destination: str,
    depart: date,
    return_date: date | None = None,
    currency: str | None = None,
) -> str:
    """Link a Google Flights con la búsqueda precargada para comprar allá."""
    s = get_settings()
    q = f"Flights from {origin} to {destination} on {depart.isoformat()}"
    if return_date:
        q += f" through {return_date.isoformat()}"
    else:
        q += " one way"
    params = {
        "q": q,
        "curr": currency or s.default_currency,
        "hl": s.default_language,
        "gl": s.default_country,
    }
    return "https://www.google.com/travel/flights?" + urlencode(params)
