import { fold } from "./text.js";

/**
 * Everyday words -> fragment of the official NFZ benefit name.
 * Since 2025 most specialist clinics report as "ŚWIADCZENIA Z ZAKRESU …" (e.g. ŚWIADCZENIA Z ZAKRESU OKULISTYKI).
 */
const ALIASES: [RegExp, string][] = [
  [/^okuli|^oczn|^oko|^oczy|ophthalm/, "OKULISTY"],
  [/^zacm|^katarakt|cataract/, "SOCZEWKI"],
  [/^ortoped|^ortopd|traumatolog|orthop/, "ORTOPEDII"],
  [/^endoprotez|^proteza (biodr|kolan)|hip replacement|knee replacement/, "ENDOPROTEZOPLASTYKA"],
  [/^laryngolog|^otolaryng|^laryng|^ent$|^uszy|^gardl/, "OTOLARYNGOLOGII"],
  [/^audiolog|^foniatr|^sluch/, "AUDIOLOG"],
  [/^endokryn|^tarczyc|endocrin|thyroid/, "ENDOKRYNOLOG"],
  [/^diabet/, "DIABETOLOG"],
  [/^neurolog/, "NEUROLOG"],
  [/^neurochir/, "NEUROCHIRURG"],
  [/^dermatolog|^skorn|^skora|dermat/, "DERMATOLOG"],
  [/^urolog/, "UROLOG"],
  [/^nefrolog|^nerk/, "NEFROLOG"],
  [/^gastro|^jelit|^zoladk/, "GASTROENTEROLOG"],
  [/^pulmonolog|^pneumonolog|^pluc|^gruzl|pulmon/, "CHORÓB PŁUC"],
  [/^alergolog|^alerg/, "ALERGOLOG"],
  [/^reumatolog|^reumat|rheumat/, "REUMATOLOG"],
  [/^ginekolog|^poloz|gyn/, "GINEKOLOG"],
  [/^onkolog|^nowotw|oncolog/, "ONKOLOG"],
  [/^hematolog/, "HEMATOLOG"],
  [/^geriatr/, "GERIATR"],
  [/^kardiolog|^serc|cardio/, "KARDIOLOG"],
  [/^angiolog|^chirurg(ia)? naczyn|^naczyn/, "NACZYŃ"],
  [/^chirurg|surgeon|surgery/, "CHIRURGII OGÓLNEJ"],
  [/^psychiatr|^zdrow(ie|ia) psychiczn|psychiatr/, "ZDROWIA PSYCHICZNEGO"],
  [/^psycholog/, "PSYCHOLOG"],
  [/^uzalezn|^odwyk|^alkohol|addict/, "UZALEŻNIE"],
  [/^rehabilit|^fizjoter|physio/, "REHABILITAC"],
  [/^rezonans|^mri$|^mr$|magnetic/, "REZONANS"],
  [/^tomograf|^tk$|^ct$/, "TOMOGRAF"],
  [/^stomatolog|^dentyst|^zab|dentist/, "STOMATOLOG"],
  [/^ortodon/, "ORTODONT"],
  [/^logoped/, "LOGOPED"],
  [/^hepatolog|^watrob/, "HEPATOLOG"],
  [/^proktolog/, "PROKTOLOG"],
  [/^osteopor/, "OSTEOPOROZ"],
  [/^leczenie bolu|^bol(u)? przewlek|pain/, "LECZENIA BÓLU"],
  [/^mammograf/, "MAMMOGRAF"],
  [/^gastroskop|^kolonoskop|^endoskop/, "ENDOSKOP"],
  [/^sanatori|^uzdrow/, "UZDROWISK"],
  [/^hospicj|^paliatyw/, "PALIATYWN"],
  [/^zol$|^opiekunczo/, "OPIEKUŃCZO-LECZNICZY"],
];

/** "okulista", "do kardiologa", "MRI" -> candidate NFZ name fragments, best first */
export function nameFragments(q: string): string[] {
  const f = fold(q).replace(/^(do|na|u|wizyta( u)?|poradnia|lekarz|lekarza|specjalista)\s+/, "").trim();
  const out: string[] = [];
  for (const [re, frag] of ALIASES) if (re.test(f)) out.push(frag);
  // the raw query (upper-case, keeps Polish letters) and shortened stems: "kardiologa" -> "KARDIOLOG"
  const raw = q.trim().toUpperCase();
  if (raw.length >= 3) out.push(raw);
  const word = raw.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? raw;
  for (let n = word.length - 1; n >= 6; n--) out.push(word.slice(0, n));
  return [...new Set(out)];
}

export const isChildren = (b: string) => /DLA DZIECI|DZIECIĘC|U DZIECI|PEDIATR/.test(b);
export const isHospital = (b: string) => /^ODDZIAŁ|^PODODDZIAŁ|STACJONARN|HOSPIT/.test(b);
