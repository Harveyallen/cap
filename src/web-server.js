/** Local Discover UI and thin JSON HTTP APIs. */
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { searchCapabilities } from './search.js';
import { inspectLocal, parseInspectFilters } from './inspector.js';
import { excludeProvider, includeProvider, pinProvider, unpinProvider } from './pin.js';
import { addCapability, loadState } from './registry.js';
import { cleanupTrial, tryCapability } from './try.js';
import { WEB_LOCALE_STORAGE_KEY, WEB_MESSAGES, resolveWebLocale, webHtmlLang } from './web-i18n.js';

export const DEFAULT_WEB_HOST = '127.0.0.1';
export const DEFAULT_WEB_PORT = 4173;
export const DEFAULT_WEB_URL = `http://${DEFAULT_WEB_HOST}:${DEFAULT_WEB_PORT}`;

const clientSource = readFileSync(new URL('./web-client.js', import.meta.url), 'utf8');

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function embedJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function headScript() {
  return '<script>globalThis.__CAP_WEB_BOOT__={messages:' + embedJson(WEB_MESSAGES)
    + ',localeKey:' + JSON.stringify(WEB_LOCALE_STORAGE_KEY)
    + ',resolveLocale:' + resolveWebLocale.toString()
    + ',htmlLang:' + webHtmlLang.toString()
    + '};(function(){try{var boot=globalThis.__CAP_WEB_BOOT__;var stored=null;try{stored=localStorage.getItem(boot.localeKey);}catch(err){}var list=(navigator.languages&&navigator.languages.length)?navigator.languages:[navigator.language];document.documentElement.lang=boot.htmlLang(boot.resolveLocale(stored,list));}catch(err){}})();</script>';
}

const en = WEB_MESSAGES.en;
const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(en['meta.title'])}</title>
<style>
:root{color-scheme:dark;--bg:#070b16;--panel:#10182c;--line:#2a3554;--text:#edf2ff;--muted:#98a5c2;--cyan:#65e6d3;--violet:#a58bfa;--warn:#f5c36a;--ok:#6ee7b7;--danger:#fb7185}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 86% 0,#1c2150 0,transparent 38%),var(--bg);color:var(--text);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,sans-serif}
.top{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:22px 28px 0;max-width:1180px;margin:auto}
.eyebrow{color:var(--cyan);letter-spacing:.16em;text-transform:uppercase;font-size:11px}
.tabs{display:flex;gap:8px}.tabs button{background:transparent;color:var(--muted);border:1px solid var(--line);border-radius:12px;padding:9px 14px;cursor:pointer;font-weight:650}
.tabs button.active{color:var(--text);border-color:var(--violet);background:#a58bfa14}
.top-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end}
.lang{display:flex;align-items:center}
.lang i{color:var(--line);font-style:normal;padding:0 2px;user-select:none}
.lang button{background:transparent;color:var(--muted);border:0;border-radius:8px;padding:8px 8px;font-weight:650;cursor:pointer}
.lang button[aria-pressed="true"]{color:var(--cyan)}
.lang button:focus-visible,.tabs button:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
.shell{max-width:1180px;margin:auto;padding:28px 24px 64px}
.hero{display:grid;grid-template-columns:1.4fr .8fr;gap:36px;align-items:end}
h1{font-size:clamp(40px,6vw,68px);line-height:.95;margin:.12em 0;letter-spacing:-.05em}
.lead{color:var(--muted);font-size:17px;max-width:640px}
.metric{background:#ffffff0a;border:1px solid var(--line);border-radius:18px;padding:20px}
.metric b{font-size:34px;color:var(--cyan);display:block;line-height:1}
form{display:flex;gap:10px;margin:32px 0 18px}input{flex:1;background:#0d1428;color:var(--text);border:1px solid var(--line);border-radius:14px;padding:16px 18px;font-size:16px;outline:none}input:focus{border-color:var(--violet);box-shadow:0 0 0 3px #a58bfa22}
button{border:0;border-radius:12px;padding:13px 18px;background:var(--cyan);color:#071411;font-weight:750;cursor:pointer}
.grid{display:grid;gap:14px}
.card{background:linear-gradient(145deg,#151e36,#10172a);border:1px solid var(--line);border-radius:16px;padding:20px;display:grid;grid-template-columns:1fr auto;gap:12px}
.card h3{margin:0;font-size:19px}.id,.meta{color:var(--muted);font:12px ui-monospace,SFMono-Regular,monospace}
.summary{margin:8px 0}.chips{display:flex;flex-wrap:wrap;gap:7px}
.chip{font-size:12px;border:1px solid var(--line);border-radius:999px;padding:3px 8px;color:#bdc8e3}
.owned{color:var(--cyan)}.empty{color:var(--muted);padding:30px 0}
body[data-view="health"] .discover,body[data-view="owned"] .discover{display:none}
.health-head h2{font-size:clamp(32px,4vw,44px);margin:.1em 0 .2em;letter-spacing:-.04em}
.health-head .lead{margin:0 0 22px}
.tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) minmax(280px,1.25fr);gap:12px;margin:18px 0}
.tile,.hero-metric{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 18px}
.tile .ico{font-size:16px;opacity:.85}
.tile b{font-size:28px;display:block;margin-top:4px;letter-spacing:-.03em}
.hero-metric{display:flex;flex-direction:column;justify-content:center}
.hero-metric b{font-size:44px;color:var(--cyan);line-height:1}
.bar{height:8px;border-radius:99px;background:#1b2440;overflow:hidden;margin:10px 0}
.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--cyan),#4ea2ff)}
.cols{display:grid;grid-template-columns:minmax(280px,.9fr) 1.2fr;gap:14px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 18px;overflow-x:auto}
.panel h3{margin:0 0 12px;font-size:15px}
.issue{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #24304d}
.issue:last-child{border-bottom:0}
.badge{border:1px solid var(--line);border-radius:999px;padding:2px 8px;font-size:11px;color:var(--muted)}
.badge.warn{color:var(--warn);border-color:#6b5428}.badge.ok{color:var(--ok);border-color:#2d6a55}
.badge.violet{color:var(--violet);border-color:#5b4d8c}.badge.danger{color:var(--danger);border-color:#7f3140}
.agent{margin-top:14px}.agent:first-child{margin-top:0}
.agent h4{margin:0 0 8px;font-size:13px;color:var(--muted);font-weight:650}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;align-items:end}
.filters label{display:flex;flex-direction:column;gap:4px;color:var(--muted);font-size:11px;font-weight:650}
.filters select,.filters input{background:#0d1428;color:var(--text);border:1px solid var(--line);border-radius:10px;padding:7px 8px;font-size:12px;min-width:108px}
.filters input{min-width:88px}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:var(--muted);font-weight:600;padding:6px 8px}td{padding:8px;border-top:1px solid #22304c;vertical-align:top}
.path{color:var(--muted);font:11px ui-monospace,SFMono-Regular,monospace;word-break:break-all}
.foot{color:var(--muted);margin-top:16px;font-size:13px}
button.ghost{background:transparent;color:var(--text);border:1px solid var(--line);padding:5px 9px;font-size:11px;font-weight:650;border-radius:9px}
.acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
@media(max-width:900px){.hero,.tiles,.cols{grid-template-columns:1fr}.top{flex-direction:column;align-items:flex-start}.top-actions{width:100%;justify-content:flex-start}.metric{display:none}table{font-size:12px}th,td{padding:6px}}
</style>
${headScript()}
</head>
<body data-view="search">
<header class="top"><div class="eyebrow" id="eyebrow">${escapeHtml(en['chrome.eyebrow'])}</div>
<div class="top-actions">
<nav class="tabs" id="views" aria-label="${escapeHtml(en['nav.views'])}">
<button type="button" class="active" data-view="search">${escapeHtml(en['tab.discover'])}</button>
<button type="button" data-view="owned">${escapeHtml(en['tab.owned'])}</button>
<button type="button" data-view="health">${escapeHtml(en['tab.health'])}</button>
</nav>
<div class="lang" id="lang" role="group" aria-label="${escapeHtml(en['lang.label'])}">
<button type="button" data-locale="zh" lang="zh-CN" aria-pressed="false">中文</button>
<i aria-hidden="true">|</i>
<button type="button" data-locale="en" lang="en" aria-pressed="true">English</button>
</div>
</div></header>
<main class="shell">
<section class="discover">
<div class="hero"><div>
<h1 id="hero-title">${escapeHtml(en['hero.line1'])}<br>${escapeHtml(en['hero.line2'])}</h1>
<p class="lead" id="hero-lead">${escapeHtml(en['hero.lead'])}</p>
</div>
<div class="metric" id="hero-metric"><div class="meta">${escapeHtml(en['hero.score'])}</div><b>—</b><div>${escapeHtml(en['hero.unknown'])}</div></div>
</div>
<form id="search"><input id="q" autofocus placeholder="${escapeHtml(en['search.placeholder'])}" value="review GitHub PR security"><button type="submit" id="search-btn">${escapeHtml(en['search.submit'])}</button></form>
</section>
<section id="results" class="grid"></section>
</main>
<script>
${clientSource}
</script>
</body></html>`;

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, {'content-type': type, 'cache-control': 'no-store'});
  response.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function body(request) {
  let value = '';
  for await (const chunk of request) {
    value += chunk;
    if (value.length > 1_000_000) throw new Error('Request body too large');
  }
  return value ? JSON.parse(value) : {};
}

export function createWebServer(options = {}) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/') return send(response, 200, page, 'text/html; charset=utf-8');
      if (request.method === 'GET' && url.pathname === '/api/search') return send(response, 200, await searchCapabilities(url.searchParams.get('q') ?? '', options));
      if (request.method === 'GET' && url.pathname === '/api/inspect') {
        const filters = parseInspectFilters({
          agent: url.searchParams.get('agent'),
          scope: url.searchParams.get('scope'),
          type: url.searchParams.get('type'),
          status: url.searchParams.get('status'),
          source: url.searchParams.get('source'),
          costMin: url.searchParams.get('cost-min') ?? url.searchParams.get('costMin'),
          costMax: url.searchParams.get('cost-max') ?? url.searchParams.get('costMax'),
          reason: url.searchParams.get('reason')
        });
        return send(response, 200, await inspectLocal({...options, filters}));
      }
      if (request.method === 'GET' && url.pathname === '/api/state') return send(response, 200, await loadState(options));
      if (request.method === 'POST' && url.pathname === '/api/add') {
        const input = await body(request);
        return send(response, 201, await addCapability(input.capability_id, input.provider_id, options));
      }
      if (request.method === 'POST' && url.pathname === '/api/pin') {
        const input = await body(request);
        return send(response, 200, await pinProvider(input.provider ?? input.name ?? input.provider_id, options));
      }
      if (request.method === 'POST' && url.pathname === '/api/unpin') {
        const input = await body(request);
        return send(response, 200, await unpinProvider(input.provider ?? input.name ?? input.provider_id, options));
      }
      if (request.method === 'POST' && url.pathname === '/api/exclude') {
        const input = await body(request);
        return send(response, 200, await excludeProvider(input.provider ?? input.name ?? input.provider_id, options));
      }
      if (request.method === 'POST' && url.pathname === '/api/include') {
        const input = await body(request);
        return send(response, 200, await includeProvider(input.provider ?? input.name ?? input.provider_id, options));
      }
      if (request.method === 'POST' && url.pathname === '/api/try') {
        const input = await body(request);
        return send(response, 200, await tryCapability(input.capability_id, input.input ?? {}, {...options, provider: input.provider_id ?? input.provider}));
      }
      if (request.method === 'POST' && url.pathname === '/api/cleanup') {
        const input = await body(request);
        return send(response, 200, await cleanupTrial(input.capability_id, options));
      }
      return send(response, 404, {error: 'Not found'});
    } catch (error) {
      return send(response, 400, {error: error.message});
    }
  });
}

export async function startWebServer(options = {}) {
  const server = createWebServer(options);
  const port = Number(options.port ?? process.env.PORT ?? DEFAULT_WEB_PORT);
  const host = options.host ?? DEFAULT_WEB_HOST;
  await new Promise((resolve, reject) => server.listen(port, host, resolve).once('error', reject));
  return {server, url: `http://${host}:${port}`};
}
