import { UserError } from "./config.js";
import { benefits, PROVINCES, queues, type Queue } from "./nfz.js";
import { addressPoint, cityOf, distanceKm, localityPoint, origin } from "./locate.js";
import { isChildren, isHospital, nameFragments } from "./specialties.js";
import { fold, titleCase } from "./text.js";

export const NFZ_SITE = "https://terminyleczenia.nfz.gov.pl";

const km = (v: number) => `${v < 10 ? v.toFixed(1).replace(".", ",") : Math.round(v)} km`;
const date = (s: string | null) => (s && /^\d{4}-\d\d-\d\d/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : s ?? "");
const month = (s: string | null) => (s && /^\d{4}-\d\d/.test(s) ? `${s.slice(5, 7)}.${s.slice(0, 4)}` : s ?? "");

/** query -> matching NFZ benefit names (dictionary), using everyday-word aliases */
export async function resolveBenefits(q: string): Promise<{ names: string[]; fragment: string | null }> {
  for (const frag of nameFragments(q)) {
    let names = await benefits(frag);
    // the NFZ dictionary also returns loosely related names (endokrynolog -> chirurgia): keep the ones that contain the word
    const f = fold(frag);
    const key = f.includes(" ") ? f : f.slice(0, 7);
    const strict = names.filter((n) => fold(n).includes(key));
    if (strict.length) names = strict;
    if (names.length) return { names, fragment: frag };
  }
  return { names: [], fragment: null };
}

/** choose which benefits to search by default: specialist clinic first, adults/children as asked */
export function pickBenefits(names: string[], o: { children?: boolean; hospital?: boolean }): string[] {
  let pool = names.filter((b) => (o.children ? isChildren(b) : !isChildren(b)));
  if (!pool.length) pool = names;
  const want = pool.filter((b) => (o.hospital ? isHospital(b) : !isHospital(b)));
  if (want.length) pool = want;
  const rank = (b: string) =>
    /^ŚWIADCZENIA Z ZAKRESU/.test(b) ? 0 : /REHABILITAC/.test(b) ? 3 : /^PORADNIA/.test(b) ? 1 : /^ODDZIAŁ/.test(b) ? 1 : 2;
  pool.sort((a, b) => rank(a) - rank(b) || a.length - b.length);
  return pool.slice(0, 1);
}

export async function findBenefits(q: string): Promise<string> {
  const { names } = await resolveBenefits(q);
  if (!names.length) return `Nie znaleziono świadczeń NFZ pasujących do „${q}”. Spróbuj nazwy specjalności (np. „okulista”, „ortopeda”, „rezonans”) albo fragmentu nazwy poradni.`;
  return [`Świadczenia NFZ pasujące do „${q}” (${names.length}) – nazwę możesz podać dokładnie w find_care (benefit):`, ...names.map((n) => `- ${n}`)].join("\n");
}

interface Hit extends Queue {
  km: number | null;
  /** distance to the street address (true) or only to the town (false) */
  exact: boolean;
}

function line(h: Hit, i: number, showBenefit: boolean): string {
  const name = titleCase(h.place && h.place !== h.provider && !/^(PORADNIA|ŚWIADCZENIA|ODDZIAŁ|PRACOWNIA)/.test(h.place) ? h.place : h.provider);
  const where = `${titleCase(h.locality)}, ${titleCase(h.address)}`;
  const L = [`${i}. ${name} – ${where}${h.km === null ? "" : !h.exact && h.km < 1.5 ? " (w tej miejscowości)" : ` (ok. ${km(h.km)})`}${h.phone ? ` · tel. ${h.phone}` : ""}`];
  const w: string[] = [];
  if (showBenefit) w.push(h.benefit.toLowerCase());
  if (h.wait) w.push(`prognozowany czas oczekiwania: ${h.waitDays === 0 ? "od ręki (0 dni)" : h.wait}${h.waitAsOf ? ` (stan na ${date(h.waitAsOf)})` : ""}`);
  else w.push("brak prognozy terminu – zadzwoń");
  if (h.awaiting !== null && h.statsMonth) w.push(`w kolejce ${h.awaiting} os.${h.avgDays ? `, średnio ${h.avgDays} dni czekania` : ""} (${month(h.statsMonth)})`);
  L.push(`   ${w.join(" · ")}`);
  const x: string[] = [];
  const ages = (h.ageRange ?? "").split(",").map((v) => v.trim()).filter((v) => v && !/^-+$/.test(v));
  if (h.children === true) x.push(`przyjmuje dzieci${ages.length ? ` (wiek ${ages.join(", ")})` : ""}`);
  if (h.access.length) x.push(h.access.join(", "));
  if (x.length) L.push(`   ${x.join(" · ")}`);
  return L.join("\n");
}

export interface CareArgs {
  service: string;
  place: string;
  benefit?: string;
  urgent?: boolean;
  children?: boolean;
  hospital?: boolean;
  radius_km?: number;
  sort?: "wait" | "distance";
  max?: number;
}

export async function findCare(a: CareArgs): Promise<string> {
  const max = Math.min(Math.max(a.max ?? 10, 1), 30);
  const kase = a.urgent ? 2 : 1;
  const where = await origin(a.place);
  let names: string[];
  let all: string[] = [];
  if (a.benefit) {
    names = [a.benefit.trim().toUpperCase()];
  } else {
    const r = await resolveBenefits(a.service);
    all = r.names;
    if (!all.length) throw new UserError(`Nie znaleziono świadczenia NFZ pasującego do „${a.service}”. Użyj find_benefits albo podaj specjalność (np. „okulista”, „ortopeda”, „rezonans magnetyczny”).`);
    names = pickBenefits(all, a);
  }
  const results = await Promise.all(names.map((b) => queues(b, where.province, kase)));
  let rows = results.flatMap((r) => r.rows);
  // a child: drop places that declare they do not see children (unless the benefit itself is paediatric)
  if (a.children) rows = rows.filter((q) => q.children !== false || isChildren(q.benefit));
  const truncated = results.some((r) => r.truncated);

  // locate every provider's town (cached), then filter by distance
  const hits: Hit[] = [];
  const pts = new Map<Queue, { lat: number; lon: number } | null>();
  for (const q of rows) {
    let pt = q.lat !== undefined && q.lon !== undefined ? { lat: q.lat, lon: q.lon } : null;
    if (!pt) pt = await localityPoint(q.locality, q.teryt);
    pts.set(q, pt);
  }
  // in towns with several places (cities, districts) the town centre is too coarse: geocode the street address
  const perTown = new Map<string, number>();
  for (const [, pt] of pts) if (pt) perTown.set(`${pt.lat},${pt.lon}`, (perTown.get(`${pt.lat},${pt.lon}`) ?? 0) + 1);
  const exact = new Set<Queue>();
  const todo = rows.filter((q) => {
    const pt = pts.get(q);
    return pt && q.lat === undefined && (perTown.get(`${pt.lat},${pt.lon}`) ?? 0) >= 3 && distanceKm(where, pt) <= Math.max(a.radius_km ?? 30, 50) + 15;
  });
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(
      todo.slice(i, i + 4).map(async (q) => {
        const p = await addressPoint(cityOf(q.locality), q.address, q.teryt);
        if (p) {
          pts.set(q, p);
          exact.add(q);
        }
      }),
    );
  }
  for (const q of rows) {
    const pt = pts.get(q);
    hits.push({ ...q, km: pt ? distanceKm(where, pt) : null, exact: exact.has(q) || q.lat !== undefined });
  }
  let radius = Math.min(Math.max(a.radius_km ?? 30, 1), 300);
  let near = hits.filter((h) => h.km !== null && h.km <= radius);
  let widened = false;
  if (a.radius_km === undefined) {
    for (const r of [50, 80, 150]) {
      if (near.length >= 3) break;
      radius = r;
      near = hits.filter((h) => h.km !== null && h.km <= radius);
      widened = true;
    }
  }
  const byWait = (x: Hit, y: Hit) => (x.waitDays ?? 1e9) - (y.waitDays ?? 1e9) || (x.km ?? 1e9) - (y.km ?? 1e9);
  const byDist = (x: Hit, y: Hit) => (x.km ?? 1e9) - (y.km ?? 1e9) || (x.waitDays ?? 1e9) - (y.waitDays ?? 1e9);
  near.sort(a.sort === "distance" ? byDist : byWait);

  const prov = PROVINCES[where.province] ?? where.province;
  const L: string[] = [];
  L.push(`${names.map((n) => n.toLowerCase()).join(" / ")} – ${a.urgent ? "przypadek PILNY" : "przypadek stabilny"} – w promieniu ${radius} km od: ${where.label} (woj. ${prov})`);
  if (where.note) L.push(where.note);
  if (!a.benefit && !a.hospital && !names.some((n) => /^ŚWIADCZENIA Z ZAKRESU|^PORADNIA (?!REHABILITACJI)/.test(n)) && names.some((n) => /REHABILITAC/.test(n)) && !/rehabilit|fizjo/i.test(a.service))
    L.push(`Uwaga: NFZ nie publikuje list oczekujących dla zwykłej poradni w tej specjalności – pokazuję świadczenia, które są w danych (np. rehabilitacja). Termin u lekarza sprawdź telefonicznie w przychodni albo na ${NFZ_SITE}.`);
  if (widened) L.push(`(W promieniu 30 km było mniej niż 3 miejsca – poszerzono do ${radius} km.)`);
  if (!rows.length) {
    L.push(`Brak list oczekujących na to świadczenie w woj. ${prov} w danych NFZ.`);
  } else if (!near.length) {
    L.push(`Brak miejsc w promieniu ${radius} km. W całym województwie: ${rows.length} – zwiększ radius_km.`);
  } else {
    L.push(`Sortowanie: ${a.sort === "distance" ? "najbliżej" : "najkrótsze oczekiwanie"}. Pokazuję ${Math.min(max, near.length)} z ${near.length} miejsc w promieniu (w województwie: ${rows.length}${truncated ? "+" : ""}).`);
    L.push("");
    near.slice(0, max).forEach((h, i) => L.push(line(h, i + 1, names.length > 1)));
  }
  const unknown = hits.filter((h) => h.km === null).length;
  if (unknown) L.push(`\n(${unknown} miejsc bez ustalonej lokalizacji pominięto.)`);
  L.push("");
  L.push(`Prognoza terminu to szacunek NFZ (na podstawie list oczekujących zgłaszanych przez placówki), nie rezerwacja. Rejestracja: telefonicznie w placówce${a.urgent ? " (skierowanie z oznaczeniem „pilne”)" : ""}. Aktualny pierwszy wolny termin: ${NFZ_SITE}`);
  L.push(`Odległość w linii prostej: w miastach do adresu placówki, w mniejszych miejscowościach do ich centrum. Szukano tylko w woj. ${prov}; blisko granicy województwa sprawdź też sąsiednie (podaj miejscowość po drugiej stronie).`);
  const rest = all.filter((n) => !names.includes(n));
  if (rest.length) L.push(`Inne pasujące świadczenia (podaj jako benefit): ${rest.slice(0, 12).join("; ")}${rest.length > 12 ? " …" : ""}`);
  return L.join("\n");
}
