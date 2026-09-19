/** Local Discover UI and thin JSON HTTP APIs. */
import http from 'node:http';
import { searchCapabilities } from './search.js';
import { inspectLocal } from './inspector.js';
import { addCapability, loadState } from './registry.js';

export const DEFAULT_WEB_HOST = '127.0.0.1';
export const DEFAULT_WEB_PORT = 4173;
export const DEFAULT_WEB_URL = `http://${DEFAULT_WEB_HOST}:${DEFAULT_WEB_PORT}`;

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
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:var(--muted);font-weight:600;padding:6px 8px}td{padding:8px;border-top:1px solid #22304c;vertical-align:top}
.path{color:var(--muted);font:11px ui-monospace,SFMono-Regular,monospace;word-break:break-all}
.foot{color:var(--muted);margin-top:16px;font-size:13px}
@media(max-width:900px){.hero,.tiles,.cols{grid-template-columns:1fr}.top{flex-direction:column;align-items:flex-start}.metric{display:none}table{font-size:12px}th,td{padding:6px}}
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
const statusChip=s=>s==='managed'||s==='cap'?'ok':s==='estimated'?'violet':'';
async function search(){results.className='grid';results.innerHTML='<div class="empty">Searching…</div>';const r=await fetch('/api/search?q='+encodeURIComponent(q.value));const d=await r.json();render(d)}
function render(items){results.innerHTML=items.length?items.map(x=>'<article class="card"><div><div class="id">'+esc(x.capability_id)+'</div><h3>'+esc(x.name)+(x.installed?' <span class="owned">· Managed</span>':'')+'</h3><p class="summary">'+esc(x.summary)+'</p><div class="chips">'+x.providers.map(p=>'<span class="chip">'+esc(p.name)+' · '+esc(p.status)+'</span>').join('')+'<span class="chip">'+esc(x.risk)+' risk</span><span class="chip">~'+esc(x.context_cost)+' tokens</span></div></div>'+(x.installed?'':'<button onclick="add(\\''+x.capability_id+'\\')">添加</button>')+'</article>').join(''):'<div class="empty">没有匹配结果。试试描述目标、对象和动作。</div>'}
async function add(id){await fetch('/api/add',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({capability_id:id})});await search()}
async function owned(){results.className='grid';const r=await fetch('/api/state'),d=await r.json();const cards=d.managed_capabilities.length?d.managed_capabilities.map(x=>'<article class="card"><div><div class="id">CAP MANAGED</div><h3>'+esc(x)+'</h3></div></article>').join(''):'<div class="empty">还没有 CAP Managed 能力。</div>';results.innerHTML='<section class="health-head"><h2>My Capabilities</h2><p class="lead">已登记到 CAP Registry 的 Capability。Agent 通过 cap.use 调用，而不是直接暴露全部工具。</p></section>'+cards}
function shortPath(file){if(!file)return '';const parts=String(file).replace(/\\\\/g,'/').split('/').filter(Boolean);if(parts[0]==='home'||parts[0]==='Users')return '~/'+parts.slice(2).join('/');return parts.slice(-2).join('/');}
async function hydrateHero(){try{const d=await (await fetch('/api/inspect')).json();const p=d.pressure||{},s=d.summary||{};document.querySelector('#hero-metric').innerHTML='<div class="meta">健康分数</div><b>'+esc(p.healthScore??'—')+'</b><div>'+(p.band==='unknown'?'无法计算':('常驻占用 '+esc(p.percent)+'%'))+' · '+tok(s.contextTokens)+' 常驻 · '+tok(s.reclaimableTokens)+' 可回收</div>'}catch{}}
async function health(){results.className='';const d=await (await fetch('/api/inspect')).json();const s=d.summary||{},p=d.pressure||{},b=d.budget||{};
const dups=(d.duplicates||[]).map(x=>'<div class="issue"><div><strong>'+esc(x.name)+'</strong><div class="path">'+esc((x.sources||[]).map(shortPath).join(' + '))+'</div></div><span class="badge">重复</span></div>').join('')||'<div class="empty">没有重复项。</div>';
const moves=(d.recommendations||[]).map((x,i)=>'<div class="issue"><div><strong>'+(i+1)+'. '+esc(x.provider)+'</strong><div class="path">'+esc(shortPath(x.source))+'</div></div><div><span class="badge">约可回收 '+tok(x.estimatedTokensSaved)+'</span> <span class="badge ok">迁到 CAP</span></div></div>').join('')||'<div class="empty">没有需要迁走的第三方 MCP。</div>';
const groups={};for(const item of (d.items||[]).filter(x=>x.kind!=='warning'))(groups[item.agent]??=[]).push(item);
const statusLabel=x=>x.status==='managed'?'CAP-managed':x.status==='cap'||x.capSurface?'CAP Surface':x.status==='estimated'?'Direct Exposure（估算）':'Direct Exposure';
const inventory=Object.entries(groups).map(([agent,rows])=>'<div class="agent"><h4>'+esc(agent)+' · '+rows.length+' 项</h4><table><thead><tr><th>类型</th><th>名称 / 路径</th><th>角色</th><th>工具</th><th>常驻占用</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+(x.kind==='skill'?'Skill':'MCP')+'</td><td>'+esc(x.name)+'<div class="path">'+esc(shortPath(x.source))+'</div></td><td><span class="badge '+statusChip(x.status)+'">'+esc(statusLabel(x))+'</span></td><td>'+(x.kind==='skill'?'—':(x.toolCountEstimated?'约 ':'')+x.toolCount)+'</td><td>'+tok(x.contextTokens)+(x.cost&&x.cost.instructionOnDemand?' · 正文 '+Math.round(Number(x.cost.instructionTokens)||0)+' 按需':'')+(x.cost&&x.cost.value!=null?' · value '+x.cost.value:'')+'</td></tr>').join('')+'</tbody></table></div>').join('')||'<div class="empty">未发现本地 MCP / Skills。</div>';
const pf=d.profiler||{};
const ranked=(pf.ranked||[]).map((x,i)=>'<div class="issue"><div><strong>'+(i+1)+'. '+esc(x.capability_id)+'</strong><div class="path">value '+esc(x.value)+' · vpc '+esc(x.valuePerCost)+' · '+esc(x.successes)+' uses / '+esc(x.sessions)+' sessions</div></div><span class="badge ok">~'+esc(x.contextCost)+' tok</span></div>').join('')||'<div class="empty">还没有成功的 use 记录。先 cap add，再 cap use。</div>';
const underused=(pf.underused||[]).map(x=>'<div class="issue"><div><strong>'+esc(x.capability_id)+'</strong><div class="path">'+(x.successes?'value '+esc(x.value)+' · vpc '+esc(x.valuePerCost):'未使用')+'</div></div><span class="badge warn">~'+esc(x.contextCost)+' tok</span></div>').join('')||'<div class="empty">没有明显未使用或低性价比能力。</div>';
const profilerPanel=pf.tracked?'<section class="panel" style="margin-top:14px"><h3>价值分析</h3><div class="meta">跟踪 '+esc(pf.tracked)+' · 用过 '+esc(pf.used)+' · 未使用 '+esc(pf.unusedManaged)+' · use '+esc(pf.useAttempts)+'</div>'+(pf.frequencyVerdicts===false?'<div class="meta">频率结论未就绪 · 搜索/选择已记录 · Observation Period 未完成</div>':'')+'<div class="meta" style="margin-top:12px">性价比排行</div>'+ranked+'<div class="meta" style="margin-top:12px">价值信号</div>'+underused+'</section>':'';
results.innerHTML='<section class="health-head"><h2>Capability Health</h2><p class="lead">只读本地配置，不连接 MCP。分数高 = 常驻占用低。用最小能力集，换最大有效上下文。</p></section><div class="tiles"><div class="tile"><div class="ico">⬡</div><div class="meta">MCP</div><b>'+s.mcpServers+'</b></div><div class="tile"><div class="ico">▦</div><div class="meta">Skills</div><b>'+s.skills+'</b></div><div class="tile"><div class="ico">⚒</div><div class="meta">Direct Exposure 工具</div><b>'+s.directTools+'</b></div><div class="tile"><div class="ico">▤</div><div class="meta">常驻占用</div><b>'+tok(s.contextTokens)+'</b></div><div class="hero-metric"><b>'+esc(p.healthScore??'—')+'</b><div>健康分数</div><div class="bar"><i style="width:'+Math.min(100,Number(p.percent)||0)+'%"></i></div><div class="meta">常驻占用了有效预算的 '+esc(p.percent)+'% · 有效预算 '+tok(b.effectiveBudget)+' / 标称 '+tok(b.nominalWindow)+'</div><div class="chips" style="margin-top:8px"><span class="badge '+bandClass(p.band)+'">压力 '+esc(p.band)+' '+esc(p.percent)+'%</span><span class="badge warn">⚠ '+(s.warnings||0)+' 警告</span><span class="badge violet">'+(s.duplicateGroups||0)+' 重复</span><span class="badge ok">CAP-managed MCP '+(s.managed||0)+' · 已 add '+(s.registryCapabilities||0)+'</span></div></div></div><div class="cols" style="margin-top:16px"><section class="panel"><h3>问题与建议</h3><div class="meta">重复项 <span class="badge">'+(d.duplicates||[]).length+'</span></div>'+dups+'<div class="meta" style="margin-top:14px">迁移建议</div>'+moves+'<p class="foot">先处理重复项，再把 Direct Exposure MCP 迁到 CAP。确认应用后写入 .cap-backup，按文档复制回去恢复，不是一键 Restore。</p></section><section class="panel"><h3>清单</h3>'+inventory+profilerPanel+'</section></div><p class="foot">只读本地配置，不会连接 MCP，也不是当前会话实测。下一步：<code>cap search</code> 然后 <code>cap use</code>（未托管会先 Acquisition） · 或 <code>cap optimize</code>（仅预览）</p>';
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
  const port = Number(options.port ?? process.env.PORT ?? DEFAULT_WEB_PORT);
  const host = options.host ?? DEFAULT_WEB_HOST;
  await new Promise((resolve, reject) => server.listen(port, host, resolve).once('error', reject));
  return {server, url: `http://${host}:${port}`};
}
