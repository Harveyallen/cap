/** Local Discover UI and thin JSON HTTP APIs. */
import http from 'node:http';
import { searchCapabilities } from './search.js';
import { inspectLocal } from './inspector.js';
import { addCapability, loadState } from './registry.js';

const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CAP · Capability Health</title>
<style>
:root{color-scheme:dark;--bg:#070b16;--panel:#10182c;--line:#2a3554;--text:#edf2ff;--muted:#98a5c2;--cyan:#65e6d3;--violet:#a58bfa;--warn:#f5c36a;--ok:#6ee7b7;--danger:#fb7185}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 86% 0,#1c2150 0,transparent 38%),var(--bg);color:var(--text);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,sans-serif}
.top{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:22px 28px 0;max-width:1180px;margin:auto}
.eyebrow{color:var(--cyan);letter-spacing:.16em;text-transform:uppercase;font-size:11px}
.tabs{display:flex;gap:8px}.tabs button{background:transparent;color:var(--muted);border:1px solid var(--line);border-radius:12px;padding:9px 14px;cursor:pointer;font-weight:650}
.tabs button.active{color:var(--text);border-color:var(--violet);background:#a58bfa14}
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
body[data-view="health"] .discover,body[data-view="owned"] form{display:none}
.health-head h2{font-size:clamp(32px,4vw,44px);margin:.1em 0 .2em;letter-spacing:-.04em}
.health-head .lead{margin:0 0 22px}
.tiles{display:grid;grid-template-columns:repeat(4,1fr) minmax(260px,1.2fr);gap:12px;margin:18px 0}
.tile,.hero-metric{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 18px}
.tile b{font-size:28px;display:block;margin-top:6px}
.hero-metric{display:flex;flex-direction:column;justify-content:center}
.hero-metric b{font-size:42px;color:var(--cyan);line-height:1}
.bar{height:8px;border-radius:99px;background:#1b2440;overflow:hidden;margin:10px 0}
.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--cyan),#4ea2ff)}
.funnel{color:var(--muted);font-size:13px;margin:4px 0 16px}
.cols{display:grid;grid-template-columns:minmax(280px,.9fr) 1.2fr;gap:14px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 18px}
.panel h3{margin:0 0 12px;font-size:15px}
.issue{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #24304d}
.issue:last-child{border-bottom:0}
.badge{border:1px solid var(--line);border-radius:999px;padding:2px 8px;font-size:11px;color:var(--muted)}
.badge.warn{color:var(--warn);border-color:#6b5428}.badge.ok{color:var(--ok);border-color:#2d6a55}
.badge.violet{color:var(--violet);border-color:#5b4d8c}.badge.danger{color:var(--danger);border-color:#7f3140}
.agent{margin-top:14px}.agent:first-child{margin-top:0}
.agent h4{margin:0 0 8px;font-size:13px;color:var(--muted);font-weight:650}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:var(--muted);font-weight:600;padding:6px 8px}td{padding:8px;border-top:1px solid #22304c;vertical-align:top}
.path{color:var(--muted);font:11px ui-monospace,SFMono-Regular,monospace}
.foot{color:var(--muted);margin-top:16px;font-size:13px}
@media(max-width:900px){.hero,.tiles,.cols{grid-template-columns:1fr}.top{flex-direction:column;align-items:flex-start}.metric{display:none}}
</style></head>
<body data-view="search">
<header class="top"><div class="eyebrow">Agent Capability Layer</div>
<nav class="tabs">
<button class="active" data-view="search">Discover</button>
<button data-view="owned">My Capabilities</button>
<button data-view="health">Health</button>
</nav></header>
<main class="shell">
<section class="discover">
<div class="hero"><div>
<h1>Install more.<br>Expose less.</h1>
<p class="lead">按你想完成的任务搜索能力。CAP 管理 Capability 及其上下文占用——用最小能力集，换最大有效上下文。Agent 只看到 Search、Add、Use。</p>
</div>
<div class="metric" id="hero-metric"><div class="meta">CONTEXT HEALTH</div><b>3</b><div>CAP entry tools</div></div>
</div>
<form id="search"><input id="q" autofocus placeholder="例如：分析 PostgreSQL 慢查询" value="review GitHub PR security"><button>搜索能力</button></form>
</section>
<section id="results" class="grid"><div class="empty">输入一个真实任务，CAP 会优先返回 Capability，再展示 Provider。</div></section>
</main>
<script>
const results=document.querySelector('#results'),q=document.querySelector('#q');let view='search';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const tok=n=>{n=Math.round(Number(n)||0);return n>=1000?'~'+(n/1000).toFixed(1).replace(/\\.0$/,'')+'k':'~'+n};
const bandClass=b=>({healthy:'ok',moderate:'warn',high:'warn',critical:'danger',emergency:'danger'}[b]||'');
const statusChip=s=>s==='managed'?'ok':s==='estimated'?'violet':'';
async function search(){results.className='grid';results.innerHTML='<div class="empty">Searching…</div>';const r=await fetch('/api/search?q='+encodeURIComponent(q.value));const d=await r.json();render(d)}
function render(items){results.innerHTML=items.length?items.map(x=>'<article class="card"><div><div class="id">'+esc(x.capability_id)+'</div><h3>'+esc(x.name)+(x.installed?' <span class="owned">· Managed</span>':'')+'</h3><p class="summary">'+esc(x.summary)+'</p><div class="chips">'+x.providers.map(p=>'<span class="chip">'+esc(p.name)+' · '+esc(p.status)+'</span>').join('')+'<span class="chip">'+esc(x.risk)+' risk</span><span class="chip">~'+esc(x.context_cost)+' tokens</span></div></div>'+(x.installed?'':'<button onclick="add(\\''+x.capability_id+'\\')">添加</button>')+'</article>').join(''):'<div class="empty">没有匹配结果。试试描述目标、对象和动作。</div>'}
async function add(id){await fetch('/api/add',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({capability_id:id})});await search()}
async function owned(){results.className='grid';const r=await fetch('/api/state'),d=await r.json();results.innerHTML=d.managed_capabilities.length?d.managed_capabilities.map(x=>'<article class="card"><div><div class="id">CAP MANAGED</div><h3>'+esc(x)+'</h3></div></article>').join(''):'<div class="empty">还没有 CAP Managed 能力。</div>'}
function shortPath(file){if(!file)return '';const home=file.match(/^\\/Users\\/[^/]+/)||file.match(/^\\/home\\/[^/]+/);return home?file.replace(home[0],'~'):file}
async function hydrateHero(){try{const d=await (await fetch('/api/inspect')).json();const p=d.pressure||{},s=d.summary||{};document.querySelector('#hero-metric').innerHTML='<div class="meta">CONTEXT HEALTH</div><b>'+esc(p.healthScore??'—')+'</b><div>'+esc(p.band||'n/a')+' · '+tok(s.contextTokens)+' 占用 · '+tok(s.reclaimableTokens)+' 可回收</div><div class="meta" style="margin-top:8px">3 CAP entry tools</div>'}catch{}}
async function health(){results.className='';const d=await (await fetch('/api/inspect')).json();const s=d.summary||{},p=d.pressure||{},b=d.budget||{},f=d.funnel||{};
const used=f.usedUnknown||f.used==null?'used unknown':f.used+' used';
const dups=(d.duplicates||[]).map(x=>'<div class="issue"><div><strong>'+esc(x.name)+'</strong><div class="path">'+esc((x.sources||[]).map(shortPath).join(' + '))+'</div></div><span class="badge">Duplicate</span></div>').join('')||'<div class="empty">没有重复项。</div>';
const moves=(d.recommendations||[]).map((x,i)=>'<div class="issue"><div><strong>'+(i+1)+'. '+esc(x.provider)+'</strong><div class="path">'+esc(shortPath(x.source))+'</div></div><div><span class="badge">'+tok(x.estimatedTokensSaved)+'</span> <span class="badge ok">Move → CAP</span></div></div>').join('')||'<div class="empty">暂无迁移建议。</div>';
const groups={};for(const item of (d.items||[]).filter(x=>x.kind!=='warning'))(groups[item.agent]??=[]).push(item);
const inventory=Object.entries(groups).map(([agent,rows])=>'<div class="agent"><h4>'+esc(agent)+' · '+rows.length+' items</h4><table><thead><tr><th>Type</th><th>Item / Path</th><th>Status</th><th>Tools</th><th>Tokens</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+(x.kind==='skill'?'Skill':'MCP')+'</td><td>'+esc(x.name)+'<div class="path">'+esc(shortPath(x.source))+'</div></td><td><span class="badge '+statusChip(x.status)+'">'+esc(x.status==='managed'?'Managed':x.status==='estimated'?'~est':'Direct')+'</span></td><td>'+(x.kind==='skill'?'—':x.toolCount)+'</td><td>'+tok(x.contextTokens)+'</td></tr>').join('')+'</tbody></table></div>').join('')||'<div class="empty">未发现本地 MCP / Skills。</div>';
results.innerHTML='<section class="health-head"><h2>Capability Health</h2><p class="lead">Inspect 本地 MCP & Skills · 用最小能力集，换最大有效上下文。</p></section><div class="tiles"><div class="tile"><div class="meta">MCP</div><b>'+s.mcpServers+'</b></div><div class="tile"><div class="meta">Skills</div><b>'+s.skills+'</b></div><div class="tile"><div class="meta">Direct Tools</div><b>'+s.directTools+'</b></div><div class="tile"><div class="meta">Schema tokens</div><b>'+tok(s.contextTokens)+'</b></div><div class="hero-metric"><b>'+(s.directTools?s.capEntryTools:0)+'</b><div>CAP entry tools</div><div class="bar"><i style="width:'+(s.estimatedReductionPercent||0)+'%"></i></div><div class="meta">−'+(s.estimatedReductionPercent||0)+'% · health '+esc(p.healthScore)+' · '+esc(p.band)+' '+esc(p.percent)+'%</div><div class="chips" style="margin-top:8px"><span class="badge '+bandClass(p.band)+'">Pressure '+esc(p.band)+'</span><span class="badge warn">⚠ '+(s.warnings||0)+' warnings</span><span class="badge violet">'+(s.duplicateGroups||0)+' duplicates</span><span class="badge ok">'+(s.managed||0)+' managed</span></div></div></div><p class="funnel">Funnel '+(f.installed||0)+' installed → '+(f.enabled||0)+' enabled → '+(f.injected||0)+' injected → '+used+' · effective '+tok(b.effectiveBudget)+' / nominal '+tok(b.nominalWindow)+'</p><div class="cols"><section class="panel"><h3>问题与建议 Issues & recommendations</h3><div class="meta">Duplicates</div>'+dups+'<div class="meta" style="margin-top:14px">Suggested moves</div>'+moves+'<p class="foot">先处理重复项，再把高占用 MCP 迁到 CAP。</p></section><section class="panel"><h3>按 Agent 清单</h3>'+inventory+'</section></div><p class="foot">下一步：<code>cap optimize</code> · 或在 Discover 搜索任务</p>';
}
document.querySelector('#search').addEventListener('submit',e=>{e.preventDefault();view='search';search()});
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');view=b.dataset.view;document.body.dataset.view=view;({search,owned,health}[view])()});
hydrateHero();search();
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
