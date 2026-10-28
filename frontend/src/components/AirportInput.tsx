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

/**
 * Selector de aeropuertos estilo aerolínea: muestra el código grande y la ciudad;
 * al tocarlo permite buscar por ciudad, país o código y sumar varios aeropuertos.
 */
export default function AirportInput({ label, value, onChange, placeholder }: Props) {
  const [places, setPlaces] = useState<PlaceIndex | null>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = useMemo(() => parseCodes(value), [value]);

  // Los datos se cargan al primer uso o cuando hay códigos que mostrar con su ciudad.
  useEffect(() => {
    if (!places && (editing || selected.length > 0)) loadPlaces().then(setPlaces);
  }, [editing, selected.length, places]);


  const suggestions = useMemo(
    () => (places && text.trim() ? places.search(text, selected) : []),
    [places, text, selected],
  );

  useEffect(() => setActive(0), [text]);

  const setCodes = (next: string[]) => onChange([...new Set(next)].join(", "));

  // El input siempre está montado (oculto en modo resumen): así el foco nunca se pierde
  // por desmontar el elemento enfocado. Editar = tener el foco dentro del campo.
  const stopEditing = () => {
    setEditing(false);
    setText("");
    input.current?.blur();
  };

  const choose = (s: Suggestion) => {
    setCodes([...selected, ...(s.kind === "city" ? s.codes : [s.code])]);
    stopEditing();
  };

  const remove = (code: string) => setCodes(selected.filter((c) => c !== code));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if ((e.key === "Enter" || e.key === "Tab") && suggestions[active] && text.trim()) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === "Escape") {
      stopEditing();
    } else if (e.key === "Backspace" && !text && selected.length) {
      remove(selected[selected.length - 1]);
    }
  };

  const showList = editing && text.trim().length > 0;
  const cities = [...new Set(selected.map((c) => places?.byCode.get(c)?.city).filter(Boolean))].join(", ");

  return (
    <div
      ref={wrapper}
      className="relative min-w-0"
      onBlur={(e) => {
        if (!wrapper.current?.contains(e.relatedTarget as Node)) {
          setEditing(false);
          setText("");
        }
      }}
    >
      <div
        className={`search-box min-h-[4.25rem] cursor-text ${editing ? "border-accent ring-2 ring-accent-soft" : ""}`}
        onMouseDown={(e) => {
          // Mantiene el foco en el input al tocar el resto de la caja.
          if (editing && e.target !== input.current) e.preventDefault();
        }}
        onClick={() => input.current?.focus()}
      >
        <label htmlFor={`${listId}-input`} className="eyebrow block">
          {label}
        </label>

        {!editing && (
          <div className="mt-0.5 min-w-0" aria-hidden>
            {selected.length ? (
              <>
                <span className="block truncate text-2xl font-semibold leading-tight tracking-tight">
                  {selected.join(" · ")}
                </span>
                <span className="block truncate text-xs text-ink-2">{cities || " "}</span>
              </>
            ) : (
              <span className="block py-1.5 text-lg text-ink-3">{placeholder}</span>
            )}
          </div>
        )}
        <div className={editing ? "mt-1 flex flex-wrap items-center gap-1.5" : "sr-only"}>
            {editing && selected.map((code) => {
              const info = places?.byCode.get(code);
              return (
                <span
                  key={code}
                  title={info ? `${info.name} · ${info.city}, ${info.country}` : code}
                  className="inline-flex items-center gap-1 rounded-md bg-surface-3 py-0.5 pr-0.5 pl-2 text-xs"
                >
                  <span className="font-semibold">{code}</span>
                  {info && <span className="max-w-[7rem] truncate text-ink-2">{info.city}</span>}
                  <button
                    type="button"
                    aria-label={`Quitar ${code}`}
                    className="rounded px-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
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
              className="min-w-[7rem] flex-1 bg-transparent py-1 text-base outline-none placeholder:text-ink-3"
              value={text}
              placeholder={selected.length ? "Agregar otro…" : "Ciudad, país o código"}
              onFocus={() => setEditing(true)}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
            />
        </div>
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-2 max-h-80 w-full min-w-[19rem] overflow-auto rounded-xl border border-line-strong bg-surface-2 p-1 shadow-2xl shadow-black/50"
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
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${i === active ? "bg-surface-3" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
            >
              {s.kind === "city" ? (
                <>
                  <span className="grid h-9 w-11 shrink-0 place-items-center rounded-md bg-accent-soft text-[11px] font-semibold text-accent">
                    {s.codes.length} apt
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {s.label}, {s.country}
                    </span>
                    <span className="block text-xs text-ink-2">Todos los aeropuertos · {s.codes.join(", ")}</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="grid h-9 w-11 shrink-0 place-items-center rounded-md bg-surface text-xs font-semibold">
                    {s.code}
                  </span>
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
