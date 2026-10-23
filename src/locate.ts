import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { config, UserError } from "./config.js";
import { geocode } from "./geocode.js";
import { provinceFromTeryt } from "./nfz.js";
import { fromPuwg92, toPuwg92 } from "./puwg92.js";

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function get(url: string): Promise<string | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { "user-agent": config.userAgent } });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** TERYT of the commune at a point (GUGiK ULDK), e.g. "146501" */
export async function communeAt(lat: number, lon: number): Promise<{ teryt: string; type: number } | null> {
  const { x, y } = toPuwg92(lat, lon);
  const t = await get(`https://uldk.gugik.gov.pl/?request=GetCommuneByXY&xy=${x},${y},2180&result=teryt`);
  const m = t?.match(/(\d{6})_(\d)/);
  return m ? { teryt: m[1], type: +m[2] } : null;
}

export interface Origin {
  label: string;
  lat: number;
  lon: number;
  province: string;
  note?: string;
}

export async function origin(place: string): Promise<Origin> {
  const ps = await geocode(place);
  const p = ps[0];
  const c = await communeAt(p.lat, p.lon);
  const teryt = c?.teryt ?? p.teryt;
  if (!teryt) throw new UserError(`"${place}" nie leży w Polsce albo nie udało się ustalić województwa.`);
  // a city (urban commune) needs no "there are other places with this name" note
  const others = p.precision === "town" && ![1, 4, 8, 9].includes(c?.type ?? 0) ? ps.length - 1 : 0;
  return {
    label: p.label,
    lat: p.lat,
    lon: p.lon,
    province: provinceFromTeryt(teryt),
    note: others ? `Jest więcej miejscowości o nazwie „${place}” (${others}) – jeśli chodzi o inną, podaj gminę, adres albo „lat,lon”.` : undefined,
  };
}

// ---- where is a provider's locality (town-level, cached on disk) ----

type Pt = { lat: number; lon: number } | null;
const dir = join(process.env.KOLEJKI_CACHE_DIR ?? join(homedir(), ".cache", "kolejki-nfz-mcp"));
const file = join(dir, "localities-v1.json");
let towns: Record<string, Pt> | null = null;
let dirty: NodeJS.Timeout | null = null;

function load() {
  if (towns) return towns;
  try {
    towns = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    towns = {};
  }
  return towns!;
}
function save() {
  if (dirty) return;
  dirty = setTimeout(() => {
    dirty = null;
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify(towns));
    } catch {
      /* read-only home: keep in memory */
    }
  }, 2000);
  dirty.unref?.();
}

const cap = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase());

async function uugTown(name: string): Promise<{ lat: number; lon: number; teryt: string }[]> {
  const u = new URL(config.uugUrl);
  u.searchParams.set("request", "GetAddress");
  u.searchParams.set("address", name);
  const t = await get(u.toString());
  if (!t) return [];
  try {
    const r = JSON.parse(t).results as Record<string, Record<string, string>> | null;
    return Object.values(r ?? {})
      .filter((a) => !a.street && a.x && a.y)
      .map((a) => ({ ...fromPuwg92(+a.x, +a.y), teryt: a.teryt ?? "" }));
  } catch {
    return [];
  }
}

/**
 * "WARSZAWA PRAGA-POŁUDNIE" + TERYT "1465xx…" -> point of the town.
 * Picks the same-name place in the right commune / county; falls back to the first word (city districts).
 */
export async function localityPoint(locality: string, teryt: string): Promise<Pt> {
  const key = `${locality}|${teryt.slice(0, 6)}`;
  const t = load();
  if (key in t) return t[key];
  const names = [cap(locality)];
  // city districts: "WARSZAWA PRAGA-POŁUDNIE", "POZNAŃ-WILDA" -> the city
  const first = locality.split(/[\s-]+/)[0];
  if (first !== locality && first.length > 2) names.push(cap(first));
  let pt: Pt = null;
  for (const n of names) {
    const c = await uugTown(n);
    if (!c.length) continue;
    const best = c.find((x) => x.teryt === teryt.slice(0, 6)) ?? c.find((x) => x.teryt.slice(0, 4) === teryt.slice(0, 4)) ?? (teryt ? null : c[0]) ?? (c.length === 1 && c[0].teryt.slice(0, 2) === teryt.slice(0, 2) ? c[0] : null);
    if (best) {
      pt = { lat: +best.lat.toFixed(5), lon: +best.lon.toFixed(5) };
      break;
    }
  }
  t[key] = pt;
  save();
  return pt;
}

/** street address of a provider in a city -> point (cached on disk); null if the register does not know it */
export async function addressPoint(city: string, address: string, teryt: string): Promise<Pt> {
  const key = `@${city}|${address}`;
  const t = load();
  if (key in t) return t[key];
  let pt: Pt = null;
  const street = address.replace(/^(UL\.|ULICA|AL\.|ALEJA|OS\.|PL\.)\s*/i, "").replace(/\s*\/.*$/, "").replace(/\s+LOK.*$/i, "").replace(/(\d)\s+([A-Z])$/i, "$1$2");
  try {
    const ps = await geocode(`${cap(city)}, ${cap(street)}`);
    const p = ps.find((x) => x.precision !== "town" && (!x.teryt || !teryt || x.teryt.slice(0, 4) === teryt.slice(0, 4)));
    if (p) pt = { lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5) };
  } catch {
    pt = null;
  }
  t[key] = pt;
  save();
  return pt;
}

export const cityOf = (locality: string) => {
  const first = locality.split(/[\s-]+/)[0];
  return first.length > 2 ? first : locality;
};
