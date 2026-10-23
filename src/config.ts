export const config = {
  apiUrl: process.env.KOLEJKI_API_URL ?? "https://apinfz.nfz.gov.pl/app-itl-api-pcus",
  apiVersion: process.env.KOLEJKI_API_VERSION ?? "1.4",
  uugUrl: process.env.KOLEJKI_UUG_URL ?? "https://services.gugik.gov.pl/uug/",
  /** minimum gap between NFZ API requests (ms) – be gentle with a public service */
  gapMs: Number(process.env.KOLEJKI_GAP_MS ?? 600),
  /** max pages (25 rows each) fetched per benefit and voivodeship */
  maxPages: Number(process.env.KOLEJKI_MAX_PAGES ?? 24),
  cacheTtlMs: Number(process.env.KOLEJKI_CACHE_HOURS ?? 6) * 3600_000,
  log: process.env.KOLEJKI_LOG ?? "info",
  userAgent: "kolejki-nfz-mcp (+https://github.com/ContentWriterco/kolejki-nfz-mcp)",
};

export function log(level: "debug" | "info" | "warn" | "error", ...args: unknown[]) {
  const order = { debug: 0, info: 1, warn: 2, error: 3 } as const;
  if (order[level] < (order[config.log as keyof typeof order] ?? 1)) return;
  console.error(`[kolejki-nfz-mcp] ${level}:`, ...args);
}

export class UserError extends Error {}
