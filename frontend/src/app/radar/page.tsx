"use client";

import { useCallback, useEffect, useState } from "react";
import PriceHistory from "@/components/PriceHistory";
import { api, type Alert, type Watch } from "@/lib/api";
import { money, shortDate } from "@/lib/format";

export default function RadarPage() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [w, a] = await Promise.all([api.watches(), api.alerts()]);
      setWatches(w);
      setAlerts(a);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="flex flex-col gap-3 lg:col-span-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Radar</h1>
          <p className="mt-1 text-sm text-ink-2">
            Rutas vigiladas. Pulsa “Revisar ahora” para consultar el precio actual y guardarlo en el historial.
          </p>
        </div>
        {error && <p className="text-sm text-critical">{error}</p>}
        {loaded && watches.length === 0 && (
          <p className="card p-5 text-sm text-ink-2">
            Aún no vigilas ninguna ruta. Haz una búsqueda y pulsa “Vigilar ruta”.
          </p>
        )}
        {watches.map((w) => (
          <WatchCard key={w.id} watch={w} onChange={refresh} />
        ))}
      </section>

      <aside className="flex flex-col gap-3">
        <h2 className="pt-1 font-semibold">Alertas recientes</h2>
        {alerts.length === 0 && <p className="text-sm text-ink-3">Sin alertas todavía.</p>}
        <ul className="flex flex-col gap-2">
          {alerts.map((a) => (
            <li key={a.id} className="card p-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono font-semibold">
                  {a.origin} → {a.via ? `${a.via} → ` : ""}
                  {a.destination}
                </span>
                <span className="num font-semibold">{money(a.price, a.currency)}</span>
              </div>
              <p className="mt-1 text-ink-2">
                {shortDate(a.depart_date)}
                {a.return_date && ` → ${shortDate(a.return_date)}`}
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {a.reason} · {a.created_at.slice(0, 16)} UTC
              </p>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function WatchCard({ watch: w, onChange }: { watch: Watch; onChange: () => void }) {
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [series, setSeries] = useState<{ day: string; min_price: number }[]>([]);

  useEffect(() => {
    api
      .history(w.origin, w.destination, w.trip_days != null, w.currency)
      .then((r) => setSeries(r.series))
      .catch(() => setSeries([]));
  }, [w.origin, w.destination, w.trip_days, w.currency, w.last_checked_at]);

  const check = async () => {
    setChecking(true);
    setMsg(null);
    try {
      const r = await api.checkWatch(w.id);
      setMsg(
        r.status === "sin_resultados"
          ? "Sin precios para ese rango"
          : r.status === "expirada"
            ? "El rango de fechas ya pasó; ruta pausada"
            : r.alerted
              ? "¡Nueva alerta!"
              : "Revisada, sin cambios importantes",
      );
      onChange();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const below = w.target_price != null && w.best_price != null && w.best_price <= w.target_price;

  return (
    <article className={`card p-5 ${w.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-mono text-lg font-semibold">
            {w.origin.replaceAll(",", "/")} → {w.destination.replaceAll(",", "/")}
          </h3>
          <p className="text-sm text-ink-2">
            Salida {shortDate(w.date_from)} – {shortDate(w.date_to)} ·{" "}
            {w.trip_days ? `ida y vuelta ${w.trip_days} días` : "solo ida"}
            {w.include_combos ? " · incluye hubs" : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="num text-xl font-semibold">{money(w.best_price, w.currency)}</p>
          {w.best_depart_date && (
            <p className="text-xs text-ink-2">
              {shortDate(w.best_depart_date)}
              {w.best_return_date && ` → ${shortDate(w.best_return_date)}`}
            </p>
          )}
          {w.target_price != null && (
            <p className={`text-xs ${below ? "text-good-ink" : "text-ink-3"}`}>
              {below ? "✓ " : ""}objetivo {money(w.target_price, w.currency)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <PriceHistory series={series} currency={w.currency} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn-primary px-3 py-1.5 text-xs" onClick={check} disabled={checking}>
          {checking ? "Revisando…" : "Revisar ahora"}
        </button>
        <button
          className="btn-ghost px-3 py-1.5 text-xs"
          onClick={async () => {
            await api.toggleWatch(w.id, !w.active);
            onChange();
          }}
        >
          {w.active ? "Pausar" : "Reanudar"}
        </button>
        {confirmDelete ? (
          <>
            <span className="text-xs text-ink-2">¿Eliminar ruta y sus alertas?</span>
            <button
              className="btn-ghost px-3 py-1.5 text-xs text-critical"
              onClick={async () => {
                await api.deleteWatch(w.id);
                onChange();
              }}
            >
              Sí, eliminar
            </button>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setConfirmDelete(true)}>
            Eliminar
          </button>
        )}
        {msg && <span className="text-xs text-ink-2">{msg}</span>}
        <span className="ml-auto text-xs text-ink-3">
          {w.last_checked_at ? `Última revisión ${w.last_checked_at.slice(0, 16)} UTC` : "Sin revisar"}
        </span>
      </div>
    </article>
  );
}
