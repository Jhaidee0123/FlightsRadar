"""Radar: revisa periódicamente las rutas vigiladas y genera alertas."""

import asyncio
import logging
from datetime import date, timedelta

from app.config import get_settings
from app.db import get_db
from app.models import CombosRequest
from app.providers import get_provider
from app.providers.base import ProviderThrottled
from app.services import history
from app.services.alerts import send_telegram
from app.services.combos import find_combos
from app.services.links import google_flights_url

log = logging.getLogger(__name__)

# Una caída mayor a esto frente al mejor precio anterior cuenta como "nuevo mínimo".
NEW_LOW_DROP = 0.05


def check_watch(w: dict) -> dict:
    origin, destination, currency = w["origin"], w["destination"], w["currency"]
    date_from = date.fromisoformat(w["date_from"])
    date_to = date.fromisoformat(w["date_to"])
    trip_days = w["trip_days"]

    if date_to < date.today():
        get_db().execute("UPDATE watches SET active = 0 WHERE id = ?", (w["id"],))
        return {"watch_id": w["id"], "status": "expirada"}

    prices = get_provider().calendar(
        origin.split(","), destination.split(","), date_from, date_to, trip_days, w["max_stops"], currency
    )
    best = min(prices, key=lambda p: p.price) if prices else None
    best_price = best.price if best else None
    best_depart = best.depart_date if best else None
    best_return = best.return_date if best else None
    via = None

    if w["include_combos"] and not trip_days and "," not in origin + destination:
        combos = find_combos(
            CombosRequest(origin=origin, destination=destination, date_from=date_from, date_to=date_to, currency=currency)
        )
        if combos and (best_price is None or combos[0].total_price < best_price):
            c = combos[0]
            best_price, best_depart, best_return, via = c.total_price, c.depart_date, None, c.hub

    if best_price is None:
        history.record_calendar(origin, destination, prices)
        get_db().execute("UPDATE watches SET last_checked_at = datetime('now') WHERE id = ?", (w["id"],))
        return {"watch_id": w["id"], "status": "sin_resultados"}

    reasons = []
    if w["target_price"] and best_price <= w["target_price"]:
        reasons.append("precio objetivo alcanzado")
    if w["best_price"] and best_price < w["best_price"] * (1 - NEW_LOW_DROP):
        reasons.append(f"nuevo mínimo (antes {w['best_price']:,.0f})")
    v = history.verdict(origin, destination, best_depart, bool(trip_days), currency, best_price)
    if v.level == "excelente":
        reasons.append(f"precio excelente (percentil {v.percentile})")
    history.record_calendar(origin, destination, prices)

    alerted = False
    if reasons and not _recently_alerted(w["id"], best_price):
        reason = "; ".join(reasons)
        get_db().execute(
            """INSERT INTO alerts (watch_id, price, currency, depart_date, return_date, reason, via)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                w["id"], best_price, currency, best_depart.isoformat(),
                best_return.isoformat() if best_return else None, reason, via,
            ),
        )
        route = f"{origin} → {via} → {destination}" if via else f"{origin} → {destination}"
        dates = best_depart.isoformat() + (f" / {best_return.isoformat()}" if best_return else "")
        link = google_flights_url(origin, destination, best_depart, best_return, currency)
        send_telegram(f"✈️ {route}\n{best_price:,.0f} {currency} · {dates}\n{reason}\n{link}")
        alerted = True

    get_db().execute(
        """UPDATE watches SET best_price = ?, best_depart_date = ?, best_return_date = ?,
               last_checked_at = datetime('now') WHERE id = ?""",
        (best_price, best_depart.isoformat(), best_return.isoformat() if best_return else None, w["id"]),
    )
    return {
        "watch_id": w["id"],
        "status": "ok",
        "best_price": best_price,
        "depart_date": best_depart,
        "return_date": best_return,
        "via": via,
        "alerted": alerted,
        "reasons": reasons,
    }


def _recently_alerted(watch_id: int, price: float) -> bool:
    """Evita repetir la misma alerta: solo vuelve a avisar si el precio bajó o pasó un día."""
    since = (date.today() - timedelta(days=1)).isoformat()
    row = get_db().query_one(
        "SELECT 1 FROM alerts WHERE watch_id = ? AND price <= ? AND created_at >= ? LIMIT 1",
        (watch_id, price, since),
    )
    return row is not None


def check_all() -> list[dict]:
    results = []
    for w in get_db().query("SELECT * FROM watches WHERE active = 1"):
        try:
            results.append(check_watch(w))
        except ProviderThrottled:
            # Seguir consultando solo alarga el bloqueo; el próximo ciclo lo reintenta.
            log.warning("Proveedor limitando consultas; se pospone el resto del ciclo")
            results.append({"watch_id": w["id"], "status": "limitado"})
            break
        except Exception as e:  # una ruta rota no debe detener el radar
            log.exception("Error revisando watch %s", w["id"])
            results.append({"watch_id": w["id"], "status": "error", "error": str(e)})
    return results


async def radar_loop() -> None:
    minutes = get_settings().watch_interval_minutes
    if minutes <= 0:
        return
    while True:
        try:
            await asyncio.to_thread(check_all)
        except Exception:
            log.exception("Fallo en el ciclo del radar")
        await asyncio.sleep(minutes * 60)
