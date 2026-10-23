import { config, log, UserError } from "./config.js";

/** NFZ voivodeship codes (01–16) = TERYT voivodeship code / 2 */
export const PROVINCES: Record<string, string> = {
  "01": "dolnośląskie", "02": "kujawsko-pomorskie", "03": "lubelskie", "04": "lubuskie", "05": "łódzkie", "06": "małopolskie",
  "07": "mazowieckie", "08": "opolskie", "09": "podkarpackie", "10": "podlaskie", "11": "pomorskie", "12": "śląskie",
  "13": "świętokrzyskie", "14": "warmińsko-mazurskie", "15": "wielkopolskie", "16": "zachodniopomorskie",
};
export const provinceFromTeryt = (teryt: string) => String(Math.round(+teryt.slice(0, 2) / 2)).padStart(2, "0");

export interface Queue {
  id: string;
  case: number;
  benefit: string;
  provider: string;
  place: string;
  address: string;
  locality: string;
  phone: string;
  teryt: string;
  lat?: number;
  lon?: number;
  children: boolean | null;
  ageRange: string | null;
  access: string[];
  transport: string | null;
  /** NFZ forecast of the time to get the service ("prognozowany czas uzyskania świadczenia"), e.g. "1 mies. 2 tyg." */
  wait: string | null;
  waitDays: number | null;
  waitAsOf: string | null;
  awaiting: number | null;
  avgDays: number | null;
  statsMonth: string | null;
}

let last = 0;
let chain: Promise<unknown> = Promise.resolve();

/** serialised, throttled GET against the NFZ API */
async function api(path: string, params: Record<string, string>): Promise<any> {
  const run = async () => {
    const wait = last + config.gapMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const u = new URL(config.apiUrl.replace(/\/$/, "") + path);
    for (const [k, v] of Object.entries({ ...params, format: "json", "api-version": config.apiVersion })) u.searchParams.set(k, v);
    for (let attempt = 0; ; attempt++) {
      last = Date.now();
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 20_000);
      try {
        const res = await fetch(u, { signal: ac.signal, headers: { accept: "application/json", "user-agent": config.userAgent } });
        const body = await res.text();
        let j: any;
        try {
          j = JSON.parse(body);
        } catch {
          j = null;
        }
        if (res.ok && j) return j;
        if (j?.errors?.length && res.status < 500 && res.status !== 429) return j;
        const ra = Number(res.headers.get("retry-after"));
        throw Object.assign(new Error(`NFZ API HTTP ${res.status}`), { retryMs: Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 0 });
      } catch (e) {
        if (attempt >= 3) throw new Error(`NFZ API chwilowo niedostępne (${(e as Error).message}) – spróbuj za minutę`);
        log("warn", "retry", u.pathname, (e as Error).message);
        await new Promise((r) => setTimeout(r, (e as { retryMs?: number }).retryMs || 2000 * 2 ** attempt));
      } finally {
        clearTimeout(t);
      }
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

/** "1 mies. 2 tyg.", "26 dni", "1 rok 3 mies." -> days (approx.) */
export function waitToDays(s: string | null | undefined): number | null {
  if (!s) return null;
  let d = 0;
  let hit = false;
  for (const m of s.toLowerCase().matchAll(/(\d+)\s*(lat|lata|rok|mies|tydz|tyg|dni|dzie)/g)) {
    hit = true;
    const n = +m[1];
    d += m[2].startsWith("r") || m[2].startsWith("lat") ? n * 365 : m[2] === "mies" ? n * 30 : m[2] === "tyg" || m[2] === "tydz" ? n * 7 : n;
  }
  return hit ? d : null;
}

const ACCESS: [string, string][] = [
  ["elevator", "winda"], ["ramp", "podjazd"], ["wheelchairs", "dostępne dla wózków"], ["toilet", "toaleta dla niepełnosprawnych"],
  ["car-park", "parking"], ["automatic-door", "drzwi automatyczne"],
];

export function parseQueue(x: any): Queue {
  const a = x.attributes ?? {};
  const pd = a.statistics?.["provider-data"];
  const d = a.dates;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const wait = d && d.applicable !== false && typeof d.pcus === "string" && d.pcus.trim() ? d.pcus.trim() : null;
  return {
    id: String(x.id),
    case: a.case,
    benefit: a.benefit ?? "",
    provider: a.provider ?? "",
    place: a.place ?? "",
    address: a.address ?? "",
    locality: a.locality ?? "",
    phone: a.phone ?? "",
    teryt: a["teryt-place"] ?? a["teryt-provider"] ?? "",
    lat: num(a.latitude) ?? undefined,
    lon: num(a.longitude) ?? undefined,
    children: a["benefits-for-children"] === "Y" ? true : a["benefits-for-children"] === "N" ? false : null,
    ageRange: a["age-range"] ?? null,
    access: ACCESS.filter(([k]) => a[k] === "Y").map(([, v]) => v),
    transport: a["public-transport-lines"] ?? null,
    wait,
    waitDays: waitToDays(wait),
    waitAsOf: d?.["date-situation-as-at"] ?? null,
    awaiting: pd && pd.update ? num(pd.awaiting) : null,
    avgDays: pd && pd.update ? num(pd["average-period"]) : null,
    statsMonth: pd?.update ?? null,
  };
}

const cache = new Map<string, { t: number; v: unknown }>();
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < config.cacheTtlMs) return Promise.resolve(hit.v as T);
  return fn().then((v) => {
    cache.set(key, { t: Date.now(), v });
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
    return v;
  });
}

/** benefit names (NFZ dictionary) containing the text (min. 3 characters) */
export function benefits(name: string): Promise<string[]> {
  const q = name.trim();
  if (q.length < 3) throw new UserError("Podaj co najmniej 3 litery nazwy świadczenia.");
  return cached(`b|${q.toUpperCase()}`, async () => {
    const out: string[] = [];
    for (let page = 1; page <= 10; page++) {
      const j = await api("/benefits", { name: q, page: String(page), limit: "25" });
      if (j.errors) break;
      out.push(...((j.data ?? []) as string[]));
      if (!j.links?.next) break;
    }
    return [...new Set(out)];
  });
}

/** all waiting-list entries for one benefit (exact name) in a voivodeship; case 1 = stable, 2 = urgent */
export function queues(benefit: string, province: string, kase: 1 | 2): Promise<{ rows: Queue[]; total: number; truncated: boolean }> {
  return cached(`q|${benefit}|${province}|${kase}`, async () => {
    const rows: Queue[] = [];
    let total = 0;
    let page = 1;
    for (; page <= config.maxPages; page++) {
      const j = await api("/queues", { case: String(kase), province, benefit, page: String(page), limit: "25" });
      if (j.errors) {
        if (page === 1 && !String(j.errors[0]?.["error-reason"] ?? "").match(/no results|not found/i)) log("warn", "queues", benefit, j.errors[0]?.["error-reason"]);
        break;
      }
      total = j.meta?.count ?? total;
      rows.push(...(j.data ?? []).map(parseQueue).filter((q: Queue) => q.benefit === benefit));
      if (!j.links?.next) break;
    }
    return { rows, total, truncated: rows.length < total && page > config.maxPages };
  });
}
