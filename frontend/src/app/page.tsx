"use client";

import { useState } from "react";
import AirportInput from "@/components/AirportInput";
import Combos from "@/components/Combos";
import FlightList from "@/components/FlightList";
import PriceCalendar from "@/components/PriceCalendar";
import VerdictBadge from "@/components/VerdictBadge";
import { api, type DatePrice, type FlightOption, type MaxStops, type Verdict } from "@/lib/api";
import { addDays, codes, money, shortDate, toIso } from "@/lib/format";

const today = toIso(new Date());

interface CalendarResult {
  currency: string;
  prices: DatePrice[];
  cheapest: DatePrice | null;
  verdict: Verdict | null;
  google_flights_url: string | null;
}

/** ow: solo ida · rt: ida y vuelta en un tiquete · split: ida y regreso como dos tiquetes. */
type TripMode = "ow" | "rt" | "split";

interface Searched {
  origins: string[];
  destinations: string[];
  mode: TripMode;
}

/** Ida + regreso más barato con el regreso al menos un día después de la ida. */
function cheapestPair(outbound: DatePrice[], inbound: DatePrice[]) {
  let best: { out: DatePrice; ret: DatePrice; total: number } | null = null;
  for (const out of outbound) {
    for (const ret of inbound) {
      const total = out.price + ret.price;
      if (ret.depart_date > out.depart_date && (!best || total < best.total)) best = { out, ret, total };
    }
  }
  return best;
}

/** Día elegido en un calendario y sus vuelos. */
function useDayFlights(onError: (msg: string) => void) {
  const [selected, setSelected] = useState<DatePrice | null>(null);
  const [flights, setFlights] = useState<{ options: FlightOption[]; url: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (p: DatePrice, origins: string[], destinations: string[], maxStops: MaxStops, currency: string) => {
    setSelected(p);
    setFlights(null);
    setLoading(true);
    try {
      const r = await api.flights({
        origins,
        destinations,
        depart_date: p.depart_date,
        return_date: p.return_date,
        max_stops: maxStops,
        currency,
        limit: 10,
      });
      setFlights({ options: r.options, url: r.google_flights_url });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSelected(null);
    setFlights(null);
  };

  return { selected, flights, loading, load, reset };
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 4 3 8l4 4" />
      <path d="M3 8h13" />
      <path d="m17 20 4-4-4-4" />
      <path d="M21 16H8" />
    </svg>
  );
}

const MODES: { id: TripMode; label: string }[] = [
  { id: "ow", label: "Solo ida" },
  { id: "rt", label: "Ida y vuelta" },
  { id: "split", label: "Ida + regreso separados" },
];

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function PillSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="relative inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1.5 pr-8 pl-3.5 text-sm transition hover:border-line-strong focus-within:border-accent">
      <span className="text-ink-3">{label}</span>
      <select
        className="cursor-pointer appearance-none bg-transparent font-medium text-ink outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 text-ink-3">
        <Chevron />
      </span>
    </label>
  );
}

function DateRange({
  label,
  from,
  to,
  min,
  onFrom,
  onTo,
  className = "",
}: {
  label: string;
  from: string;
  to: string;
  min: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={`search-box min-h-[4.25rem] ${className}`}>
      <span className="eyebrow block">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="date"
          aria-label={`${label}: desde`}
          className="num min-w-0 flex-1 bg-transparent text-base font-medium outline-none"
          min={min}
          value={from}
          onChange={(e) => onFrom(e.target.value)}
        />
        <span className="text-ink-3" aria-hidden>
          →
        </span>
        <input
          type="date"
          aria-label={`${label}: hasta`}
          className="num min-w-0 flex-1 bg-transparent text-base font-medium outline-none"
          min={from}
          value={to}
          onChange={(e) => onTo(e.target.value)}
        />
      </div>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <p className="eyebrow">{eyebrow}</p>
      <h3 className="mt-1 text-lg font-semibold tracking-tight">{title}</h3>
    </div>
  );
}

function PlaneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
    </svg>
  );
}

export default function SearchPage() {
  const [origin, setOrigin] = useState("MDE");
  const [destination, setDestination] = useState("BOG");
  const [dateFrom, setDateFrom] = useState(addDays(today, 14));
  const [dateTo, setDateTo] = useState(addDays(today, 75));
  const [returnFrom, setReturnFrom] = useState(addDays(today, 21));
  const [returnTo, setReturnTo] = useState(addDays(today, 82));
  const [mode, setMode] = useState<TripMode>("ow");
  const [tripDays, setTripDays] = useState(15);
  const [maxStops, setMaxStops] = useState<MaxStops>("ANY");
  const [currency, setCurrency] = useState("COP");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<CalendarResult | null>(null);
  const [returnCalendar, setReturnCalendar] = useState<CalendarResult | null>(null);
  const [searched, setSearched] = useState<Searched | null>(null);

  const outbound = useDayFlights(setError);
  const inbound = useDayFlights(setError);

  const [watchTarget, setWatchTarget] = useState("");
  const [watchMsg, setWatchMsg] = useState<string | null>(null);

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const search = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    const origins = codes(origin);
    const destinations = codes(destination);
    if (!origins.length || !destinations.length) return;
    if (mode === "split" && returnTo <= dateFrom) {
      setError("El rango de regreso debe terminar después de la primera fecha de ida.");
      return;
    }
    setLoading(true);
    setError(null);
    setCalendar(null);
    setReturnCalendar(null);
    outbound.reset();
    inbound.reset();
    setWatchMsg(null);
    try {
      const common = { max_stops: maxStops, currency };
      const [out, ret] = await Promise.all([
        api.calendar({
          origins,
          destinations,
          date_from: dateFrom,
          date_to: dateTo,
          trip_days: mode === "rt" ? tripDays : null,
          ...common,
        }),
        mode === "split"
          ? api.calendar({ origins: destinations, destinations: origins, date_from: returnFrom, date_to: returnTo, ...common })
          : Promise.resolve(null),
      ]);
      setCalendar(out);
      setReturnCalendar(ret);
      setSearched({ origins, destinations, mode });

      if (ret) {
        const pair = cheapestPair(out.prices, ret.prices);
        const first = pair?.out ?? out.cheapest;
        const back = pair?.ret ?? ret.cheapest;
        if (first) outbound.load(first, origins, destinations, maxStops, currency);
        if (back) inbound.load(back, destinations, origins, maxStops, currency);
      } else if (out.cheapest) {
        outbound.load(out.cheapest, origins, destinations, maxStops, currency);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const watch = async () => {
    if (!searched) return;
    try {
      await api.createWatch({
        origin: searched.origins.join(","),
        destination: searched.destinations.join(","),
        date_from: dateFrom,
        date_to: dateTo,
        trip_days: searched.mode === "rt" ? tripDays : null,
        max_stops: maxStops,
        target_price: watchTarget ? Number(watchTarget) : null,
        currency,
        include_combos: searched.mode !== "rt" && searched.origins.length === 1 && searched.destinations.length === 1,
      });
      setWatchMsg("Ruta agregada al radar ✓");
    } catch (e) {
      setWatchMsg((e as Error).message);
    }
  };

  const single = searched && searched.origins.length === 1 && searched.destinations.length === 1;
  const split = searched?.mode === "split" && calendar && returnCalendar;
  const best = split ? cheapestPair(calendar.prices, returnCalendar.prices) : null;
  const chosen =
    outbound.selected && inbound.selected && inbound.selected.depart_date > outbound.selected.depart_date
      ? outbound.selected.price + inbound.selected.price
      : null;
  const chosenIsBest =
    best && outbound.selected?.depart_date === best.out.depart_date && inbound.selected?.depart_date === best.ret.depart_date;

  return (
    <div className="flex flex-col gap-8">
      <section className="max-w-3xl">
        <p className="eyebrow text-accent">Radar de tarifas</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Encuentra el vuelo más barato</h1>
        <p className="mt-3 text-ink-2">
          Escaneamos meses de fechas, armamos combinaciones por hubs y te decimos si el precio de verdad es bueno.
        </p>
      </section>

      <form onSubmit={search} className="card flex flex-col gap-4 p-4 shadow-[0_40px_100px_-50px_rgb(37_99_235/0.6)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="seg flex-wrap" role="group" aria-label="Tipo de viaje">
            {MODES.map((m) => (
              <button key={m.id} type="button" aria-pressed={mode === m.id} className="seg-item" onClick={() => setMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mode === "rt" && (
              <label className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pr-1 pl-3.5 text-sm">
                <span className="text-ink-3">Duración</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  className="num w-12 rounded-full bg-surface-3 px-2 py-0.5 text-center font-medium text-ink outline-none focus:ring-2 focus:ring-accent-soft"
                  value={tripDays}
                  onChange={(e) => setTripDays(Number(e.target.value))}
                />
                <span className="pr-2 text-ink-3">días</span>
              </label>
            )}
            <PillSelect
              label="Escalas"
              value={maxStops}
              onChange={setMaxStops}
              options={[
                { value: "ANY", label: "Cualquiera" },
                { value: "NON_STOP", label: "Solo directos" },
                { value: "ONE_STOP", label: "Máximo 1" },
                { value: "TWO_STOPS", label: "Máximo 2" },
              ]}
            />
            <PillSelect
              label="Moneda"
              value={currency}
              onChange={setCurrency}
              options={["COP", "USD", "EUR", "JPY"].map((c) => ({ value: c, label: c }))}
            />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-12">
          <div className="relative grid gap-2 sm:grid-cols-2 lg:col-span-6">
            <AirportInput label="Desde" value={origin} onChange={setOrigin} placeholder="¿Desde dónde?" />
            <AirportInput label="Hacia" value={destination} onChange={setDestination} placeholder="¿A dónde vas?" />
            <button
              type="button"
              onClick={swap}
              title="Intercambiar origen y destino"
              aria-label="Intercambiar origen y destino"
              className="absolute top-1/2 left-1/2 z-10 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 rotate-90 place-items-center rounded-full border-4 border-surface bg-surface-3 text-ink-2 transition hover:text-accent sm:rotate-0"
            >
              <SwapIcon />
            </button>
          </div>
          <DateRange
            className="lg:col-span-4"
            label="Salir entre"
            from={dateFrom}
            to={dateTo}
            min={today}
            onFrom={setDateFrom}
            onTo={setDateTo}
          />
          {mode === "split" && (
            <DateRange
              className="lg:col-span-4 lg:col-start-7"
              label="Regresar entre"
              from={returnFrom}
              to={returnTo}
              min={dateFrom}
              onFrom={setReturnFrom}
              onTo={setReturnTo}
            />
          )}
          <button
            className="btn-primary min-h-[4.25rem] rounded-xl text-base font-semibold lg:col-span-2 lg:col-start-11 lg:row-start-1"
            disabled={loading}
          >
            {loading ? (
              "Escaneando…"
            ) : (
              <>
                <PlaneIcon /> Buscar
              </>
            )}
          </button>
        </div>
      </form>

      {error && (
        <p className="rounded-xl border border-critical/40 bg-critical-soft p-3 text-sm text-critical" role="alert">
          {error}
        </p>
      )}

      {calendar && searched && (
        <>
          {split ? (
            best ? (
              <section className="card relative overflow-hidden p-6">
                <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
                <div className="relative flex flex-wrap items-end justify-between gap-6">
                  <div>
                    <p className="eyebrow">{chosen != null && !chosenIsBest ? "Tu selección" : "Ida + regreso más barato"}</p>
                    <p className="num mt-2 text-5xl font-semibold tracking-tight">{money(chosen ?? best.total, calendar.currency)}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {[
                        { tag: "Ida", p: outbound.selected ?? best.out, route: `${searched.origins.join("/")} → ${searched.destinations.join("/")}` },
                        { tag: "Regreso", p: inbound.selected ?? best.ret, route: `${searched.destinations.join("/")} → ${searched.origins.join("/")}` },
                      ].map(({ tag, p, route }) => (
                        <div key={tag} className="rounded-xl border border-line bg-surface-2 px-4 py-2.5">
                          <p className="eyebrow">
                            {tag} · {route}
                          </p>
                          <p className="mt-0.5 text-sm">
                            <span className="font-medium">{shortDate(p.depart_date)}</span>{" "}
                            <span className="num text-ink-2">{money(p.price, calendar.currency)}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                    {outbound.selected && inbound.selected && chosen == null && (
                      <p className="mt-3 text-sm text-ink-2">
                        <span className="text-warning" aria-hidden>
                          ⚠
                        </span>{" "}
                        El regreso elegido es antes o el mismo día de la ida.
                      </p>
                    )}
                  </div>
                  {!chosenIsBest && (
                    <div className="rounded-xl border border-line bg-surface-2 p-4 text-sm">
                      <p className="eyebrow">Lo más barato del rango</p>
                      <p className="num mt-1 text-xl font-semibold">{money(best.total, calendar.currency)}</p>
                      <p className="text-xs text-ink-2">
                        {shortDate(best.out.depart_date)} → {shortDate(best.ret.depart_date)}
                      </p>
                      <button
                        type="button"
                        className="btn-ghost mt-3 w-full px-3 py-1.5 text-xs"
                        onClick={() => {
                          outbound.load(best.out, searched.origins, searched.destinations, maxStops, currency);
                          inbound.load(best.ret, searched.destinations, searched.origins, maxStops, currency);
                        }}
                      >
                        Usar estas fechas
                      </button>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <p className="card p-5 text-sm text-ink-2">No hay una combinación de ida y regreso en esos rangos.</p>
            )
          ) : calendar.cheapest ? (
            <section className="card relative overflow-hidden p-6">
              <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
              <div className="relative flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="eyebrow">Más barato del rango</p>
                  <p className="num mt-2 text-5xl font-semibold tracking-tight">{money(calendar.cheapest.price, calendar.currency)}</p>
                  <p className="mt-2 text-sm text-ink-2">
                    <span className="font-medium text-ink">
                      {searched.origins.join("/")} → {searched.destinations.join("/")}
                    </span>{" "}
                    · {shortDate(calendar.cheapest.depart_date)}
                    {calendar.cheapest.return_date && ` → ${shortDate(calendar.cheapest.return_date)}`}
                  </p>
                  {calendar.verdict && (
                    <div className="mt-4">
                      <VerdictBadge verdict={calendar.verdict} currency={calendar.currency} />
                    </div>
                  )}
                </div>
                <div className="w-full rounded-xl border border-line bg-surface-2 p-4 sm:w-auto">
                  <p className="eyebrow">Vigilar esta ruta</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      className="field w-40 bg-surface"
                      type="number"
                      placeholder="Precio objetivo"
                      value={watchTarget}
                      onChange={(e) => setWatchTarget(e.target.value)}
                    />
                    <button className="btn-ghost" onClick={watch} type="button">
                      Vigilar
                    </button>
                  </div>
                  {watchMsg && <p className="mt-2 text-xs text-ink-2">{watchMsg}</p>}
                </div>
              </div>
            </section>
          ) : (
            <p className="card p-5 text-sm text-ink-2">No hay precios para ese rango.</p>
          )}

          {calendar.prices.length > 0 && (
            <section className="card p-5 sm:p-6">
              <SectionTitle
                eyebrow={
                  searched.mode === "split"
                    ? "Calendario de ida"
                    : searched.mode === "rt"
                      ? `Calendario · ida y vuelta de ${tripDays} días`
                      : "Calendario · solo ida"
                }
                title={`${searched.origins.join("/")} → ${searched.destinations.join("/")}`}
              />
              <PriceCalendar
                prices={calendar.prices}
                currency={calendar.currency}
                selected={outbound.selected?.depart_date ?? null}
                onSelect={(p) => outbound.load(p, searched.origins, searched.destinations, maxStops, currency)}
              />
            </section>
          )}

          {outbound.selected && (
            <section>
              <SectionTitle
                eyebrow={searched.mode === "split" ? "Vuelos de ida" : "Vuelos"}
                title={`${shortDate(outbound.selected.depart_date)}${outbound.selected.return_date ? ` → ${shortDate(outbound.selected.return_date)}` : ""}`}
              />
              {outbound.loading && <FlightsSkeleton />}
              {outbound.flights && (
                <FlightList options={outbound.flights.options} currency={calendar.currency} googleUrl={outbound.flights.url} />
              )}
            </section>
          )}

          {split && returnCalendar.prices.length > 0 && (
            <section className="card p-5 sm:p-6">
              <SectionTitle
                eyebrow="Calendario de regreso"
                title={`${searched.destinations.join("/")} → ${searched.origins.join("/")}`}
              />
              <PriceCalendar
                prices={returnCalendar.prices}
                currency={returnCalendar.currency}
                selected={inbound.selected?.depart_date ?? null}
                onSelect={(p) => inbound.load(p, searched.destinations, searched.origins, maxStops, currency)}
              />
            </section>
          )}

          {split && inbound.selected && (
            <section>
              <SectionTitle eyebrow="Vuelos de regreso" title={shortDate(inbound.selected.depart_date)} />
              {inbound.loading && <FlightsSkeleton />}
              {inbound.flights && (
                <FlightList options={inbound.flights.options} currency={returnCalendar.currency} googleUrl={inbound.flights.url} />
              )}
            </section>
          )}

          {single && searched.mode !== "rt" && (
            <Combos
              origin={searched.origins[0]}
              destination={searched.destinations[0]}
              dateFrom={dateFrom}
              dateTo={dateTo}
              currency={calendar.currency}
            />
          )}
        </>
      )}
    </div>
  );
}

function FlightsSkeleton() {
  return (
    <ul className="flex flex-col gap-2" aria-label="Cargando vuelos">
      {[0, 1, 2].map((i) => (
        <li key={i} className="card h-24 animate-pulse bg-surface-2/60" />
      ))}
    </ul>
  );
}
