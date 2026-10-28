"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { codes as parseCodes } from "@/lib/format";
import { loadPlaces, type PlaceIndex, type Suggestion } from "@/lib/places";

interface Props {
  label: string;
  /** Códigos IATA separados por coma, p. ej. "NRT, HND". */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Selector de aeropuertos: escribe una ciudad, país o código y elige; admite varios. */
export default function AirportInput({ label, value, onChange, placeholder }: Props) {
  const [places, setPlaces] = useState<PlaceIndex | null>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = useMemo(() => parseCodes(value), [value]);

  // Los datos se cargan al primer foco; si ya hay códigos, se cargan para mostrar sus nombres.
  const ensureLoaded = () => {
    if (!places) loadPlaces().then(setPlaces);
  };
  useEffect(() => {
    if (selected.length > 0 && !places) loadPlaces().then(setPlaces);
  }, [selected.length, places]);

  const suggestions = useMemo(
    () => (places && text.trim() ? places.search(text, selected) : []),
    [places, text, selected],
  );

  useEffect(() => setActive(0), [text]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const setCodes = (next: string[]) => onChange([...new Set(next)].join(", "));

  const choose = (s: Suggestion) => {
    setCodes([...selected, ...(s.kind === "city" ? s.codes : [s.code])]);
    setText("");
    setOpen(false);
    input.current?.focus();
  };

  const remove = (code: string) => setCodes(selected.filter((c) => c !== code));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if ((e.key === "Enter" || e.key === "Tab") && open && suggestions[active] && text.trim()) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !text && selected.length) {
      remove(selected[selected.length - 1]);
    }
  };

  const showList = open && text.trim().length > 0;

  return (
    <div ref={wrapper} className="relative">
      <label htmlFor={`${listId}-input`} className="mb-1 block text-xs font-medium text-ink-2">
        {label}
      </label>
      <div
        className="field flex min-h-[2.5rem] cursor-text flex-wrap items-center gap-1.5 py-1.5"
        onClick={() => input.current?.focus()}
      >
        {selected.map((code) => {
          const info = places?.byCode.get(code);
          return (
            <span
              key={code}
              title={info ? `${info.name} · ${info.city}, ${info.country}` : code}
              className="inline-flex items-center gap-1 rounded bg-surface-2 py-0.5 pr-1 pl-2 text-xs"
            >
              <span className="num font-mono font-semibold">{code}</span>
              {info && <span className="max-w-[7rem] truncate text-ink-2">{info.city}</span>}
              <button
                type="button"
                aria-label={`Quitar ${code}`}
                className="rounded px-1 text-ink-3 hover:bg-surface hover:text-ink"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(code);
                }}
              >
                ×
              </button>
            </span>
          );
        })}
        <input
          ref={input}
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && suggestions[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          className="min-w-[6rem] flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
          value={text}
          placeholder={selected.length ? "Agregar otro…" : placeholder}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            ensureLoaded();
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-80 w-full min-w-[18rem] overflow-auto rounded-md border border-line bg-surface py-1 shadow-lg"
        >
          {!places && <li className="px-3 py-2 text-sm text-ink-3">Cargando aeropuertos…</li>}
          {places && suggestions.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-3">Sin coincidencias para “{text}”</li>
          )}
          {suggestions.map((s, i) => (
            <li
              key={s.kind === "city" ? `city-${s.label}` : s.code}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer items-start gap-3 px-3 py-2 text-sm ${i === active ? "bg-surface-2" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
            >
              {s.kind === "city" ? (
                <>
                  <span className="num w-9 shrink-0 pt-0.5 text-center text-xs text-ink-3" aria-hidden>
                    ◎
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {s.label}, {s.country}
                    </span>
                    <span className="block text-xs text-ink-2">
                      Todos los aeropuertos · <span className="font-mono">{s.codes.join(", ")}</span>
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span className="num w-9 shrink-0 pt-0.5 font-mono font-semibold">{s.code}</span>
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {s.city}, {s.country}
                    </span>
                    <span className="block truncate text-xs text-ink-2">{s.name}</span>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
