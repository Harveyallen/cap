const boot = globalThis.__CAP_WEB_BOOT__;
const MESSAGES = boot.messages;
const LOCALE_KEY = boot.localeKey;
const resolveLocale = boot.resolveLocale;
const htmlLang = boot.htmlLang;

const results = document.querySelector('#results');
const q = document.querySelector('#q');
let view = 'search';
let locale = 'en';
let lastSearch = null;
let lastState = null;
let lastHealth = null;
let heroReport = null;
let searchSeq = 0;
let searchPending = false;
let ownedSeq = 0;
let healthSeq = 0;
let healthQuery = {agent: '', scope: '', type: '', status: '', source: '', costMin: '', costMax: '', reason: ''};

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
}

function t(key, vars) {
  const table = MESSAGES[locale] || MESSAGES.en || {};
  let text = table[key] || (MESSAGES.en && MESSAGES.en[key]) || (MESSAGES.zh && MESSAGES.zh[key]) || key;
  if (!vars) return text;
  for (const name of Object.keys(vars)) text = text.split('{' + name + '}').join(String(vars[name] ?? ''));
  return text;
}

function tx(key, vars) {
  const safe = {};
  if (vars) for (const name of Object.keys(vars)) safe[name] = esc(vars[name]);
  return t(key, safe);
}

function tok(n) {
  n = Math.round(Number(n) || 0);
  if (n < 1000) return '~' + n;
  const text = (n / 1000).toFixed(1);
  return '~' + (text.endsWith('.0') ? text.slice(0, -2) : text) + 'k';
}

function readStoredLocale() {
  try { return localStorage.getItem(LOCALE_KEY); } catch { return null; }
}

function writeStoredLocale(value) {
  try { localStorage.setItem(LOCALE_KEY, value); } catch { /* private mode */ }
}

function riskLevel(risk) {
  const key = 'risk.' + String(risk ?? '').toLowerCase();
  const table = MESSAGES[locale] || {};
  if (table[key]) return table[key];
  if (MESSAGES.en && MESSAGES.en[key]) return MESSAGES.en[key];
  return String(risk ?? '');
}

function bandPhrase(band) {
  const key = 'band.' + (band || 'unknown');
  const phrase = t(key);
  return phrase === key ? String(band || '') : phrase;
}

function shortPath(file) {
  if (!file) return '';
  const parts = String(file).split('\\').join('/').split('/').filter(Boolean);
  if (parts[0] === 'home' || parts[0] === 'Users') return '~/' + parts.slice(2).join('/');
  return parts.slice(-2).join('/');
}

function optionList(values, current, translate) {
  const options = ['<option value="">' + esc(t('filter.all')) + '</option>'];
  for (const value of values) {
    const selected = String(value) === String(current) ? ' selected' : '';
    const label = translate ? t('opt.' + value) : value;
    options.push('<option' + selected + ' value="' + esc(value) + '">' + esc(label) + '</option>');
  }
  return options.join('');
}

function statusLabel(item) {
  const base = item.status === 'managed' ? t('role.managed')
    : (item.status === 'cap' || item.capSurface) ? t('role.surface')
    : item.status === 'estimated' ? t('role.estimated')
    : t('role.direct');
  const marks = [item.pinned ? t('role.pinned') : '', item.excluded ? t('role.excluded') : ''].filter(Boolean);
  return marks.length ? base + ' · ' + marks.join(' · ') : base;
}

function preferButtons(name, item) {
  if (item && item.capSurface) return '';
  const pin = item && item.pinned ? 'unpin' : 'pin';
  const exclude = item && item.excluded ? 'include' : 'exclude';
  return '<div class="acts"><button type="button" class="ghost" data-act="' + pin + '" data-name="' + esc(name) + '">' + esc(t('act.' + pin)) + '</button><button type="button" class="ghost" data-act="' + exclude + '" data-name="' + esc(name) + '">' + esc(t('act.' + exclude)) + '</button></div>';
}

function applyChrome() {
  document.documentElement.lang = htmlLang(locale);
  document.title = t('meta.title');
  document.querySelector('#eyebrow').textContent = t('chrome.eyebrow');
  document.querySelector('#views [data-view="search"]').textContent = t('tab.discover');
  document.querySelector('#views [data-view="owned"]').textContent = t('tab.owned');
  document.querySelector('#views [data-view="health"]').textContent = t('tab.health');
  document.querySelector('#views').setAttribute('aria-label', t('nav.views'));
  document.querySelector('#hero-title').innerHTML = esc(t('hero.line1')) + '<br>' + esc(t('hero.line2'));
  document.querySelector('#hero-lead').textContent = t('hero.lead');
  document.querySelector('#q').setAttribute('placeholder', t('search.placeholder'));
  document.querySelector('#search-btn').textContent = t('search.submit');
  const group = document.querySelector('#lang');
  group.setAttribute('aria-label', t('lang.label'));
  group.querySelectorAll('[data-locale]').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.locale === locale ? 'true' : 'false');
  });
}

function paintHero(report) {
  const el = document.querySelector('#hero-metric');
  if (!report) {
    el.innerHTML = '<div class="meta">' + esc(t('hero.score')) + '</div><b>—</b><div>' + esc(t('hero.unknown')) + '</div>';
    return;
  }
  const pressure = report.pressure || {};
  const summary = report.summary || {};
  const detail = pressure.band === 'unknown'
    ? t('hero.detailUnknown', {resident: tok(summary.contextTokens), reclaim: tok(summary.reclaimableTokens)})
    : t('hero.detail', {percent: pressure.percent, resident: tok(summary.contextTokens), reclaim: tok(summary.reclaimableTokens)});
  el.innerHTML = '<div class="meta">' + esc(t('hero.score')) + '</div><b>' + esc(pressure.healthScore ?? '—') + '</b><div>' + esc(detail) + '</div>';
}

function render(items) {
  results.className = 'grid';
  if (!items.length) {
    const key = q.value.trim() ? 'search.none' : 'search.hint';
    results.innerHTML = '<div class="empty">' + esc(t(key)) + '</div>';
    return;
  }
  results.innerHTML = items.map((item) => {
    const providers = (item.providers || []).map((provider) => '<span class="chip">' + esc(provider.name) + ' · ' + esc(provider.status) + '</span>').join('');
    const managed = item.installed ? ' <span class="owned">' + esc(t('search.managed')) + '</span>' : '';
    const add = item.installed ? '' : '<button type="button" onclick="add(\'' + item.capability_id + '\')">' + esc(t('search.add')) + '</button>';
    const trial = '<button type="button" class="ghost" onclick="tryCap(\'' + item.capability_id + '\')">' + esc(t('search.try')) + '</button>';
    const risk = '<span class="chip">' + esc(t('search.risk', {level: riskLevel(item.risk)})) + '</span>';
    const tokens = '<span class="chip">' + esc(t('search.tokens', {cost: item.context_cost})) + '</span>';
    return '<article class="card"><div><div class="id">' + esc(item.capability_id) + '</div><h3>' + esc(item.name) + managed + '</h3><p class="summary">' + esc(item.summary) + '</p><div class="chips">' + providers + risk + tokens + '</div></div><div class="acts">' + add + trial + '</div></article>';
  }).join('');
}

async function search() {
  const seq = ++searchSeq;
  searchPending = true;
  results.className = 'grid';
  results.innerHTML = '<div class="empty">' + esc(t('search.loading')) + '</div>';
  const data = await (await fetch('/api/search?q=' + encodeURIComponent(q.value))).json();
  if (seq !== searchSeq) return;
  lastSearch = data;
  searchPending = false;
  if (view === 'search') render(data);
}

async function add(id) {
  await fetch('/api/add', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({capability_id: id})});
  await search();
}

async function tryCap(id) {
  await fetch('/api/try', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({capability_id: id, input: {}})});
  await search();
}

async function cleanupCap(id) {
  await fetch('/api/cleanup', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({capability_id: id})});
  await owned();
}

function renderOwned(state) {
  const trials = new Set((state.trial_bindings || []).map((item) => item.capability_id));
  const ids = state.managed_capabilities || [];
  const cards = ids.length ? ids.map((id) => {
    const trial = trials.has(id) ? ' · ' + esc(t('owned.trial')) : '';
    const cleanup = trials.has(id) ? '<button type="button" class="ghost" onclick="cleanupCap(\'' + id + '\')">' + esc(t('owned.cleanup')) + '</button>' : '';
    return '<article class="card"><div><div class="id">' + esc(t('owned.kicker')) + trial + '</div><h3>' + esc(id) + '</h3></div>' + cleanup + '</article>';
  }).join('') : '<div class="empty">' + esc(t('owned.empty')) + '</div>';
  results.className = 'grid';
  results.innerHTML = '<section class="health-head"><h2>' + esc(t('owned.title')) + '</h2><p class="lead">' + esc(t('owned.lead')) + '</p></section>' + cards;
}

async function owned() {
  const seq = ++ownedSeq;
  const data = await (await fetch('/api/state')).json();
  if (seq !== ownedSeq) return;
  lastState = data;
  if (view === 'owned') renderOwned(data);
}

function healthParams() {
  const params = new URLSearchParams();
  const map = {costMin: 'cost-min', costMax: 'cost-max'};
  for (const [key, value] of Object.entries(healthQuery)) {
    if (value) params.set(map[key] || key, value);
  }
  return params.toString();
}

function bindInventoryActions() {
  if (results.dataset.preferBound) return;
  results.dataset.preferBound = '1';
  results.addEventListener('click', async (event) => {
    const b = event.target.closest('[data-act]');
    if (!b) return;
    await fetch('/api/'+b.dataset.act,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:b.dataset.name})});
    await health();
  });
}

function renderHealth(report) {
  const summary = report.summary || {};
  const pressure = report.pressure || {};
  const budget = report.budget || {};
  const duplicates = (report.duplicates || []).map((item) => {
    const suffix = item.reason === 'cap-surface' ? t('issues.capSurface') : '';
    return '<div class="issue"><div><strong>' + esc(item.name) + '</strong><div class="path">' + esc((item.sources || []).map(shortPath).join(' + ')) + esc(suffix) + '</div></div><span class="badge">' + esc(t('badge.dup')) + '</span></div>';
  }).join('') || '<div class="empty">' + esc(t('issues.noneDup')) + '</div>';
  const overlaps = (report.overlaps || []).map((item) => {
    const path = esc(item.method) + ' ' + esc(item.score) + ' · ' + tx('issues.shared', {tokens: (item.shared || []).join(', ')}) + ' · ' + esc((item.sources || []).map(shortPath).join(' + '));
    return '<div class="issue"><div><strong>' + esc((item.names || []).join(' ≈ ')) + '</strong><div class="path">' + path + '</div></div><span class="badge warn">' + esc(t('badge.overlap')) + '</span></div>';
  }).join('') || '<div class="empty">' + esc(t('issues.noneOverlap')) + '</div>';
  const moves = (report.recommendations || []).map((item, index) => '<div class="issue"><div><strong>' + (index + 1) + '. ' + esc(item.provider) + '</strong><div class="path">' + esc(shortPath(item.source)) + '</div>' + preferButtons(item.provider) + '</div><div><span class="badge">' + esc(t('issues.reclaim', {tokens: tok(item.estimatedTokensSaved)})) + '</span> <span class="badge ok">' + esc(t('issues.move')) + '</span></div></div>').join('') || '<div class="empty">' + esc(t('issues.noneMove')) + '</div>';
  const groups = {};
  for (const item of (report.filtered || report.items || []).filter((row) => row.kind !== 'warning')) (groups[item.agent] ??= []).push(item);
  const inventory = Object.entries(groups).map(([agent, rows]) => {
    const body = rows.map((item) => {
      const kind = item.kind === 'skill' ? t('inv.kind.skill') : t('inv.kind.mcp');
      const tools = item.kind === 'skill' ? esc(t('inv.noneTools')) : (item.toolCountEstimated ? esc(t('inv.approx')) : '') + esc(item.toolCount);
      let cost = tok(item.contextTokens);
      if (item.cost && item.cost.instructionOnDemand) cost += t('inv.body', {tokens: Math.round(Number(item.cost.instructionTokens) || 0)});
      if (item.cost && item.cost.value != null) cost += t('inv.value', {value: item.cost.value});
      return '<tr><td>' + esc(kind) + '</td><td>' + esc(item.name) + '<div class="path">' + esc(shortPath(item.source)) + '</div>' + preferButtons(item.name, item) + '</td><td><span class="badge ' + (item.status === 'managed' || item.status === 'cap' ? 'ok' : item.status === 'estimated' ? 'violet' : '') + '">' + esc(statusLabel(item)) + '</span></td><td>' + tools + '</td><td>' + esc(cost) + '</td></tr>';
    }).join('');
    return '<div class="agent"><h4>' + tx('inv.agentCount', {agent, count: rows.length}) + '</h4><table><thead><tr><th>' + esc(t('inv.col.kind')) + '</th><th>' + esc(t('inv.col.name')) + '</th><th>' + esc(t('inv.col.role')) + '</th><th>' + esc(t('inv.col.tools')) + '</th><th>' + esc(t('inv.col.cost')) + '</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }).join('') || '<div class="empty">' + esc(t('inv.empty')) + '</div>';
  const profiler = report.profiler || {};
  const observation = profiler.observation || {};
  const ranked = (profiler.ranked || []).map((item, index) => '<div class="issue"><div><strong>' + (index + 1) + '. ' + esc(item.capability_id) + '</strong><div class="path">' + tx('prof.rankLine', {value: item.value, vpc: item.valuePerCost, successes: item.successes, sessions: item.sessions}) + '</div></div><span class="badge ok">~' + esc(item.contextCost) + ' tok</span></div>').join('') || '<div class="empty">' + esc(t('prof.rankEmpty')) + '</div>';
  const underused = (profiler.underused || []).map((item) => {
    const signal = item.successes ? t('prof.usedSignal', {value: item.value, vpc: item.valuePerCost}) : t('prof.unused');
    return '<div class="issue"><div><strong>' + esc(item.capability_id) + '</strong><div class="path">' + esc(signal) + '</div></div><span class="badge warn">~' + esc(item.contextCost) + ' tok</span></div>';
  }).join('') || '<div class="empty">' + esc(t('prof.underEmpty')) + '</div>';
  const advice = (profiler.advice || []).map((item) => {
    const signals = item.signals || {};
    const cost = signals.cost || {};
    const duplication = signals.duplication || {};
    const usage = signals.usage || {};
    const recency = signals.recency || {};
    const line = tx('prof.adviceLine', {
      frequency: item.frequency === 'low' ? t('freq.low') : t('freq.observed'),
      cost: cost.contextCost,
      dup: duplication.duplicate ? t('yes') : t('no'),
      successes: usage.successes,
      attempts: usage.attempts,
      recency: recency.neverUsed ? t('recency.never') : t('recency.days', {days: recency.daysSinceLastUse})
    });
    return '<div class="issue"><div><strong>' + esc(item.capability_id) + '</strong><div class="path">' + line + '</div></div><span class="badge warn">' + esc(t('prof.keepOut')) + '</span></div>';
  }).join('') || '<div class="empty">' + esc(t('prof.adviceEmpty')) + '</div>';
  const obsLine = profiler.frequencyVerdicts
    ? '<div class="meta">' + esc(t('prof.ready', {elapsed: observation.elapsedDays, period: observation.periodDays, days: observation.evidenceSessionDays})) + '</div>'
    : '<div class="meta">' + esc(t('prof.notReady', {elapsed: observation.elapsedDays ?? 0, period: observation.periodDays ?? 14, evidence: observation.evidenceSessionDays ?? 0, required: observation.evidenceSessionDaysRequired ?? 3})) + '</div>';
  const adviceBlock = profiler.frequencyVerdicts
    ? '<div class="meta" style="margin-top:12px">' + esc(t('prof.advice')) + '</div>' + advice
    : '<div class="meta" style="margin-top:12px">' + esc(t('prof.signal')) + '</div>' + underused;
  const profilerPanel = profiler.tracked
    ? '<section class="panel" style="margin-top:14px"><h3>' + esc(t('prof.title')) + '</h3><div class="meta">' + esc(t('prof.summary', {tracked: profiler.tracked, used: profiler.used, unused: profiler.unusedManaged, attempts: profiler.useAttempts})) + '</div>' + obsLine + '<div class="meta" style="margin-top:12px">' + esc(t('prof.rank')) + '</div>' + ranked + adviceBlock + '</section>'
    : '';
  const agents = [...new Set((report.items || []).map((item) => item.agent).filter(Boolean))];
  const shown = (report.filtered || report.items || []).filter((item) => item.kind !== 'warning').length;
  const total = (report.items || []).filter((item) => item.kind !== 'warning').length;
  const filterBar = '<form class="filters" id="inv-filters" action="javascript:void(0)"><label>' + esc(t('filter.agent')) + ' <select name="agent">' + optionList(agents, healthQuery.agent, false) + '</select></label><label>' + esc(t('filter.scope')) + ' <select name="scope">' + optionList(['user', 'project', 'shared', 'plugin'], healthQuery.scope, true) + '</select></label><label>' + esc(t('filter.type')) + ' <select name="type">' + optionList(['mcp', 'skill'], healthQuery.type, true) + '</select></label><label>' + esc(t('filter.status')) + ' <select name="status">' + optionList(['direct', 'estimated', 'managed', 'cap'], healthQuery.status, true) + '</select></label><label>' + esc(t('filter.reason')) + ' <select name="reason">' + optionList(['duplicate', 'overlap', 'migrate', 'pinned', 'excluded', 'cap-surface'], healthQuery.reason, true) + '</select></label><label>' + esc(t('filter.source')) + ' <input name="source" value="' + esc(healthQuery.source) + '" placeholder="' + esc(t('filter.sourcePh')) + '"></label><label>' + esc(t('filter.costMin')) + ' <input name="costMin" type="number" min="0" value="' + esc(healthQuery.costMin) + '"></label><label>' + esc(t('filter.costMax')) + ' <input name="costMax" type="number" min="0" value="' + esc(healthQuery.costMax) + '"></label><span class="meta">' + tx('inv.count', {shown, total}) + '</span></form>';
  bindInventoryActions();
  results.className = '';
  results.innerHTML = '<section class="health-head"><h2>' + esc(t('health.title')) + '</h2><p class="lead">' + esc(t('health.lead')) + '</p></section><div class="tiles"><div class="tile"><div class="ico">⬡</div><div class="meta">' + esc(t('tile.mcp')) + '</div><b>' + esc(summary.mcpServers) + '</b></div><div class="tile"><div class="ico">▦</div><div class="meta">' + esc(t('tile.skills')) + '</div><b>' + esc(summary.skills) + '</b></div><div class="tile"><div class="ico">⚒</div><div class="meta">' + esc(t('tile.direct')) + '</div><b>' + esc(summary.directTools) + '</b></div><div class="tile"><div class="ico">▤</div><div class="meta">' + esc(t('tile.resident')) + '</div><b>' + tok(summary.contextTokens) + '</b></div><div class="hero-metric"><b>' + esc(pressure.healthScore ?? '—') + '</b><div>' + esc(t('health.score')) + '</div><div class="bar"><i style="width:' + Math.min(100, Number(pressure.percent) || 0) + '%"></i></div><div class="meta">' + esc(t('health.budget', {percent: pressure.percent, effective: tok(budget.effectiveBudget), nominal: tok(budget.nominalWindow)})) + '</div><div class="chips" style="margin-top:8px"><span class="badge ' + ({healthy: 'ok', moderate: 'warn', high: 'warn', critical: 'danger', emergency: 'danger'}[pressure.band] || '') + '">' + esc(t('health.pressure', {band: bandPhrase(pressure.band), percent: pressure.percent})) + '</span><span class="badge warn">⚠ ' + esc(t('health.warnings', {count: summary.warnings || 0})) + '</span><span class="badge violet">' + esc(t('health.duplicates', {count: summary.duplicateGroups || 0})) + '</span><span class="badge warn">' + esc(t('health.overlaps', {count: summary.overlapGroups || 0})) + '</span><span class="badge ok">' + esc(t('health.managed', {managed: summary.managed || 0, added: summary.registryCapabilities || 0})) + '</span></div></div></div><div class="cols" style="margin-top:16px"><section class="panel"><h3>' + esc(t('issues.title')) + '</h3><div class="meta">' + esc(t('issues.dupLabel')) + ' <span class="badge">' + (report.duplicates || []).length + '</span></div>' + duplicates + '<div class="meta" style="margin-top:14px">' + esc(t('issues.overlapLabel')) + ' <span class="badge">' + (report.overlaps || []).length + '</span></div>' + overlaps + '<div class="meta" style="margin-top:14px">' + esc(t('issues.moveLabel')) + '</div>' + moves + '<p class="foot">' + esc(t('issues.foot')) + '</p></section><section class="panel"><h3>' + esc(t('inv.title')) + '</h3>' + filterBar + inventory + profilerPanel + '</section></div><p class="foot">' + t('page.foot') + '</p>';
  const form = document.querySelector('#inv-filters');
  if (form) {
    const apply = () => {
      healthQuery = {agent: form.agent.value, scope: form.scope.value, type: form.type.value, status: form.status.value, source: form.source.value, costMin: form.costMin.value, costMax: form.costMax.value, reason: form.reason.value};
      health();
    };
    form.addEventListener('change', apply);
    form.addEventListener('submit', (event) => { event.preventDefault(); apply(); });
  }
}

async function health() {
  const seq = ++healthSeq;
  const qs = healthParams();
  const data = await (await fetch('/api/inspect' + (qs ? '?' + qs : ''))).json();
  if (seq !== healthSeq) return;
  lastHealth = data;
  if (view === 'health') renderHealth(data);
}

async function hydrateHero() {
  try {
    heroReport = await (await fetch('/api/inspect')).json();
    paintHero(heroReport);
  } catch { /* hero stays on the placeholder */ }
}

function rerender() {
  applyChrome();
  paintHero(heroReport);
  if (view === 'search') {
    if (searchPending || !lastSearch) results.innerHTML = '<div class="empty">' + esc(t('search.loading')) + '</div>';
    else render(lastSearch);
  } else if (view === 'owned') {
    if (lastState) renderOwned(lastState);
  } else if (lastHealth) renderHealth(lastHealth);
}

function setLocale(next) {
  const resolved = resolveLocale(next, []);
  writeStoredLocale(resolved);
  if (resolved === locale) return;
  locale = resolved;
  rerender();
}

globalThis.add = add;
globalThis.tryCap = tryCap;
globalThis.cleanupCap = cleanupCap;

document.querySelector('#views').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  document.querySelectorAll('.tabs button').forEach((item) => item.classList.toggle('active', item === button));
  view = button.dataset.view;
  document.body.dataset.view = view;
  if (view === 'search') search();
  else if (view === 'owned') owned();
  else health();
});

document.querySelector('#lang').addEventListener('click', (event) => {
  const button = event.target.closest('[data-locale]');
  if (!button) return;
  setLocale(button.dataset.locale);
});

document.querySelector('#search').addEventListener('submit', (event) => {
  event.preventDefault();
  view = 'search';
  search();
});

locale = resolveLocale(readStoredLocale(), (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language]);
applyChrome();
paintHero(heroReport);
hydrateHero();
search();
