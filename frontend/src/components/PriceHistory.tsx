"use client";

import { useState } from "react";
import { compactMoney, money, shortDate } from "@/lib/format";

interface Point {
  day: string;
  min_price: number;
}

const W = 640;
const H = 180;
const PAD = { top: 12, right: 12, bottom: 24, left: 56 };

/** Mínimo observado por día: muestra cómo se ha movido la ruta desde que el radar la vigila. */
export default function PriceHistory({ series, currency }: { series: Point[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (series.length < 2) {
    return <p className="text-xs text-ink-3">El historial aparece cuando el radar acumule al menos dos días de lecturas.</p>;
  }

  const prices = series.map((p) => p.min_price);
  const lo = Math.min(...prices) * 0.95;
  const hi = Math.max(...prices) * 1.05;
  const x = (i: number) => PAD.left + (i / (series.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const path = series.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.min_price)}`).join(" ");
  const ticks = [lo, (lo + hi) / 2, hi];

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((rel - PAD.left) / (W - PAD.left - PAD.right)) * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  };

  const h = hover != null ? series[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Historial del precio mínimo">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-3)">
              {compactMoney(t, currency)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 6} fontSize="11" fill="var(--text-3)">
          {shortDate(series[0].day)}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize="11" fill="var(--text-3)">
          {shortDate(series[series.length - 1].day)}
        </text>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        {h && hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--text-3)" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(h.min_price)} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
        <rect
          x={PAD.left}
          y={0}
          width={W - PAD.left - PAD.right}
          height={H}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {h && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-md border border-line bg-surface px-2 py-1 text-xs shadow">
          <span className="text-ink-2">{shortDate(h.day)}</span>{" "}
          <span className="num font-semibold text-ink">{money(h.min_price, currency)}</span>
        </div>
      )}
    </div>
  );
}
