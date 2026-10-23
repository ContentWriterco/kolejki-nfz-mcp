import { VERSION } from "./version.js";

const REPO = "https://github.com/ContentWriterco/kolejki-nfz-mcp";

export function landingHtml(base: string, stats: boolean): string {
  const mcp = `${base}/mcp`;
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>kolejki-nfz-mcp – gdzie najszybciej do specjalisty na NFZ, dla AI (serwer MCP)</title>
<meta name="description" content="Darmowy serwer MCP z danymi NFZ o kolejkach: gdzie w okolicy najszybciej przyjmie okulista, ortopeda czy endokrynolog albo zrobisz rezonans na NFZ – z prognozą czasu oczekiwania, adresem i telefonem.">
<link rel="canonical" href="${base}/">
<meta property="og:title" content="Gdzie najszybciej do specjalisty na NFZ? – kolejki NFZ dla Twojego asystenta AI">
<meta property="og:description" content="Prognozowany czas oczekiwania z API NFZ „Terminy leczenia” w Claude, ChatGPT i każdym kliencie MCP. Bez klucza API.">
<meta property="og:url" content="${base}/"><meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "kolejki-nfz-mcp",
    applicationCategory: "HealthApplication",
    operatingSystem: "Any",
    softwareVersion: VERSION,
    description: "MCP server with NFZ waiting times in Poland: where a specialist, test or treatment is available soonest near you.",
    url: `${base}/`,
    codeRepository: REPO,
    license: "https://opensource.org/licenses/MIT",
    offers: { "@type": "Offer", price: "0", priceCurrency: "PLN" },
    publisher: { "@type": "Organization", name: "Compabase (Content Writer sp. z o.o.)", url: "https://compabase.com" },
  })}</script>
<style>
:root{--bg:#fff;--fg:#1f2328;--mut:#59636e;--card:#f6f8fa;--bd:#d1d9e0;--acc:#0b6bcb}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--mut:#9198a1;--card:#151b23;--bd:#3d444d;--acc:#4aa3ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
main{max-width:860px;margin:0 auto;padding:48px 16px 64px}h1{font-size:38px;line-height:1.15;margin:0 0 12px}h1 span{color:var(--acc)}h2{font-size:22px;margin:36px 0 12px}
p.lead{font-size:19px;color:var(--mut);margin:0 0 24px}.ep{display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:12px 14px;font:15px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.ep code{flex:1;min-width:0;overflow-wrap:anywhere}button{font:600 14px inherit;font-family:inherit;padding:6px 12px;border-radius:8px;border:1px solid var(--bd);background:var(--bg);color:var(--fg);cursor:pointer}
pre{background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:14px;overflow:auto;font-size:13.5px;line-height:1.5;white-space:pre-wrap}li{margin:6px 0}a{color:var(--acc)}.small{color:var(--mut);font-size:14px}
</style></head><body><main>
<h1><span>kolejki-nfz</span>-mcp</h1>
<p class="lead">Gdzie najszybciej przyjmie mnie okulista na NFZ? Prognozowany czas oczekiwania z oficjalnych danych NFZ, adres, telefon, odległość i dostępność poradni – w Claude, ChatGPT, Cursorze i każdym kliencie MCP. Za darmo, bez klucza API.</p>
<div class="ep"><code id="u">${mcp}</code><button onclick="navigator.clipboard.writeText(document.getElementById('u').textContent);this.textContent='Skopiowano'">Kopiuj adres MCP</button></div>
<h2>Przykład</h2>
<pre>Ty:    Gdzie najszybciej dostanę się do okulisty na NFZ w Poznaniu?
Agent: Według prognozy NFZ: Twoje Zdrowie, ul. Czarnieckiego 2 (Wilda) – od ręki, tel. 720 882 222;
       Med-Kompleks, ul. Opolska 58 – ok. 3 dni; NZOZ „Oko” w Skórzewie (10 km) – ok. 13 dni.
       W dużych poradniach czeka się 1,5–2 miesiące. Zapis telefonicznie w poradni.</pre>
<p class="small">Przykład na podstawie prawdziwych danych NFZ (stan na 10.10.2026).</p>
<h2>Jak podłączyć</h2>
<ul>
<li><b>Claude</b>: Ustawienia → Connectors → <i>Add custom connector</i> → wklej adres powyżej.</li>
<li><b>ChatGPT</b>: Settings → Connectors (tryb deweloperski) → dodaj serwer MCP z tym adresem.</li>
<li><b>Claude Code</b>: <code>claude mcp add --transport http kolejki-nfz ${mcp}</code></li>
<li><b>Lokalnie</b>: <code>npx -y kolejki-nfz-mcp</code></li>
</ul>
<h2>Co potrafi</h2>
<ul>
<li><b>find_care</b> – gdzie w okolicy najszybciej: poradnie i szpitale z umową z NFZ dla specjalności, badania (rezonans, tomografia) albo zabiegu (zaćma, endoprotezoplastyka), z prognozą NFZ czasu oczekiwania, liczbą oczekujących, adresem, telefonem, odległością, udogodnieniami i informacją, czy przyjmują dzieci. Przypadek stabilny albo pilny.</li>
<li><b>find_benefits</b> – oficjalne nazwy świadczeń NFZ pasujące do słowa.</li>
<li><b>data_sources</b> – źródła i zastrzeżenia.</li>
</ul>
<p class="small">Dane: Narodowy Fundusz Zdrowia – API „Terminy leczenia” (dane publiczne); lokalizacja: GUGiK. Prognoza to szacunek NFZ, nie rezerwacja – serwer nie zapisuje na wizyty i nie jest usługą NFZ. W nagłym przypadku dzwoń pod 112. Open source (MIT): <a href="${REPO}">GitHub</a>${stats ? ` · <a href="/stats">statystyki użycia</a> (anonimowe)` : ""} · wersja ${VERSION} · hostowane pro publico bono przez <a href="https://compabase.com">Compabase</a>.</p>
<p class="small" lang="en"><b>English:</b> free MCP server with NFZ (Polish public health fund) waiting times: where a specialist visit, test or treatment is available soonest near a place, with the NFZ forecast wait, address, phone and accessibility. Endpoint: <code>${mcp}</code></p>
</main></body></html>`;
}
