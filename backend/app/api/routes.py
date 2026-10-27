from fastapi import APIRouter, HTTPException
from fli.core.airports import search_airports

from app.config import get_settings
from app.db import get_db
from app.models import CalendarRequest, CombosRequest, ComboVerifyRequest, FlightsRequest, WatchIn
from app.providers import get_provider
from app.providers.base import ProviderThrottled
from app.services import combos, history, watcher
from app.services.links import google_flights_url

router = APIRouter(prefix="/api")


def _currency(c: str | None) -> str:
    return (c or get_settings().default_currency).upper()


def _codes(codes: list[str]) -> list[str]:
    return [c.strip().upper() for c in codes if c.strip()]


@router.get("/airports")
def airports(q: str, limit: int = 8):
    return [{"code": m.code.name, "name": m.name} for m in search_airports(q, limit)]


@router.post("/calendar")
def calendar(req: CalendarRequest):
    currency = _currency(req.currency)
    origins, destinations = _codes(req.origins), _codes(req.destinations)
    try:
        prices = get_provider().calendar(
            origins, destinations, req.date_from, req.date_to, req.trip_days, req.max_stops, currency
        )
    except ProviderThrottled:
        raise
    except Exception as e:
        raise HTTPException(502, f"Error consultando precios: {e}") from e
    o, d = history.route_key(origins), history.route_key(destinations)
    cheapest = min(prices, key=lambda p: p.price) if prices else None
    # El veredicto se calcula antes de guardar para comparar solo contra el historial previo.
    verdict = (
        history.verdict(o, d, cheapest.depart_date, bool(req.trip_days), currency, cheapest.price)
        if cheapest
        else None
    )
    history.record_calendar(o, d, prices)
    return {
        "currency": currency,
        "prices": prices,
        "cheapest": cheapest,
        "verdict": verdict,
        "google_flights_url": google_flights_url(
            origins[0], destinations[0], cheapest.depart_date, cheapest.return_date, currency
        )
        if cheapest
        else None,
    }


@router.post("/flights")
def flights(req: FlightsRequest):
    currency = _currency(req.currency)
    origins, destinations = _codes(req.origins), _codes(req.destinations)
    try:
        options = get_provider().flights(
            origins, destinations, req.depart_date, req.return_date, req.max_stops, currency, req.limit
        )
    except ProviderThrottled:
        raise
    except Exception as e:
        raise HTTPException(502, f"Error consultando vuelos: {e}") from e
    o, d = history.route_key(origins), history.route_key(destinations)
    history.record_flights(o, d, req.depart_date, req.return_date, options)
    return {
        "currency": currency,
        "options": options,
        "google_flights_url": google_flights_url(
            origins[0], destinations[0], req.depart_date, req.return_date, currency
        ),
    }


@router.post("/combos")
def find_combos(req: CombosRequest):
    return {"combos": combos.find_combos(req)}


@router.post("/combos/verify")
def verify_combo(req: ComboVerifyRequest):
    try:
        return {"pairs": combos.verify_combo(req)}
    except ProviderThrottled:
        raise
    except Exception as e:
        raise HTTPException(502, f"Error verificando combinación: {e}") from e


@router.get("/history")
def route_history(origin: str, destination: str, round_trip: bool = False, currency: str | None = None):
    o, d = history.route_key(origin.split(",")), history.route_key(destination.split(","))
    return {"series": history.daily_minimums(o, d, _currency(currency), round_trip)}


@router.get("/watches")
def list_watches():
    return get_db().query("SELECT * FROM watches ORDER BY active DESC, created_at DESC")


@router.post("/watches", status_code=201)
def create_watch(w: WatchIn):
    if w.date_to < w.date_from:
        raise HTTPException(422, "date_to debe ser posterior a date_from")
    watch_id = get_db().execute(
        """INSERT INTO watches
           (origin, destination, date_from, date_to, trip_days, max_stops, target_price, currency, include_combos)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            history.route_key(w.origin.split(",")),
            history.route_key(w.destination.split(",")),
            w.date_from.isoformat(),
            w.date_to.isoformat(),
            w.trip_days,
            w.max_stops,
            w.target_price,
            _currency(w.currency),
            int(w.include_combos),
        ),
    )
    return get_db().query_one("SELECT * FROM watches WHERE id = ?", (watch_id,))


@router.patch("/watches/{watch_id}")
def toggle_watch(watch_id: int, active: bool):
    get_db().execute("UPDATE watches SET active = ? WHERE id = ?", (int(active), watch_id))
    return get_db().query_one("SELECT * FROM watches WHERE id = ?", (watch_id,))


@router.delete("/watches/{watch_id}", status_code=204)
def delete_watch(watch_id: int):
    get_db().execute("DELETE FROM alerts WHERE watch_id = ?", (watch_id,))
    get_db().execute("DELETE FROM watches WHERE id = ?", (watch_id,))


@router.post("/watches/{watch_id}/check")
def check_watch(watch_id: int):
    w = get_db().query_one("SELECT * FROM watches WHERE id = ?", (watch_id,))
    if not w:
        raise HTTPException(404, "Ruta vigilada no encontrada")
    try:
        return watcher.check_watch(w)
    except ProviderThrottled:
        raise
    except Exception as e:
        raise HTTPException(502, f"Error revisando la ruta: {e}") from e


@router.get("/alerts")
def list_alerts(limit: int = 50):
    return get_db().query(
        """SELECT a.*, w.origin, w.destination FROM alerts a
           JOIN watches w ON w.id = a.watch_id
           ORDER BY a.created_at DESC LIMIT ?""",
        (limit,),
    )
