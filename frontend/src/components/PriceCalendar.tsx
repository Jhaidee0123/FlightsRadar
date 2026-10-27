"use client";

import type { DatePrice } from "@/lib/api";
import { compactMoney, money, parseDay, shortDate, toIso } from "@/lib/format";

const RAMP = ["var(--seq-5)", "var(--seq-4)", "var(--seq-3)", "var(--seq-2)", "var(--seq-1)"];
const RAMP_INK = ["var(--seq-ink-5)", "var(--seq-ink-4)", "var(--seq-ink-3)", "var(--seq-ink-2)", "var(--seq-ink-1)"];
const WEEKDAYS = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];

interface Props {
  prices: DatePrice[];
  currency: string;
  selected: string | null;
  onSelect: (p: DatePrice) => void;
}

/** Mapa de calor por quintiles: el azul más oscuro es el 20% más barato del rango. */
export default function PriceCalendar({ prices, currency, selected, onSelect }: Props) {
  if (!prices.length) return null;

  const sorted = [...prices].map((p) => p.price).sort((a, b) => a - b);
  const cuts = [0.2, 0.4, 0.6, 0.8].map((q) => sorted[Math.floor(q * (sorted.length - 1))]);
  const bucket = (price: number) => {
    const i = cuts.findIndex((c) => price <= c);
    return i === -1 ? 4 : i;
  };
  const min = sorted[0];
  const byDate = new Map(prices.map((p) => [p.depart_date, p]));

  const months = new Map<string, Date>();
  for (const p of prices) {
    const d = parseDay(p.depart_date);
    months.set(`${d.getFullYear()}-${d.getMonth()}`, new Date(d.getFullYear(), d.getMonth(), 1));
  }

  return (
    <div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[...months.values()].map((first) => {
          const offset = (first.getDay() + 6) % 7;
          const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
          const cells: (string | null)[] = [
            ...Array(offset).fill(null),
            ...Array.from({ length: daysInMonth }, (_, i) =>
              toIso(new Date(first.getFullYear(), first.getMonth(), i + 1)),
            ),
          ];
          return (
            <div key={first.toISOString()}>
              <h4 className="mb-2 text-sm font-medium text-ink first-letter:uppercase">
                {first.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
              </h4>
              <div className="grid grid-cols-7 gap-[2px] text-center">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="pb-1 text-[11px] text-ink-3">
                    {w}
                  </div>
                ))}
                {cells.map((iso, i) => {
                  if (!iso) return <div key={`e${i}`} />;
                  const p = byDate.get(iso);
                  const day = Number(iso.slice(8));
                  if (!p) {
                    return (
                      <div key={iso} className="flex h-12 flex-col items-center justify-center rounded text-xs text-ink-3">
                        {day}
                      </div>
                    );
                  }
                  const b = bucket(p.price);
                  const isSel = selected === iso;
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => onSelect(p)}
                      title={`${shortDate(iso)}${p.return_date ? ` → ${shortDate(p.return_date)}` : ""}: ${money(p.price, currency)}`}
                      className={`group relative flex h-12 flex-col items-center justify-center rounded transition hover:scale-105 ${
                        isSel ? "ring-2 ring-ink ring-offset-1 ring-offset-surface" : ""
                      }`}
                      style={{ background: RAMP[b], color: RAMP_INK[b] }}
                    >
                      <span className="text-[11px] leading-none opacity-80">{day}</span>
                      <span className="num mt-1 text-[11px] font-semibold leading-none">
                        {compactMoney(p.price, currency).replace(/\s/g, "")}
                      </span>
                      {p.price === min && (
                        <span className="absolute -right-1 -top-1 rounded-full bg-surface px-1 text-[10px] leading-4 text-ink shadow">
                          ★
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-ink-2">
        <span>Más barato</span>
        <div className="flex gap-[2px]">
          {RAMP.map((c) => (
            <span key={c} className="h-3 w-6 rounded-sm" style={{ background: c }} />
          ))}
        </div>
        <span>Más caro</span>
        <span className="ml-3 text-ink-3">★ mínimo del rango · toca un día para ver vuelos</span>
      </div>
    </div>
  );
}
