/** Local Discover UI and thin JSON HTTP APIs. */
import http from 'node:http';
import { searchCapabilities } from './search.js';
import { inspectLocal } from './inspector.js';
import { addCapability, loadState } from './registry.js';

const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CAP · Capability Search</title>
<style>
:root{color-scheme:dark;--bg:#0b1020;--panel:#121a2f;--line:#29334f;--text:#edf2ff;--muted:#98a5c2;--cyan:#65e6d3;--violet:#a58bfa}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,#20204c 0,transparent 35%),var(--bg);color:var(--text);font:15px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif}.shell{max-width:1060px;margin:auto;padding:64px 24px}.eyebrow{color:var(--cyan);letter-spacing:.14em;text-transform:uppercase;font-size:12px}.hero{display:grid;grid-template-columns:1.5fr 1fr;gap:48px;align-items:end}h1{font-size:clamp(42px,7vw,76px);line-height:1;margin:.15em 0;letter-spacing:-.055em}.lead{color:var(--muted);font-size:18px;max-width:680px}.metric{background:#ffffff0a;border:1px solid var(--line);border-radius:18px;padding:22px}.metric b{font-size:32px;color:var(--cyan)}form{display:flex;gap:10px;margin:42px 0 22px}input{flex:1;background:#0d1428;color:var(--text);border:1px solid var(--line);border-radius:14px;padding:16px 18px;font-size:16px;outline:none}input:focus{border-color:var(--violet);box-shadow:0 0 0 3px #a58bfa22}button{border:0;border-radius:12px;padding:13px 18px;background:var(--cyan);color:#071411;font-weight:750;cursor:pointer}.tabs{display:flex;gap:8px;margin-bottom:18px}.tabs button{background:transparent;color:var(--muted);border:1px solid var(--line)}.tabs button.active{color:var(--text);border-color:var(--violet)}.grid{display:grid;gap:14px}.card{background:linear-gradient(145deg,#151e36,#10172a);border:1px solid var(--line);border-radius:16px;padding:20px;display:grid;grid-template-columns:1fr auto;gap:12px}.card h3{margin:0;font-size:19px}.id,.meta{color:var(--muted);font:12px ui-monospace,SFMono-Regular,monospace}.summary{margin:8px 0}.chips{display:flex;flex-wrap:wrap;gap:7px}.chip{font-size:12px;border:1px solid var(--line);border-radius:999px;padding:3px 8px;color:#bdc8e3}.owned{color:var(--cyan)}.empty{color:var(--muted);padding:30px 0}@media(max-width:720px){.hero{grid-template-columns:1fr}.metric{display:none}.card{grid-template-columns:1fr}form{flex-direction:column}}
</style></head><body><main class="shell"><section class="hero"><div><div class="eyebrow">Agent Capability Layer</div><h1>Install more.<br>Expose less.</h1><p class="lead">按你想完成的任务搜索能力。CAP 把 Provider 收拢到统一入口，让 Agent 只看到 Search、Add、Use。</p></div><div class="metric"><div class="meta">AGENT VISIBLE SURFACE</div><b>3</b><div>CAP entry tools</div></div></section>
<form id="search"><input id="q" autofocus placeholder="例如：分析 PostgreSQL 慢查询" value="review GitHub PR security"><button>搜索能力</button></form><div class="tabs"><button class="active" data-view="search">Discover</button><button data-view="owned">My Capabilities</button><button data-view="health">Health</button></div><section id="results" class="grid"><div class="empty">输入一个真实任务，CAP 会优先返回 Capability，再展示 Provider。</div></section></main>
<script>
const results=document.querySelector('#results'),q=document.querySelector('#q');let view='search';
const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function search(){results.innerHTML='<div class="empty">Searching…</div>';const r=await fetch('/api/search?q='+encodeURIComponent(q.value));const d=await r.json();render(d)}
function render(items){results.innerHTML=items.length?items.map(x=>'<article class="card"><div><div class="id">'+esc(x.capability_id)+'</div><h3>'+esc(x.name)+(x.installed?' <span class="owned">· Managed</span>':'')+'</h3><p class="summary">'+esc(x.summary)+'</p><div class="chips">'+x.providers.map(p=>'<span class="chip">'+esc(p.name)+' · '+esc(p.status)+'</span>').join('')+'<span class="chip">'+esc(x.risk)+' risk</span><span class="chip">~'+esc(x.context_cost)+' tokens</span></div></div>'+(x.installed?'':'<button onclick="add(\''+x.capability_id+'\')">添加</button>')+'</article>').join(''):'<div class="empty">没有匹配结果。试试描述目标、对象和动作。</div>'}
async function add(id){await fetch('/api/add',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({capability_id:id})});await search()}
async function owned(){const r=await fetch('/api/state'),d=await r.json();results.innerHTML=d.managed_capabilities.length?d.managed_capabilities.map(x=>'<article class="card"><div><div class="id">CAP MANAGED</div><h3>'+esc(x)+'</h3></div></article>').join(''):'<div class="empty">还没有 CAP Managed 能力。</div>'}
async function health(){const r=await fetch('/api/inspect'),d=await r.json(),s=d.summary;results.innerHTML='<article class="card"><div><div class="id">CAPABILITY HEALTH</div><h3>'+s.directTools+' directly exposed tools → '+(s.directTools?3:0)+' CAP entry tools</h3><p class="summary">Estimated schema '+s.contextTokens+' tokens · reduction '+s.estimatedReductionPercent+'% · '+s.duplicateGroups+' duplicate groups</p></div></article>'}
document.querySelector('#search').addEventListener('submit',e=>{e.preventDefault();view='search';search()});document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');view=b.dataset.view;({search,owned,health}[view])()});search();
</script></body></html>`;

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
      if (request.method === 'GET' && url.pathname === '/api/inspect') return send(response, 200, await inspectLocal(options));
      if (request.method === 'GET' && url.pathname === '/api/state') return send(response, 200, await loadState(options));
      if (request.method === 'POST' && url.pathname === '/api/add') {
        const input = await body(request);
        return send(response, 201, await addCapability(input.capability_id, input.provider_id, options));
      }
      return send(response, 404, {error: 'Not found'});
    } catch (error) {
      return send(response, 400, {error: error.message});
    }
  });
}

export async function startWebServer(options = {}) {
  const server = createWebServer(options);
  const port = Number(options.port ?? process.env.PORT ?? 4173);
  const host = options.host ?? '127.0.0.1';
  await new Promise((resolve, reject) => server.listen(port, host, resolve).once('error', reject));
  return {server, url: `http://${host}:${port}`};
}
