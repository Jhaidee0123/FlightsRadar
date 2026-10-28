import type { Verdict } from "@/lib/api";
import { money } from "@/lib/format";

const STYLES: Record<Verdict["level"], { icon: string; label: string; color: string }> = {
  excelente: { icon: "▼▼", label: "Precio excelente", color: "var(--good)" },
  bueno: { icon: "▼", label: "Buen precio", color: "var(--good)" },
  normal: { icon: "●", label: "Precio normal", color: "var(--text-3)" },
  caro: { icon: "▲", label: "Precio alto", color: "var(--critical)" },
  sin_datos: { icon: "○", label: "Aún sin historial", color: "var(--text-3)" },
};

export default function VerdictBadge({ verdict, currency }: { verdict: Verdict; currency: string }) {
  const s = STYLES[verdict.level];
  return (
    <div className="flex flex-col items-start gap-1.5">
      <span
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium text-ink"
        style={{ borderColor: `color-mix(in srgb, ${s.color} 40%, transparent)`, background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}
      >
        <span style={{ color: s.color }} aria-hidden>
          {s.icon}
        </span>
        {s.label}
      </span>
      <span className="text-xs text-ink-3">
        {verdict.level === "sin_datos"
          ? `El radar necesita más lecturas para comparar (${verdict.samples} de 15)`
          : `Solo el ${(verdict.percentile ?? 0).toFixed(0)}% de ${verdict.samples} lecturas fue más barato · mediana ${money(verdict.median, currency)}`}
      </span>
    </div>
  );
}
