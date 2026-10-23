import { config, UserError } from "./config.js";
import { fromPuwg92, toPuwg92 } from "./puwg92.js";

export interface Place {
  label: string;
  /** EPSG:2180 easting / northing */
  x: number;
  y: number;
  lat: number;
  lon: number;
  teryt?: string;
  /** exact address point vs. whole street / town */
  precision: "address" | "street" | "town" | "point";
}

const cache = new Map<string, Place[]>();

async function uug(params: Record<string, string>): Promise<Record<string, Record<string, string>> | null> {
  const u = new URL(config.uugUrl);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10_000);
  try {
    const res = await fetch(u, { signal: ac.signal, headers: { "user-agent": config.userAgent } });
    if (!res.ok) return null;
    const j = (await res.json()) as { results?: Record<string, Record<string, string>> | null };
    return j.results ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** many villages share a town's name ("Piła" x14): the one whose commune carries its name, then county-seat communes, first */
function townsFirst(rs: Record<string, string>[]): Record<string, string>[] {
  const score = (a: Record<string, string>) => (a.street ? 0 : (a.commune && a.city && a.commune === a.city ? 2 : 0) + (a.teryt?.endsWith("01") ? 1 : 0));
  return rs.map((a, i) => ({ a, i, s: score(a) })).sort((x, y) => y.s - x.s || x.i - y.i).map(({ a }) => a);
}

function fromXY(label: string, x: number, y: number, precision: Place["precision"], teryt?: string): Place {
  const { lat, lon } = fromPuwg92(x, y);
  return { label, x, y, lat, lon, teryt, precision };
}

/**
 * Address / street / town / "lat,lon" -> point, via the GUGiK UUG geocoder (official address register).
 * Returns candidates, best first.
 */
export async function geocode(input: string): Promise<Place[]> {
  const q = input.trim();
  const coord = q.match(/^(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)$/);
  if (coord) {
    const lat = +coord[1];
    const lon = +coord[2];
    const { x, y } = toPuwg92(lat, lon);
    return [{ label: `${lat.toFixed(5)},${lon.toFixed(5)}`, x, y, lat, lon, precision: "point" }];
  }
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  // "Poznań, Garbary 10" / "Garbary 10, Poznań" -> UUG expects "town, street number"
  const parts = q.split(",").map((s) => s.trim()).filter(Boolean);
  const variants = new Set<string>([q]);
  if (parts.length === 2) {
    variants.add(`${parts[1]}, ${parts[0]}`);
  }
  let out: Place[] = [];
  for (const v of variants) {
    const r = await uug({ request: "GetAddress", address: v });
    if (r) {
      out = townsFirst(Object.values(r)).map((a) =>
        fromXY(`${a.city}${a.street ? `, ${a.street}` : ""}${a.number ? ` ${a.number}` : ""}`, +a.x, +a.y, a.number ? "address" : a.street ? "street" : "town", a.teryt),
      );
      if (out.length) break;
    }
  }
  if (!out.length) {
    // street without number: UUG GetStreet ("Poznań, Garbary")
    for (const v of variants) {
      const r = await uug({ request: "GetStreet", street: v });
      if (r) {
        out = Object.values(r).map((a) => fromXY(`${a.city}, ${a.street}`, +a.x, +a.y, "street", a.teryt));
        if (out.length) break;
      }
    }
  }
  if (!out.length) {
    // town / village name
    const r = await uug({ request: "GetAddress", address: parts[0] ?? q });
    if (r) {
      out = townsFirst(Object.values(r)).map((a) => fromXY(a.city ?? q, +a.x, +a.y, "town", a.teryt));
    }
  }
  out = out.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  // several villages share a name ("Zakopane" exists 4 times): prefer the one that is a town (urban gmina part, TERYT type 1/4/8/9)
  if (out.length > 1 && out.every((p) => p.precision === "town")) out = await rankTowns(out);
  if (!out.length) throw new UserError(`Could not find "${input}". Use an address like "Poznań, Garbary 10", a street "Kraków, Długa", a town, or "lat,lon".`);
  cache.set(key, out);
  if (cache.size > 5000) cache.delete(cache.keys().next().value!);
  return out;
}

/** Order same-name towns: urban localities (gmina type 1 miejska, 4 miasto w gminie miejsko-wiejskiej, 8/9 dzielnica) first. */
async function rankTowns(places: Place[]): Promise<Place[]> {
  const cand = places.slice(0, 8);
  const types = await Promise.all(
    cand.map(async (p) => {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 8_000);
      try {
        const res = await fetch(`https://uldk.gugik.gov.pl/?request=GetCommuneByXY&xy=${p.x},${p.y},2180&result=teryt`, { signal: ac.signal, headers: { "user-agent": config.userAgent } });
        const m = (await res.text()).match(/\d{6}_(\d)/);
        return m ? +m[1] : 0;
      } catch {
        return 0;
      } finally {
        clearTimeout(t);
      }
    }),
  );
  const urban = (k: number) => [1, 4, 8, 9].includes(k);
  const order = cand.map((p, i) => ({ p, i, u: urban(types[i]) })).sort((a, b) => Number(b.u) - Number(a.u) || a.i - b.i);
  const ranked = [...order.map((o) => o.p), ...places.slice(8)];
  return ranked.map((p, i) => (i === 0 ? p : { ...p, label: `${p.label} (${p.lat.toFixed(3)}, ${p.lon.toFixed(3)})` }));
}
