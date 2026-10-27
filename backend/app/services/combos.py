"""Combinaciones de tiquetes separados vía hubs (self-transfer).

Se cotiza origen→hub y hub→destino con el calendario (2 llamadas por hub) y se
cruzan las fechas. Los precios son estimados: hay que verificar horarios con
`verify_combo` porque el calendario no trae horas de vuelo.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

from app.config import get_settings
from app.models import Combo, CombosRequest, ComboVerifyRequest, DatePrice, VerifiedCombo
from app.providers import get_provider
from app.providers.base import ProviderThrottled
from app.services import history
from app.services.links import google_flights_url


def _by_date(prices: list[DatePrice]) -> dict:
    return {p.depart_date: p.price for p in prices}


def find_combos(req: CombosRequest) -> list[Combo]:
    provider = get_provider()
    currency = req.currency or get_settings().default_currency
    origin, destination = req.origin.upper(), req.destination.upper()
    hubs = [h for h in (req.hubs or get_settings().hub_list) if h not in (origin, destination)]
    # El segundo tramo puede salir hasta max_layover_days después del fin del rango.
    second_to = req.date_to + timedelta(days=req.max_layover_days)

    def cal(o: str, d: str, start, end) -> list[DatePrice]:
        try:
            return provider.calendar([o], [d], start, end, None, "ANY", currency)
        except ProviderThrottled:
            raise
        except Exception:
            return []

    # Pocas consultas simultáneas: ráfagas grandes hacen que Google bloquee temporalmente.
    with ThreadPoolExecutor(max_workers=3) as pool:
        direct_f = pool.submit(cal, origin, destination, req.date_from, req.date_to)
        first_f = {h: pool.submit(cal, origin, h, req.date_from, req.date_to) for h in hubs}
        second_f = {h: pool.submit(cal, h, destination, req.date_from, second_to) for h in hubs}
        direct_prices = direct_f.result()
        first = {h: f.result() for h, f in first_f.items()}
        second = {h: f.result() for h, f in second_f.items()}

    direct = _by_date(direct_prices)
    history.record_calendar(origin, destination, direct_prices)

    combos: list[Combo] = []
    for hub in hubs:
        if not first[hub] or not second[hub]:
            continue
        history.record_calendar(origin, hub, first[hub])
        history.record_calendar(hub, destination, second[hub])
        second_by_date = _by_date(second[hub])
        for p1 in first[hub]:
            options = [
                (p1.depart_date + timedelta(days=k), second_by_date.get(p1.depart_date + timedelta(days=k)))
                for k in range(req.max_layover_days + 1)
            ]
            options = [(d, p) for d, p in options if p is not None]
            if not options:
                continue
            d2, p2 = min(options, key=lambda x: x[1])
            total = p1.price + p2
            direct_price = direct.get(p1.depart_date)
            combos.append(
                Combo(
                    depart_date=p1.depart_date,
                    hub=hub,
                    first_leg_date=p1.depart_date,
                    second_leg_date=d2,
                    first_leg_price=p1.price,
                    second_leg_price=p2,
                    total_price=total,
                    currency=currency,
                    direct_price=direct_price,
                    savings=(direct_price - total) if direct_price is not None else None,
                    google_flights_url_first=google_flights_url(origin, hub, p1.depart_date, None, currency),
                    google_flights_url_second=google_flights_url(hub, destination, d2, None, currency),
                )
            )

    # Mejor combinación por fecha de salida, luego ordenadas por precio total.
    best: dict = {}
    for c in combos:
        if c.depart_date not in best or c.total_price < best[c.depart_date].total_price:
            best[c.depart_date] = c
    return sorted(best.values(), key=lambda c: c.total_price)


def verify_combo(req: ComboVerifyRequest) -> list[VerifiedCombo]:
    """Busca vuelos reales de ambos tramos y arma pares con conexión segura."""
    provider = get_provider()
    currency = req.currency or get_settings().default_currency
    first = provider.flights([req.origin], [req.hub], req.first_leg_date, None, "ANY", currency, 30)
    second = provider.flights([req.hub], [req.destination], req.second_leg_date, None, "ANY", currency, 30)
    first = [f for f in first if f.price is not None]
    second = [f for f in second if f.price is not None]

    pairs: list[VerifiedCombo] = []
    for a in first:
        arrive: datetime = a.legs[-1].arrival
        for b in second:
            depart: datetime = b.legs[0].departure
            # Horas locales del mismo aeropuerto hub, así que se pueden restar directo.
            gap = int((depart - arrive).total_seconds() // 60)
            if gap < req.min_connection_min:
                continue
            pairs.append(
                VerifiedCombo(
                    first=a,
                    second=b,
                    connection_min=gap,
                    total_price=a.price + b.price,
                    currency=currency,
                )
            )
    pairs.sort(key=lambda p: (p.total_price, p.connection_min))
    return pairs[:10]
