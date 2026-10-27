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
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
      {label && <span className="w-12 text-xs font-medium uppercase text-ink-3">{label}</span>}
      <div className="num text-base font-semibold">
        {time(first.departure)} – {time(last.arrival)}
        {dayShift > 0 && <sup className="ml-0.5 text-[10px] text-critical">+{dayShift}</sup>}
      </div>
      <div className="text-sm text-ink-2">
        {first.origin} → {last.destination}
      </div>
      <div className="text-sm text-ink-2">
        {stops.length === 0 ? "Directo" : `${stops.length} escala${stops.length > 1 ? "s" : ""} (${stops.join(", ")})`}
      </div>
      <div className="text-sm text-ink-3">{duration(Math.round(total))}</div>
      <div className="basis-full text-xs text-ink-3">
        {airlines} · {legs.map((l) => `${l.airline_code}${l.flight_number}`).join(", ")}
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
  if (!options.length) return <p className="text-sm text-ink-2">No se encontraron vuelos para esa fecha.</p>;
  const roundTrip = options.some((o) => o.return_legs.length);
  return (
    <ul className="flex flex-col gap-2">
      {options.map((o, i) => (
        <li key={i} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3">
            <Route legs={o.legs} label={roundTrip ? "Ida" : undefined} />
            {roundTrip && <Route legs={o.return_legs} label="Vuelta" />}
            {o.self_transfer && (
              <span className="text-xs text-ink-2">⚠ Self-transfer: tiquetes separados, recoges maleta en la conexión</span>
            )}
          </div>
          <div className="flex items-center gap-3 sm:flex-col sm:items-end">
            <span className="num text-lg font-semibold">{money(o.price, currency)}</span>
            <a href={googleUrl} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1.5 text-xs">
              Ver en Google Flights ↗
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}
