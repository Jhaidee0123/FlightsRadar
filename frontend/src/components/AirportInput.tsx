"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Acepta varios códigos IATA separados por coma y sugiere aeropuertos por ciudad. */
export default function AirportInput({ label, value, onChange, placeholder }: Props) {
  const [suggestions, setSuggestions] = useState<{ code: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  const parts = value.split(",");
  const current = parts[parts.length - 1].trim();

  useEffect(() => {
    if (current.length < 3 || /^[A-Z]{3}$/.test(current)) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      api.airports(current).then(setSuggestions).catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(t);
  }, [current]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (code: string) => {
    const kept = parts.slice(0, -1).map((p) => p.trim()).filter(Boolean);
    onChange([...kept, code].join(", "));
    setOpen(false);
  };

  return (
    <div ref={wrapper} className="relative">
      <label className="mb-1 block text-xs font-medium text-ink-2">{label}</label>
      <input
        className="field uppercase placeholder:normal-case"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-line bg-surface py-1 shadow-lg">
          {suggestions.map((s) => (
            <li key={s.code}>
              <button
                type="button"
                className="flex w-full gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2"
                onClick={() => pick(s.code)}
              >
                <span className="num font-mono font-semibold">{s.code}</span>
                <span className="truncate text-ink-2">{s.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
