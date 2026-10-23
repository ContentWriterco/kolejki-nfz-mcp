/** lower-case, no diacritics (ł -> l) */
export function fold(s: string): string {
  return s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
}

const UPPER = new Set(["NZOZ", "SPZOZ", "ZOZ", "SP", "SPSK", "USK", "UCK", "CSK", "WSS", "SSW", "SPS", "MSWIA", "MSW", "PCK", "WIM", "CMKP", "CM", "UM", "UJ", "NFZ", "ZLA", "AOS", "POZ", "MCM", "SCM", "WCM", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII", "PSK", "SPWSZ", "WSZ", "WSOZ", "ZOL", "KOS", "PZP", "SKA", "SPK", "S.A.", "SA", "S.C.", "SP.J.", "SP.K.", "GCM", "CZD", "IMID", "ICZMP", "IPCZD"]);
const LOWER = new Set(["z", "o.o.", "o.o", "i", "w", "we", "na", "do", "od", "dla", "im.", "pod", "przy", "oraz", "ul.", "al.", "os.", "pl.", "o"]);

/** "NIEPUBLICZNY ZAKŁAD OPIEKI ZDROWOTNEJ \"ŻYCIE\" SP. Z O.O." -> "Niepubliczny Zakład Opieki Zdrowotnej „Życie” Sp. z o.o." */
export function titleCase(s: string): string {
  if (!s) return s;
  if (s !== s.toUpperCase()) return s;
  let quote = 0;
  const words = s.trim().split(/\s+/).map((w, i) => {
    if (UPPER.has(w)) return w;
    const lw = w.toLowerCase();
    if (i > 0 && LOWER.has(lw)) return lw;
    if (/^\d/.test(w)) return lw;
    return lw.replace(/(^|[-("„/.])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase());
  });
  return words
    .join(" ")
    .replace(/"/g, () => (quote++ % 2 === 0 ? "„" : "”"))
    .replace(/Spółka z Ograniczoną Odpowiedzialnością/g, "Sp. z o.o.")
    .replace(/Spółka Akcyjna/g, "S.A.")
    .replace(/\bSp\. Z O\.o\./gi, "Sp. z o.o.")
    .replace(/\bSp\. Z\.o\.o\./gi, "Sp. z o.o.");
}
