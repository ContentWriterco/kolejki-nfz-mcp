import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { UserError, log } from "./config.js";
import { findBenefits, findCare, NFZ_SITE } from "./report.js";
import { VERSION } from "./version.js";
import { usage, classify } from "./usage.js";

type Text = { content: { type: "text"; text: string }[]; isError?: boolean };

async function run(tool: string, fn: () => Promise<string>): Promise<Text> {
  const t0 = performance.now();
  let res: Text;
  let userErr = false;
  try {
    res = { content: [{ type: "text", text: await fn() }] };
  } catch (e) {
    userErr = e instanceof UserError;
    const msg = userErr ? (e as Error).message : `Internal error: ${(e as Error).message}`;
    if (!userErr) log("error", (e as Error).stack);
    res = { content: [{ type: "text", text: msg }], isError: true };
  }
  if (usage.enabled) {
    const text = res.content[0].text;
    void usage.tool(tool, /^Nie znaleziono|Brak list oczekujących|Brak miejsc/.test(text) ? "not_found" : classify(text, !!res.isError, userErr), performance.now() - t0);
  }
  return res;
}

export const INSTRUCTIONS = `NFZ (Polish public health fund) waiting times: where in Poland a specialist visit, test or treatment paid by NFZ is available soonest near a place – from the official NFZ "Terminy leczenia" API.
Use find_care with what the user needs in everyday words ("okulista", "ortopeda", "rezonans magnetyczny kolana", "endoprotezoplastyka biodra") and their town or address. Set urgent=true only if the referral is marked urgent ("pilne"), children=true for a child.
Results are sorted by NFZ's forecast waiting time, with address, phone, distance and accessibility. The forecast is an NFZ estimate, not a booking: the patient registers by phone or in person, with a referral where needed. Point to terminyleczenia.nfz.gov.pl for the current first free date. Do not give medical advice beyond where to get care; in an emergency tell the user to call 112. Answer in the user's language.`;

export function createServer(): McpServer {
  const server = new McpServer({ name: "kolejki-nfz-mcp", version: VERSION }, { instructions: INSTRUCTIONS });
  const ro = { readOnlyHint: true, openWorldHint: true } as const;
  server.registerTool(
    "find_care",
    {
      title: "Shortest NFZ waiting times near a place",
      description:
        "Where a specialist, diagnostic test or treatment paid by NFZ is available soonest near a place in Poland. Returns clinics and hospitals with NFZ's forecast waiting time, people in the queue, address, phone, distance, accessibility and whether children are seen. service: everyday words (okulista, kardiolog, rezonans, zaćma, rehabilitacja…) or an exact NFZ benefit name from find_benefits. place: town, address or 'lat,lon'.",
      inputSchema: {
        service: z.string().describe("What is needed, e.g. 'okulista', 'ortopeda', 'rezonans magnetyczny', 'endoprotezoplastyka stawu biodrowego'"),
        place: z.string().describe("Town, address or 'lat,lon' in Poland"),
        benefit: z.string().optional().describe("Exact NFZ benefit name (from find_benefits / 'Inne pasujące świadczenia') – overrides service matching"),
        urgent: z.boolean().optional().describe("Urgent case (referral marked 'pilne'); default false = stable case"),
        children: z.boolean().optional().describe("Patient is a child – searches paediatric clinics"),
        hospital: z.boolean().optional().describe("Hospital ward instead of an outpatient clinic"),
        radius_km: z.number().min(1).max(300).optional().describe("Search radius in km (default 30, widened automatically if few results)"),
        sort: z.enum(["wait", "distance"]).optional().describe("'wait' (default) = shortest waiting time first, 'distance' = nearest first"),
        max: z.number().int().min(1).max(30).optional().describe("How many places to list (default 10)"),
      },
      annotations: ro,
    },
    async (a) => run("find_care", () => findCare(a)),
  );
  server.registerTool(
    "find_benefits",
    {
      title: "NFZ benefit names",
      description: "Look up official NFZ benefit names (clinics, wards, tests, procedures) matching a word, e.g. 'rezonans' or 'okulist'. Use the exact name as find_care.benefit.",
      inputSchema: { query: z.string().min(3).describe("Word or fragment, e.g. 'kardiolog', 'tomograf', 'zaćm'") },
      annotations: ro,
    },
    async (a) => run("find_benefits", () => findBenefits(a.query)),
  );
  server.registerTool(
    "data_sources",
    { title: "Data sources", description: "Where the data comes from and caveats.", inputSchema: {}, annotations: ro },
    async () =>
      run("data_sources", async () =>
        [
          "Kolejki: Narodowy Fundusz Zdrowia – API „Terminy leczenia” 1.4 (https://apinfz.nfz.gov.pl/app-itl-api-pcus/), dane publiczne przekazywane przez świadczeniodawców z umową z NFZ.",
          "Prognozowany czas oczekiwania (PCUS) to szacunek NFZ, aktualizowany kilka razy w miesiącu; liczba oczekujących i średni czas – stan na koniec miesiąca podawany przez placówkę.",
          `Pierwszy wolny termin i rejestracja: ${NFZ_SITE} oraz telefonicznie w placówce. Serwer nie rezerwuje wizyt i nie jest usługą NFZ.`,
          "Nie wszystkie świadczenia mają listy oczekujących (np. większość porad kardiologicznych nie jest raportowana w tym API).",
          "Lokalizacja miejscowości: GUGiK (państwowy rejestr adresów, ULDK).",
          `kolejki-nfz-mcp ${VERSION} · https://github.com/ContentWriterco/kolejki-nfz-mcp`,
        ].join("\n"),
      ),
  );
  return server;
}
