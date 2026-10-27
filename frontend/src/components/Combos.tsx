"use client";

import { useState } from "react";
import { api, type Combo, type VerifiedCombo } from "@/lib/api";
import { duration, money, shortDate, time } from "@/lib/format";

interface Props {
  origin: string;
  destination: string;
  dateFrom: string;
  dateTo: string;
  currency: string;
}

export default function Combos({ origin, destination, dateFrom, dateTo, currency }: Props) {
  const [combos, setCombos] = useState<Combo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.combos({ origin, destination, date_from: dateFrom, date_to: dateTo, currency });
      setCombos(r.combos);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Combinaciones vía hubs</h3>
          <p className="mt-1 max-w-xl text-sm text-ink-2">
            Tiquetes separados {origin} → hub → {destination}. Google Flights casi nunca los arma. Los precios son
            estimados del calendario: verifica horarios antes de comprar.
          </p>
        </div>
        <button className="btn-primary" onClick={run} disabled={loading}>
          {loading ? "Buscando en hubs…" : combos ? "Volver a buscar" : "Buscar combinaciones"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-critical">{error}</p>}
      {combos && combos.length === 0 && <p className="mt-4 text-sm text-ink-2">No hay combinaciones en ese rango.</p>}
      {combos && combos.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-ink-3">
              <tr className="border-b border-line">
                <th className="py-2 font-medium">Salida</th>
                <th className="py-2 font-medium">Vía</th>
                <th className="py-2 text-right font-medium">Estimado</th>
                <th className="py-2 text-right font-medium">Directo</th>
                <th className="py-2 text-right font-medium">Ahorro</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {combos.slice(0, 12).map((c) => (
                <ComboRow key={c.depart_date + c.hub} combo={c} origin={origin} destination={destination} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ComboRow({ combo: c, origin, destination }: { combo: Combo; origin: string; destination: string }) {
  const [pairs, setPairs] = useState<VerifiedCombo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.verifyCombo({
        origin,
        hub: c.hub,
        destination,
        first_leg_date: c.first_leg_date,
        second_leg_date: c.second_leg_date,
        currency: c.currency,
      });
      setPairs(r.pairs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const best = pairs?.[0];
  return (
    <>
      <tr className="border-b border-line align-top">
        <td className="py-2.5">
          {shortDate(c.first_leg_date)}
          {c.second_leg_date !== c.first_leg_date && (
            <span className="block text-xs text-ink-3">2º tramo {shortDate(c.second_leg_date)}</span>
          )}
        </td>
        <td className="py-2.5 font-mono font-semibold">{c.hub}</td>
        <td className="num py-2.5 text-right font-semibold">{money(c.total_price, c.currency)}</td>
        <td className="num py-2.5 text-right text-ink-2">{money(c.direct_price, c.currency)}</td>
        <td className="num py-2.5 text-right">
          {c.savings != null && c.savings > 0 ? (
            <span className="text-good-ink">▼ {money(c.savings, c.currency)}</span>
          ) : (
            <span className="text-ink-3">—</span>
          )}
        </td>
        <td className="py-2.5 pl-3 text-right">
          <button className="btn-ghost px-3 py-1 text-xs" onClick={verify} disabled={loading}>
            {loading ? "Verificando…" : "Verificar"}
          </button>
        </td>
      </tr>
      {(pairs || error) && (
        <tr className="border-b border-line bg-surface-2">
          <td colSpan={6} className="px-3 py-3">
            {error && <p className="text-sm text-critical">{error}</p>}
            {pairs && !best && (
              <p className="text-sm text-ink-2">
                No hay vuelos reales que conecten con al menos 3 h de margen ese día. Prueba otra fecha.
              </p>
            )}
            {best && (
              <div className="flex flex-col gap-2 text-sm">
                <p>
                  <span className="font-semibold">Precio real verificado: {money(best.total_price, best.currency)}</span>
                  <span className="text-ink-2"> · conexión de {duration(best.connection_min)} en {c.hub}</span>
                  {c.direct_price != null && best.total_price < c.direct_price && (
                    <span className="text-good-ink">
                      {" "}
                      · ahorras {money(c.direct_price - best.total_price, best.currency)}
                    </span>
                  )}
                </p>
                {[best.first, best.second].map((f, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-x-4 text-ink-2">
                    <span className="w-16 text-xs uppercase text-ink-3">Tramo {i + 1}</span>
                    <span className="num">
                      {f.legs[0].departure.slice(0, 10)} {time(f.legs[0].departure)} –{" "}
                      {time(f.legs[f.legs.length - 1].arrival)}
                    </span>
                    <span>
                      {f.legs.map((l) => `${l.airline_code}${l.flight_number} ${l.origin}-${l.destination}`).join(", ")}
                    </span>
                    <span className="num">{money(f.price, f.currency)}</span>
                    <a
                      className="text-accent underline-offset-2 hover:underline"
                      href={i === 0 ? c.google_flights_url_first : c.google_flights_url_second}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Google Flights ↗
                    </a>
                  </div>
                ))}
                <p className="text-xs text-ink-3">
                  Son dos reservas independientes: si el primer vuelo se retrasa, la aerolínea del segundo no responde.
                  Revisa visa de tránsito en {c.hub} y el equipaje.
                </p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
