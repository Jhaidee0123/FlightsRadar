/** Búsqueda de aeropuertos por ciudad, país, nombre o código, sin depender de tildes. */

type Row = [code: string, name: string, city: string, country: string, rank: number];

export interface AirportInfo {
  code: string;
  name: string;
  city: string;
  country: string;
}

export type Suggestion =
  | { kind: "city"; label: string; country: string; codes: string[] }
  | ({ kind: "airport" } & AirportInfo);

/**
 * Ciudades con nombre en español o con varios aeropuertos. Las de varios códigos
 * aparecen como opción "todos los aeropuertos"; las demás solo hacen que el nombre
 * en español encuentre su aeropuerto.
 */
const CITIES: { name: string; codes: string[]; alt?: string[] }[] = [
  { name: "Medellín", codes: ["MDE", "EOH"] },
  { name: "Tokio", codes: ["NRT", "HND"], alt: ["Tokyo"] },
  { name: "Osaka", codes: ["KIX", "ITM"] },
  { name: "Seúl", codes: ["ICN", "GMP"], alt: ["Seoul"] },
  { name: "Pekín", codes: ["PEK", "PKX"], alt: ["Beijing"] },
  { name: "Shanghái", codes: ["PVG", "SHA"], alt: ["Shanghai"] },
  { name: "Bangkok", codes: ["BKK", "DMK"] },
  { name: "Nueva York", codes: ["JFK", "EWR", "LGA"], alt: ["New York", "NYC"] },
  { name: "Washington", codes: ["IAD", "DCA", "BWI"] },
  { name: "Chicago", codes: ["ORD", "MDW"] },
  { name: "Los Ángeles", codes: ["LAX", "BUR", "LGB", "SNA"], alt: ["Los Angeles"] },
  { name: "San Francisco", codes: ["SFO", "OAK", "SJC"] },
  { name: "Miami", codes: ["MIA", "FLL"] },
  { name: "Dallas", codes: ["DFW", "DAL"] },
  { name: "Houston", codes: ["IAH", "HOU"] },
  { name: "Orlando", codes: ["MCO", "SFB"] },
  { name: "Toronto", codes: ["YYZ", "YTZ"] },
  { name: "Ciudad de México", codes: ["MEX", "NLU"], alt: ["Mexico City", "CDMX", "DF"] },
  { name: "São Paulo", codes: ["GRU", "CGH", "VCP"], alt: ["Sao Paulo"] },
  { name: "Río de Janeiro", codes: ["GIG", "SDU"], alt: ["Rio de Janeiro"] },
  { name: "Buenos Aires", codes: ["EZE", "AEP"] },
  { name: "Londres", codes: ["LHR", "LGW", "STN", "LTN", "LCY"], alt: ["London"] },
  { name: "París", codes: ["CDG", "ORY"], alt: ["Paris"] },
  { name: "Milán", codes: ["MXP", "LIN", "BGY"], alt: ["Milan"] },
  { name: "Roma", codes: ["FCO", "CIA"], alt: ["Rome"] },
  { name: "Estocolmo", codes: ["ARN", "BMA"], alt: ["Stockholm"] },
  { name: "Moscú", codes: ["SVO", "DME", "VKO"], alt: ["Moscow"] },
  { name: "Estambul", codes: ["IST", "SAW"], alt: ["Istanbul"] },
  { name: "Ciudad de Panamá", codes: ["PTY"], alt: ["Panama"] },
  { name: "La Habana", codes: ["HAV"], alt: ["Havana"] },
  { name: "Nueva Orleans", codes: ["MSY"], alt: ["New Orleans"] },
  { name: "Filadelfia", codes: ["PHL"], alt: ["Philadelphia"] },
  { name: "Lisboa", codes: ["LIS"], alt: ["Lisbon"] },
  { name: "Múnich", codes: ["MUC"], alt: ["Munich"] },
  { name: "Fráncfort", codes: ["FRA"], alt: ["Frankfurt"] },
  { name: "Berlín", codes: ["BER"], alt: ["Berlin"] },
  { name: "Ámsterdam", codes: ["AMS"], alt: ["Amsterdam"] },
  { name: "Bruselas", codes: ["BRU"], alt: ["Brussels"] },
  { name: "Ginebra", codes: ["GVA"], alt: ["Geneva"] },
  { name: "Zúrich", codes: ["ZRH"], alt: ["Zurich"] },
  { name: "Viena", codes: ["VIE"], alt: ["Vienna"] },
  { name: "Praga", codes: ["PRG"], alt: ["Prague"] },
  { name: "Varsovia", codes: ["WAW"], alt: ["Warsaw"] },
  { name: "Atenas", codes: ["ATH"], alt: ["Athens"] },
  { name: "Copenhague", codes: ["CPH"], alt: ["Copenhagen"] },
  { name: "Dublín", codes: ["DUB"], alt: ["Dublin"] },
  { name: "Edimburgo", codes: ["EDI"], alt: ["Edinburgh"] },
  { name: "Florencia", codes: ["FLR"], alt: ["Florence"] },
  { name: "Venecia", codes: ["VCE"], alt: ["Venice"] },
  { name: "Nápoles", codes: ["NAP"], alt: ["Naples"] },
  { name: "Sevilla", codes: ["SVQ"], alt: ["Seville"] },
  { name: "El Cairo", codes: ["CAI"], alt: ["Cairo"] },
  { name: "Ciudad del Cabo", codes: ["CPT"], alt: ["Cape Town"] },
  { name: "Johannesburgo", codes: ["JNB"], alt: ["Johannesburg"] },
  { name: "Nueva Delhi", codes: ["DEL"], alt: ["New Delhi", "Delhi"] },
  { name: "Bombay", codes: ["BOM"], alt: ["Mumbai"] },
  { name: "Singapur", codes: ["SIN"], alt: ["Singapore"] },
  { name: "Cantón", codes: ["CAN"], alt: ["Guangzhou"] },
  { name: "Sídney", codes: ["SYD"], alt: ["Sydney"] },
  { name: "Dubái", codes: ["DXB"], alt: ["Dubai"] },
];

const countryNames = new Intl.DisplayNames(["es"], { type: "region" });

/** País de los usuarios: a igual coincidencia, sus aeropuertos salen primero. */
const HOME_COUNTRY = "CO";

export function countryName(iso: string): string {
  try {
    return countryNames.of(iso) ?? iso;
  } catch {
    return iso;
  }
}

export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

interface Indexed extends AirportInfo {
  rank: number;
  nCity: string;
  nName: string;
  nCountry: string;
  nAliases: string[];
}

export interface PlaceIndex {
  byCode: Map<string, AirportInfo>;
  search: (query: string, exclude: string[]) => Suggestion[];
}

let indexPromise: Promise<PlaceIndex> | null = null;

/** Carga los datos la primera vez que se usa el buscador (es un chunk aparte). */
export function loadPlaces(): Promise<PlaceIndex> {
  indexPromise ??= import("@/data/airports.json").then((m) => buildIndex(m.default as Row[]));
  return indexPromise;
}

function buildIndex(rows: Row[]): PlaceIndex {
  const aliases = new Map<string, string[]>();
  for (const c of CITIES) {
    for (const code of c.codes) {
      aliases.set(code, [...(aliases.get(code) ?? []), ...[c.name, ...(c.alt ?? [])].map(normalize)]);
    }
  }

  const airports: Indexed[] = rows.map(([code, name, city, country, rank]) => {
    const countryEs = countryName(country);
    return {
      code,
      name,
      city,
      country: countryEs,
      rank: rank + (country === HOME_COUNTRY ? 3 : 0),
      nCity: normalize(city),
      nName: normalize(name),
      nCountry: normalize(countryEs),
      nAliases: aliases.get(code) ?? [],
    };
  });
  const byCode = new Map<string, AirportInfo>(airports.map((a) => [a.code, a]));

  const groups = CITIES.filter((c) => c.codes.length > 1)
    .map((c) => ({
      ...c,
      codes: c.codes.filter((code) => byCode.has(code)),
      keys: [c.name, ...(c.alt ?? [])].map(normalize),
    }))
    .filter((c) => c.codes.length > 1);

  const startsWord = (text: string, q: string) => text.startsWith(q) || text.includes(` ${q}`);

  const score = (a: Indexed, q: string): number => {
    if (q.length === 3 && a.code.toLowerCase() === q) return 100;
    if (a.nAliases.some((x) => x.startsWith(q)) || a.nCity.startsWith(q)) return 80 + a.rank;
    if (a.nAliases.some((x) => startsWord(x, q)) || startsWord(a.nCity, q)) return 70 + a.rank;
    if (startsWord(a.nName, q)) return 60 + a.rank;
    if (a.nCountry.startsWith(q)) return 40 + a.rank;
    if (q.length >= 4 && (a.nName.includes(q) || a.nCity.includes(q))) return 20 + a.rank;
    return 0;
  };

  const search = (query: string, exclude: string[]): Suggestion[] => {
    const q = normalize(query);
    if (!q) return [];
    const skip = new Set(exclude);

    const cities: Suggestion[] = groups
      .filter((g) => g.keys.some((k) => startsWord(k, q)) && g.codes.some((c) => !skip.has(c)))
      .slice(0, 2)
      .map((g) => ({
        kind: "city",
        label: g.name,
        country: byCode.get(g.codes[0])!.country,
        codes: g.codes,
      }));

    const found = airports
      .filter((a) => !skip.has(a.code))
      .map((a) => ({ a, s: score(a, q) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s || x.a.city.localeCompare(y.a.city))
      .slice(0, 8 - cities.length)
      .map(({ a }): Suggestion => ({ kind: "airport", code: a.code, name: a.name, city: a.city, country: a.country }));

    return [...cities, ...found];
  };

  return { byCode, search };
}
