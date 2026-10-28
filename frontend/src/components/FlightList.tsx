import type { FlightOption, Leg } from "@/lib/api";
import { duration, money, time } from "@/lib/format";

function Route({ legs, label }: { legs: Leg[]; label?: string }) {
  if (!legs.length) return null;
  const first = legs[0];
  const last = legs[legs.length - 1];
  const stops = legs.slice(0, -1).map((l) => l.destination);
  const airlines = [...new Set(legs.map((l) => l.airline_name))].join(" · ");
  // Vuelos + escalas. Cada escala ocurre en un mismo aeropuerto, así que restar horas locales es válido.
  const total = legs.reduce((sum, l, i) => {
    const layover = i > 0 ? (Date.parse(l.departure) - Date.parse(legs[i - 1].arrival)) / 60000 : 0;
    return sum + l.duration_min + layover;
  }, 0);
  const dayShift = Math.round(
    (Date.parse(last.arrival.slice(0, 10)) - Date.parse(first.departure.slice(0, 10))) / 86400000,
  );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-ink-3">
        {label && (
          <span className="rounded bg-surface-3 px-1.5 py-0.5 font-medium uppercase tracking-wide text-ink-2">{label}</span>
        )}
        <span className="truncate">
          {airlines} · {legs.map((l) => `${l.airline_code}${l.flight_number}`).join(", ")}
        </span>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-4">
        <div>
          <p className="num text-xl font-semibold leading-none">{time(first.departure)}</p>
          <p className="mt-1 text-xs font-medium text-ink-2">{first.origin}</p>
        </div>
        <div className="flex min-w-[7rem] flex-col items-center gap-1">
          <span className="text-[11px] text-ink-3">{duration(Math.round(total))}</span>
          <div className="relative flex h-2 w-full items-center">
            <span className="h-px w-full bg-line-strong" />
            <span className="absolute left-0 h-1.5 w-1.5 rounded-full bg-ink-3" />
            {stops.map((s, i) => (
              <span
                key={s + i}
                className="absolute h-2 w-2 -translate-x-1/2 rounded-full border-2 border-surface bg-warning"
                style={{ left: `${((i + 1) / (stops.length + 1)) * 100}%` }}
                title={`Escala en ${s}`}
              />
            ))}
            <span className="absolute right-0 h-1.5 w-1.5 rounded-full bg-accent" />
          </div>
          <span className={`text-[11px] ${stops.length ? "text-ink-2" : "text-good-ink"}`}>
            {stops.length === 0 ? "Directo" : `${stops.length} escala${stops.length > 1 ? "s" : ""} · ${stops.join(", ")}`}
          </span>
        </div>
        <div className="text-right">
          <p className="num text-xl font-semibold leading-none">
            {time(last.arrival)}
            {dayShift > 0 && <sup className="ml-0.5 text-[10px] font-medium text-warning">+{dayShift}</sup>}
          </p>
          <p className="mt-1 text-xs font-medium text-ink-2">{last.destination}</p>
        </div>
      </div>
    </div>
  );
}

export default function FlightList({
  options,
  currency,
  googleUrl,
}: {
  options: FlightOption[];
  currency: string;
  googleUrl: string;
}) {
  if (!options.length) return <p className="card p-5 text-sm text-ink-2">No se encontraron vuelos para esa fecha.</p>;
  const roundTrip = options.some((o) => o.return_legs.length);
  const cheapest = Math.min(...options.map((o) => o.price ?? Infinity));
  return (
    <ul className="flex flex-col gap-2.5">
      {options.map((o, i) => {
        const isCheapest = o.price === cheapest;
        return (
          <li
            key={i}
            className={`card flex flex-col gap-4 p-4 transition hover:border-line-strong sm:flex-row sm:items-center sm:gap-6 sm:p-5 ${
              isCheapest ? "border-accent/50" : ""
            }`}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <Route legs={o.legs} label={roundTrip ? "Ida" : undefined} />
              {roundTrip && <Route legs={o.return_legs} label="Vuelta" />}
              {o.self_transfer && (
                <p className="text-xs text-ink-2">
                  <span className="text-warning" aria-hidden>
                    ⚠
                  </span>{" "}
                  Self-transfer: tiquetes separados, recoges la maleta en la conexión
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line pt-3 sm:w-44 sm:flex-col sm:items-end sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
              <div className="sm:text-right">
                {isCheapest && <p className="eyebrow text-accent">Más barato</p>}
                <p className="num text-2xl font-semibold tracking-tight">{money(o.price, currency)}</p>
              </div>
              <a href={googleUrl} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1.5 text-xs">
                Ver en Google Flights ↗
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
