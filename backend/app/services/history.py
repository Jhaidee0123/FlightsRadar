"""Historial propio de precios y veredicto de "¿es buen precio?"."""

from datetime import date, timedelta

from app.db import get_db
from app.models import DatePrice, FlightOption, Verdict

# Ventana de temporada: se compara contra salidas cercanas a la fecha consultada.
SEASON_WINDOW_DAYS = 45
MIN_SAMPLES = 15


def route_key(codes: list[str]) -> str:
    return ",".join(sorted(c.strip().upper() for c in codes))


def record_calendar(origin: str, destination: str, prices: list[DatePrice]) -> None:
    get_db().executemany(
        """INSERT INTO price_observations
           (origin, destination, depart_date, return_date, price, currency, source)
           VALUES (?, ?, ?, ?, ?, ?, 'calendar')""",
        [
            (
                origin,
                destination,
                p.depart_date.isoformat(),
                p.return_date.isoformat() if p.return_date else None,
                p.price,
                p.currency,
            )
            for p in prices
        ],
    )


def record_flights(
    origin: str,
    destination: str,
    depart: date,
    return_date: date | None,
    options: list[FlightOption],
) -> None:
    priced = [o for o in options if o.price is not None]
    if not priced:
        return
    best = min(priced, key=lambda o: o.price)
    airlines = ",".join(sorted({l.airline_code for l in best.legs + best.return_legs}))
    get_db().execute(
        """INSERT INTO price_observations
           (origin, destination, depart_date, return_date, price, currency, source, stops, airlines)
           VALUES (?, ?, ?, ?, ?, ?, 'flights', ?, ?)""",
        (
            origin,
            destination,
            depart.isoformat(),
            return_date.isoformat() if return_date else None,
            best.price,
            best.currency,
            best.stops,
            airlines,
        ),
    )


def verdict(
    origin: str,
    destination: str,
    depart: date,
    round_trip: bool,
    currency: str,
    price: float,
) -> Verdict:
    lo = (depart - timedelta(days=SEASON_WINDOW_DAYS)).isoformat()
    hi = (depart + timedelta(days=SEASON_WINDOW_DAYS)).isoformat()
    since = (date.today() - timedelta(days=365)).isoformat()
    rows = get_db().query(
        f"""SELECT price FROM price_observations
            WHERE origin = ? AND destination = ? AND currency = ? AND source = 'calendar'
              AND return_date IS {'NOT ' if round_trip else ''}NULL
              AND depart_date BETWEEN ? AND ? AND observed_at >= ?""",
        (origin, destination, currency, lo, hi, since),
    )
    prices = sorted(r["price"] for r in rows)
    n = len(prices)
    if n < MIN_SAMPLES:
        return Verdict(level="sin_datos", percentile=None, median=None, samples=n)
    below = sum(1 for p in prices if p < price)
    pct = round(100 * below / n, 1)
    median = prices[n // 2] if n % 2 else (prices[n // 2 - 1] + prices[n // 2]) / 2
    if pct <= 10:
        level = "excelente"
    elif pct <= 30:
        level = "bueno"
    elif pct <= 70:
        level = "normal"
    else:
        level = "caro"
    return Verdict(level=level, percentile=pct, median=median, samples=n)


def daily_minimums(
    origin: str, destination: str, currency: str, round_trip: bool, days: int = 90
) -> list[dict]:
    """Mínimo observado por día de observación: cómo ha evolucionado la ruta."""
    since = (date.today() - timedelta(days=days)).isoformat()
    return get_db().query(
        f"""SELECT date(observed_at) AS day, MIN(price) AS min_price, COUNT(*) AS samples
            FROM price_observations
            WHERE origin = ? AND destination = ? AND currency = ?
              AND return_date IS {'NOT ' if round_trip else ''}NULL
              AND observed_at >= ?
            GROUP BY date(observed_at) ORDER BY day""",
        (origin, destination, currency, since),
    )
