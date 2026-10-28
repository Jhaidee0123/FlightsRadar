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

export default function SearchPage() {
  const [origin, setOrigin] = useState("MDE");
  const [destination, setDestination] = useState("BOG");
  const [dateFrom, setDateFrom] = useState(addDays(today, 14));
  const [dateTo, setDateTo] = useState(addDays(today, 75));
  const [roundTrip, setRoundTrip] = useState(false);
  const [tripDays, setTripDays] = useState(15);
  const [maxStops, setMaxStops] = useState<MaxStops>("ANY");
  const [currency, setCurrency] = useState("COP");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<CalendarResult | null>(null);
  const [searched, setSearched] = useState<{ origins: string[]; destinations: string[]; roundTrip: boolean } | null>(null);

  const [selected, setSelected] = useState<DatePrice | null>(null);
  const [flights, setFlights] = useState<{ options: FlightOption[]; url: string } | null>(null);
  const [flightsLoading, setFlightsLoading] = useState(false);

  const [watchTarget, setWatchTarget] = useState("");
  const [watchMsg, setWatchMsg] = useState<string | null>(null);

  const loadFlights = async (p: DatePrice, origins: string[], destinations: string[]) => {
    setSelected(p);
    setFlights(null);
    setFlightsLoading(true);
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
      setError((e as Error).message);
    } finally {
      setFlightsLoading(false);
    }
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const origins = codes(origin);
    const destinations = codes(destination);
    if (!origins.length || !destinations.length) return;
    setLoading(true);
    setError(null);
    setCalendar(null);
    setFlights(null);
    setSelected(null);
    setWatchMsg(null);
    try {
      const r = await api.calendar({
        origins,
        destinations,
        date_from: dateFrom,
        date_to: dateTo,
        trip_days: roundTrip ? tripDays : null,
        max_stops: maxStops,
        currency,
      });
      setCalendar(r);
      setSearched({ origins, destinations, roundTrip });
      if (r.cheapest) loadFlights(r.cheapest, origins, destinations);
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
        trip_days: searched.roundTrip ? tripDays : null,
        max_stops: maxStops,
        target_price: watchTarget ? Number(watchTarget) : null,
        currency,
        include_combos: !searched.roundTrip && searched.origins.length === 1 && searched.destinations.length === 1,
      });
      setWatchMsg("Ruta agregada al radar ✓");
    } catch (e) {
      setWatchMsg((e as Error).message);
    }
  };

  const single = searched && searched.origins.length === 1 && searched.destinations.length === 1;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Encuentra el vuelo más barato</h1>
        <p className="mt-1 text-sm text-ink-2">
          Escribe una ciudad, un país o un código y elige; puedes sumar varios aeropuertos (ej. Medellín →
          Tokio, que incluye Narita y Haneda) y un rango amplio de fechas.
        </p>
      </section>

      <form onSubmit={search} className="card grid gap-4 p-5 md:grid-cols-12">
        <div className="md:col-span-3">
          <AirportInput label="Desde" value={origin} onChange={setOrigin} placeholder="Ciudad o código" />
        </div>
        <div className="md:col-span-3">
          <AirportInput label="Hacia" value={destination} onChange={setDestination} placeholder="Ciudad o código" />
        </div>
        <div className="md:col-span-6">
          <label className="mb-1 block text-xs font-medium text-ink-2">Salir entre</label>
          <div className="flex gap-2">
            <input type="date" className="field" min={today} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <input type="date" className="field" min={dateFrom} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div className="md:col-span-4">
          <label className="mb-1 block text-xs font-medium text-ink-2">Viaje</label>
          <div className="flex gap-2">
            <select
              className="field"
              value={roundTrip ? "rt" : "ow"}
              onChange={(e) => setRoundTrip(e.target.value === "rt")}
            >
              <option value="ow">Solo ida</option>
              <option value="rt">Ida y vuelta</option>
            </select>
            {roundTrip && (
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
        <div className="md:col-span-3">
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
        <div className="flex items-end md:col-span-3 md:justify-end">
          <button className="btn-primary w-full md:w-auto" disabled={loading}>
            {loading ? "Escaneando fechas…" : "Buscar"}
          </button>
        </div>
      </form>

      {error && <p className="rounded-md border border-critical/40 bg-surface p-3 text-sm text-critical">{error}</p>}

      {calendar && searched && (
        <>
          {calendar.cheapest ? (
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
                Calendario de precios {searched.roundTrip ? `(ida y vuelta, ${tripDays} días)` : "(solo ida)"}
              </h3>
              <PriceCalendar
                prices={calendar.prices}
                currency={calendar.currency}
                selected={selected?.depart_date ?? null}
                onSelect={(p) => loadFlights(p, searched.origins, searched.destinations)}
              />
            </section>
          )}

          {selected && (
            <section>
              <h3 className="mb-3 font-semibold">
                Vuelos del {shortDate(selected.depart_date)}
                {selected.return_date && ` al ${shortDate(selected.return_date)}`}
              </h3>
              {flightsLoading && <p className="text-sm text-ink-2">Cargando vuelos…</p>}
              {flights && <FlightList options={flights.options} currency={calendar.currency} googleUrl={flights.url} />}
            </section>
          )}

          {single && !searched.roundTrip && (
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
