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
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Encuentra el vuelo más barato</h1>
      </section>

      <form onSubmit={search} className="card grid gap-4 p-5 md:grid-cols-12">
        <div className="flex flex-col items-stretch gap-2 md:col-span-8 md:flex-row md:items-start">
          <div className="min-w-0 flex-1">
            <AirportInput label="Desde" value={origin} onChange={setOrigin} placeholder="Ciudad o código" />
          </div>
          <button
            type="button"
            onClick={swap}
            title="Intercambiar origen y destino"
            aria-label="Intercambiar origen y destino"
            className="grid h-8 w-8 shrink-0 rotate-90 place-items-center self-center rounded-full border border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink md:mt-6 md:rotate-0"
          >
            <SwapIcon />
          </button>
          <div className="min-w-0 flex-1">
            <AirportInput label="Hacia" value={destination} onChange={setDestination} placeholder="Ciudad o código" />
          </div>
        </div>
        <div className="md:col-span-4">
          <label className="mb-1 block text-xs font-medium text-ink-2">Viaje</label>
          <div className="flex gap-2">
            <select className="field" value={mode} onChange={(e) => setMode(e.target.value as TripMode)}>
              <option value="ow">Solo ida</option>
              <option value="rt">Ida y vuelta (un tiquete)</option>
              <option value="split">Ida + regreso por separado</option>
            </select>
            {mode === "rt" && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={60}
                  className="field w-16"
                  value={tripDays}
                  onChange={(e) => setTripDays(Number(e.target.value))}
                />
                <span className="text-xs text-ink-2">días</span>
              </div>
            )}
          </div>
        </div>
        <div className="md:col-span-6">
          <label className="mb-1 block text-xs font-medium text-ink-2">Salir entre</label>
          <div className="flex gap-2">
            <input type="date" className="field" min={today} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <input type="date" className="field" min={dateFrom} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        {mode === "split" && (
          <div className="md:col-span-6">
            <label className="mb-1 block text-xs font-medium text-ink-2">Regresar entre</label>
            <div className="flex gap-2">
              <input type="date" className="field" min={dateFrom} value={returnFrom} onChange={(e) => setReturnFrom(e.target.value)} />
              <input type="date" className="field" min={returnFrom} value={returnTo} onChange={(e) => setReturnTo(e.target.value)} />
            </div>
          </div>
        )}
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink-2">Escalas</label>
          <select className="field" value={maxStops} onChange={(e) => setMaxStops(e.target.value as MaxStops)}>
            <option value="ANY">Cualquiera</option>
            <option value="NON_STOP">Solo directos</option>
            <option value="ONE_STOP">Máximo 1</option>
            <option value="TWO_STOPS">Máximo 2</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink-2">Moneda</label>
          <select className="field" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {["COP", "USD", "EUR", "JPY"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end md:col-span-2 md:col-end-13 md:justify-end">
          <button className="btn-primary w-full md:w-auto" disabled={loading}>
            {loading ? "Escaneando fechas…" : "Buscar"}
          </button>
        </div>
      </form>

      {error && <p className="rounded-md border border-critical/40 bg-surface p-3 text-sm text-critical">{error}</p>}

      {calendar && searched && (
        <>
          {split ? (
            best ? (
              <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-3">
                    {chosen != null && !chosenIsBest ? "Tu selección" : "Ida + regreso más barato"}
                  </p>
                  <p className="num mt-1 text-3xl font-semibold">{money(chosen ?? best.total, calendar.currency)}</p>
                  <p className="mt-1 text-sm text-ink-2">
                    Ida {shortDate((outbound.selected ?? best.out).depart_date)} (
                    {money((outbound.selected ?? best.out).price, calendar.currency)}) · Regreso{" "}
                    {shortDate((inbound.selected ?? best.ret).depart_date)} (
                    {money((inbound.selected ?? best.ret).price, calendar.currency)})
                  </p>
                  {outbound.selected && inbound.selected && chosen == null && (
                    <p className="mt-1 text-sm text-ink-2">
                      <span className="text-warning" aria-hidden>⚠</span> El regreso elegido es antes o el mismo día de la ida.
                    </p>
                  )}
                </div>
                {!chosenIsBest && (
                  <div className="text-sm text-ink-2">
                    <p>
                      Lo más barato del rango: <span className="num font-semibold text-ink">{money(best.total, calendar.currency)}</span>
                    </p>
                    <p className="text-xs">
                      {shortDate(best.out.depart_date)} → {shortDate(best.ret.depart_date)}
                    </p>
                    <button
                      type="button"
                      className="btn-ghost mt-2 px-3 py-1.5 text-xs"
                      onClick={() => {
                        outbound.load(best.out, searched.origins, searched.destinations, maxStops, currency);
                        inbound.load(best.ret, searched.destinations, searched.origins, maxStops, currency);
                      }}
                    >
                      Usar estas fechas
                    </button>
                  </div>
                )}
              </section>
            ) : (
              <p className="text-sm text-ink-2">No hay una combinación de ida y regreso en esos rangos.</p>
            )
          ) : calendar.cheapest ? (
            <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-3">Más barato del rango</p>
                <p className="num mt-1 text-3xl font-semibold">{money(calendar.cheapest.price, calendar.currency)}</p>
                <p className="mt-1 text-sm text-ink-2">
                  {shortDate(calendar.cheapest.depart_date)}
                  {calendar.cheapest.return_date && ` → ${shortDate(calendar.cheapest.return_date)}`} ·{" "}
                  {searched.origins.join("/")} → {searched.destinations.join("/")}
                </p>
              </div>
              {calendar.verdict && <VerdictBadge verdict={calendar.verdict} currency={calendar.currency} />}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    className="field w-40"
                    type="number"
                    placeholder="Precio objetivo"
                    value={watchTarget}
                    onChange={(e) => setWatchTarget(e.target.value)}
                  />
                  <button className="btn-ghost" onClick={watch} type="button">
                    Vigilar ruta
                  </button>
                </div>
                {watchMsg && <span className="text-xs text-ink-2">{watchMsg}</span>}
              </div>
            </section>
          ) : (
            <p className="text-sm text-ink-2">No hay precios para ese rango.</p>
          )}

          {calendar.prices.length > 0 && (
            <section className="card p-5">
              <h3 className="mb-4 font-semibold">
                {searched.mode === "split"
                  ? `Ida · ${searched.origins.join("/")} → ${searched.destinations.join("/")}`
                  : `Calendario de precios ${searched.mode === "rt" ? `(ida y vuelta, ${tripDays} días)` : "(solo ida)"}`}
              </h3>
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
              <h3 className="mb-3 font-semibold">
                {searched.mode === "split" ? "Vuelos de ida del " : "Vuelos del "}
                {shortDate(outbound.selected.depart_date)}
                {outbound.selected.return_date && ` al ${shortDate(outbound.selected.return_date)}`}
              </h3>
              {outbound.loading && <p className="text-sm text-ink-2">Cargando vuelos…</p>}
              {outbound.flights && (
                <FlightList options={outbound.flights.options} currency={calendar.currency} googleUrl={outbound.flights.url} />
              )}
            </section>
          )}

          {split && returnCalendar.prices.length > 0 && (
            <section className="card p-5">
              <h3 className="mb-4 font-semibold">
                Regreso · {searched.destinations.join("/")} → {searched.origins.join("/")}
              </h3>
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
              <h3 className="mb-3 font-semibold">Vuelos de regreso del {shortDate(inbound.selected.depart_date)}</h3>
              {inbound.loading && <p className="text-sm text-ink-2">Cargando vuelos…</p>}
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
