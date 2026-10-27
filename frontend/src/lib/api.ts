const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

export type MaxStops = "ANY" | "NON_STOP" | "ONE_STOP" | "TWO_STOPS";

export interface DatePrice {
  depart_date: string;
  return_date: string | null;
  price: number;
  currency: string;
}

export interface Verdict {
  level: "excelente" | "bueno" | "normal" | "caro" | "sin_datos";
  percentile: number | null;
  median: number | null;
  samples: number;
}

export interface Leg {
  airline_code: string;
  airline_name: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  duration_min: number;
}

export interface FlightOption {
  price: number | null;
  currency: string;
  stops: number;
  duration_min: number;
  legs: Leg[];
  return_legs: Leg[];
  self_transfer: boolean;
}

export interface Combo {
  depart_date: string;
  hub: string;
  first_leg_date: string;
  second_leg_date: string;
  first_leg_price: number;
  second_leg_price: number;
  total_price: number;
  currency: string;
  direct_price: number | null;
  savings: number | null;
  google_flights_url_first: string;
  google_flights_url_second: string;
}

export interface VerifiedCombo {
  first: FlightOption;
  second: FlightOption;
  connection_min: number;
  total_price: number;
  currency: string;
}

export interface Watch {
  id: number;
  origin: string;
  destination: string;
  date_from: string;
  date_to: string;
  trip_days: number | null;
  max_stops: MaxStops;
  target_price: number | null;
  currency: string;
  include_combos: number;
  active: number;
  best_price: number | null;
  best_depart_date: string | null;
  best_return_date: string | null;
  last_checked_at: string | null;
  created_at: string;
}

export interface Alert {
  id: number;
  watch_id: number;
  price: number;
  currency: string;
  depart_date: string;
  return_date: string | null;
  reason: string;
  via: string | null;
  created_at: string;
  origin: string;
  destination: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ? String(body.detail) : `Error ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  airports: (q: string) => request<{ code: string; name: string }[]>(`/api/airports?q=${encodeURIComponent(q)}`),

  calendar: (body: {
    origins: string[];
    destinations: string[];
    date_from: string;
    date_to: string;
    trip_days?: number | null;
    max_stops?: MaxStops;
    currency?: string;
  }) =>
    post<{
      currency: string;
      prices: DatePrice[];
      cheapest: DatePrice | null;
      verdict: Verdict | null;
      google_flights_url: string | null;
    }>("/api/calendar", body),

  flights: (body: {
    origins: string[];
    destinations: string[];
    depart_date: string;
    return_date?: string | null;
    max_stops?: MaxStops;
    currency?: string;
    limit?: number;
  }) => post<{ currency: string; options: FlightOption[]; google_flights_url: string }>("/api/flights", body),

  combos: (body: { origin: string; destination: string; date_from: string; date_to: string; currency?: string }) =>
    post<{ combos: Combo[] }>("/api/combos", body),

  verifyCombo: (body: {
    origin: string;
    hub: string;
    destination: string;
    first_leg_date: string;
    second_leg_date: string;
    currency?: string;
  }) => post<{ pairs: VerifiedCombo[] }>("/api/combos/verify", body),

  history: (origin: string, destination: string, roundTrip: boolean, currency: string) =>
    request<{ series: { day: string; min_price: number; samples: number }[] }>(
      `/api/history?origin=${origin}&destination=${destination}&round_trip=${roundTrip}&currency=${currency}`,
    ),

  watches: () => request<Watch[]>("/api/watches"),
  createWatch: (body: {
    origin: string;
    destination: string;
    date_from: string;
    date_to: string;
    trip_days?: number | null;
    max_stops?: MaxStops;
    target_price?: number | null;
    currency?: string;
    include_combos?: boolean;
  }) => post<Watch>("/api/watches", body),
  toggleWatch: (id: number, active: boolean) =>
    request<Watch>(`/api/watches/${id}?active=${active}`, { method: "PATCH" }),
  deleteWatch: (id: number) => request<void>(`/api/watches/${id}`, { method: "DELETE" }),
  checkWatch: (id: number) => post<Record<string, unknown>>(`/api/watches/${id}/check`, {}),
  alerts: () => request<Alert[]>("/api/alerts"),
};
