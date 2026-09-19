import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { classifyPressure, estimateTokens, filterInventory, inspectLocal, parseInspectFilters, resolveBudget, skillOverlapScore } from '../src/inspector.js';
import { exposedCapTools, isCapMcpConfig } from '../src/mcp-tools.js';
import { applyOptimization } from '../src/optimize.js';
import { compactTokens, inspectText, main } from '../src/cli.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-inspect-'));
  const userHome = path.join(root, 'user');
  const projectRoot = path.join(root, 'project');
  const stateHome = path.join(root, 'state');
  await fs.mkdir(path.join(userHome, '.claude', 'skills', 'reviewer'), {recursive: true});
  await fs.mkdir(projectRoot, {recursive: true});
  await fs.writeFile(path.join(userHome, '.claude.json'), JSON.stringify({mcpServers: {
    github: {command: 'github-mcp', tools: [{name: 'get_pr'}, {name: 'comment_pr'}]},
    postgres: {command: 'postgres-mcp', toolCount: 12}
  }}, null, 2));
  await fs.writeFile(path.join(userHome, '.claude', 'skills', 'reviewer', 'SKILL.md'), '---\nname: reviewer\ndescription: Review code\n---\n');
  return {root, userHome, projectRoot, home: stateHome, jsonConfigs: [[path.join(userHome, '.claude.json'), 'Claude Code']], skillRoots: [[path.join(userHome, '.claude', 'skills'), 'Claude Code']], codexConfig: path.join(root, 'missing.toml')};
}

test('inspect counts MCP tools, skills, and context', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const result = await inspectLocal({...options, env: {}});
  assert.equal(result.summary.mcpServers, 2);
  assert.equal(result.summary.skills, 1);
  assert.equal(result.summary.directTools, 14);
  assert.equal(result.recommendations.length, 2);
  assert.ok(result.summary.contextTokens > 0);
  assert.equal(result.summary.warnings, 0);
  assert.equal(result.summary.managed, 0);
  assert.ok(result.summary.reclaimableTokens > 0);
  assert.ok(result.budget.nominalWindow > 0);
  assert.ok(result.budget.effectiveBudget > 0);
  assert.equal(result.budget.nominalWindow, 200000);
  assert.equal(result.budget.effectiveBudget, 168000);
  assert.equal(result.pressure.injectedTokens, result.summary.contextTokens);
  assert.equal(result.pressure.band, 'healthy');
  assert.ok(result.pressure.healthScore > 90);
  assert.equal(result.funnel.installed, 3);
  assert.equal(result.funnel.enabled, 3);
  assert.equal(result.funnel.injected, 3);
  assert.equal(result.funnel.used, 0);
  assert.equal(result.funnel.usedUnknown, true);
  const github = result.items.find((item) => item.name === 'github');
  assert.equal(github.status, 'direct');
  assert.ok(github.cost.totalTokens > 0);
  assert.equal(github.cost.estimated, true);
  assert.equal(github.cost.value, null);
  const postgres = result.items.find((item) => item.name === 'postgres');
  assert.equal(postgres.toolCount, 12);
  assert.equal(result.recommendations[0].estimatedTokensSaved >= result.recommendations[1].estimatedTokensSaved, true);
});

test('budget env overrides and pressure bands', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const tight = await inspectLocal({...options, env: {CAP_NOMINAL_WINDOW: '1000000', CAP_EFFECTIVE_BUDGET: '1'}});
  assert.equal(tight.budget.nominalWindow, 1_000_000);
  assert.equal(tight.budget.effectiveBudget, 1);
  assert.ok(tight.pressure.percent >= 85);
  assert.equal(tight.pressure.band, 'emergency');
  assert.equal(tight.pressure.healthScore, 0);
  assert.equal(resolveBudget({nominalWindow: 200000, harnessSoftLimit: 200000, reserveTokens: 32000, env: {}}).effectiveBudget, 168000);
  assert.equal(classifyPressure(0, 168000).band, 'healthy');
  assert.equal(classifyPressure(50_400, 168000).band, 'moderate');
  assert.equal(classifyPressure(84_000, 168000).band, 'high');
  assert.equal(classifyPressure(117_600, 168000).band, 'critical');
  assert.equal(classifyPressure(142_800, 168000).band, 'emergency');
  assert.equal(classifyPressure(100, 0).band, 'unknown');
  assert.equal(classifyPressure(0, 0).band, 'unknown');
  assert.equal(classifyPressure(50, -1).band, 'unknown');
  const zeroBudget = await inspectLocal({...options, env: {CAP_EFFECTIVE_BUDGET: '0'}});
  assert.equal(zeroBudget.pressure.band, 'unknown');
  assert.equal(zeroBudget.pressure.healthScore, 0);
});

test('skill body is on-demand and excluded from injected tokens', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const body = `${'On-demand instruction body. '.repeat(80)}\n`;
  await fs.writeFile(path.join(options.userHome, '.claude', 'skills', 'reviewer', 'SKILL.md'), `---\nname: reviewer\ndescription: Review code\n---\n${body}`);
  const result = await inspectLocal({...options, env: {}});
  const skill = result.items.find((item) => item.name === 'reviewer');
  const identity = estimateTokens('reviewer\nReview code');
  assert.equal(skill.contextTokens, identity);
  assert.equal(skill.cost.descriptionTokens, identity);
  assert.equal(skill.cost.instructionOnDemand, true);
  assert.ok(skill.cost.instructionTokens > identity);
  assert.equal(skill.cost.instructionTokens, estimateTokens(body));
  assert.equal(skill.cost.totalTokens, skill.cost.descriptionTokens + skill.cost.instructionTokens);
  assert.equal(result.pressure.injectedTokens, result.summary.contextTokens);
  const injected = result.items.filter((item) => item.direct).reduce((sum, item) => sum + item.contextTokens, 0);
  assert.equal(result.summary.contextTokens, injected);
  assert.ok(result.summary.contextTokens < injected + skill.cost.instructionTokens);
  assert.ok(result.summary.contextTokens < skill.cost.totalTokens + result.items.filter((item) => item.name !== 'reviewer' && item.direct).reduce((sum, item) => sum + item.contextTokens, 0));
  assert.match(inspectText(result, options), /用到这个 Skill 时才加载/);
});

test('funnel.installed is local scan names, not seed catalog', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const result = await inspectLocal({...options, env: {}});
  const local = new Set(result.items.filter((item) => item.kind !== 'warning').map((item) => item.name.toLowerCase()));
  assert.equal(result.funnel.installed, local.size);
  assert.equal(result.funnel.installed, 3);
  assert.equal(local.has('builtin.git'), false);
  assert.equal(local.has('pdf.skill'), false);
});

test('CLI inspect prints Context Health sections', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const report = await inspectLocal(options);
  const text = inspectText(report, options);
  assert.match(text, /CAP Inspect · /);
  assert.match(text, /健康\s+.*很好/);
  assert.doesNotMatch(text, /^入口  /m);
  assert.doesNotMatch(text, /^漏斗  /m);
  assert.match(text, /这些 MCP 现在是 Direct Exposure/);
  assert.match(text, /迁到 CAP/);
  assert.match(text, /Claude Code/);
  assert.match(text, /只读本地配置，未连接 MCP/);
  assert.match(text, /CAP Surface|Direct Exposure/);
  assert.match(text, /127\.0\.0\.1:4173/);
  assert.doesNotMatch(text, /一键恢复/);
  assert.doesNotMatch(text, /建议减负|可考虑卸载/);
  assert.equal(compactTokens(37800), '~37.8k');
  const logs = [];
  const original = console.log;
  console.log = (value) => logs.push(value);
  t.after(() => { console.log = original; });
  await main(['inspect'], options);
  assert.match(logs.join('\n'), /健康/);
  assert.doesNotMatch(logs.join('\n'), /^漏斗  /m);
});

test('optimize backs up JSON config and moves providers into CAP state', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const result = await applyOptimization(options);
  assert.equal(result.changed.length, 1);
  const config = JSON.parse(await fs.readFile(path.join(options.userHome, '.claude.json'), 'utf8'));
  assert.deepEqual(config.mcpServers, {});
  await fs.access(result.changed[0].backup);
  assert.match(result.changed[0].backup, /\.claude\.json\.\d{4}-\d{2}-\d{2}T[\d-]+Z\.cap-backup$/);
  assert.match(result.plan.rollback, /not one-click Restore/i);
  const state = JSON.parse(await fs.readFile(path.join(options.home, 'registry.json'), 'utf8'));
  assert.deepEqual(state.external_providers.map((item) => item.name).sort(), ['github', 'postgres']);
});

test('copying .cap-backup over the JSON file restores MCP names for inspect', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const source = path.join(options.userHome, '.claude.json');
  const before = JSON.parse(await fs.readFile(source, 'utf8'));
  const applied = await applyOptimization(options);
  await fs.copyFile(applied.changed[0].backup, source);
  const restored = JSON.parse(await fs.readFile(source, 'utf8'));
  assert.deepEqual(Object.keys(restored.mcpServers).sort(), Object.keys(before.mcpServers).sort());
  const afterRestore = await inspectLocal(options);
  assert.ok(afterRestore.items.some((item) => item.name === 'github'));
  assert.ok(afterRestore.items.some((item) => item.name === 'postgres'));
});

test('inspect copy treats a failed source as a partial report', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const broken = path.join(options.userHome, '.cursor', 'mcp.json');
  await fs.mkdir(path.dirname(broken), {recursive: true});
  await fs.writeFile(broken, '{not json');
  const report = await inspectLocal({
    ...options,
    jsonConfigs: [
      [path.join(options.userHome, '.claude.json'), 'Claude Code'],
      [broken, 'Cursor']
    ]
  });
  assert.equal(report.summary.warnings, 1);
  assert.ok(report.items.some((item) => item.kind === 'warning' && item.source === broken));
  const text = inspectText(report, options);
  assert.match(text, /部分扫描失败（其余来源已完整报告，不是整体失败）/);
  assert.match(text, /github/);
});

test('CAP mcp surface uses known tools and is not a migrate target', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const mcpPath = path.join(options.projectRoot, '.mcp.json');
  await fs.writeFile(mcpPath, JSON.stringify({
    mcpServers: {
      cap: {command: 'node', args: ['./bin/cap-mcp.js']},
      other: {command: 'node', args: ['./bin/not-cap.js']}
    }
  }));
  const result = await inspectLocal({
    ...options,
    jsonConfigs: [
      [path.join(options.userHome, '.claude.json'), 'Claude Code'],
      [mcpPath, 'Project']
    ],
    env: {}
  });
  const cap = result.items.find((item) => item.name === 'cap');
  const other = result.items.find((item) => item.name === 'other');
  assert.equal(cap.capSurface, true);
  assert.equal(cap.status, 'cap');
  assert.equal(cap.toolCount, 3);
  assert.equal(cap.toolCountEstimated, false);
  assert.equal(cap.contextTokens, estimateTokens(exposedCapTools({env: {}})));
  assert.ok(cap.contextTokens > 50);
  assert.equal(Boolean(other.capSurface), false);
  assert.equal(result.recommendations.some((item) => item.provider === 'cap'), false);
  assert.equal(result.recommendations.some((item) => item.provider === 'other'), true);
  assert.equal(result.summary.capSurface, true);
  assert.equal(result.funnel.configured, result.funnel.injected);
  const inspectOn = await inspectLocal({
    ...options,
    jsonConfigs: [[mcpPath, 'Project']],
    skillRoots: [],
    env: {CAP_MCP_INSPECT: '1'}
  });
  assert.equal(inspectOn.items.find((item) => item.name === 'cap').toolCount, 4);
});

test('a server named cap is not the CAP surface without cap-mcp', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const mcpPath = path.join(options.projectRoot, '.mcp.json');
  await fs.writeFile(mcpPath, JSON.stringify({mcpServers: {cap: {command: 'npx', args: ['some-other-cap']}}}));
  const result = await inspectLocal({
    ...options,
    jsonConfigs: [[mcpPath, 'Project']],
    skillRoots: [],
    env: {}
  });
  const cap = result.items.find((item) => item.name === 'cap');
  assert.equal(Boolean(cap.capSurface), false);
  assert.equal(result.recommendations[0].provider, 'cap');
  assert.equal(isCapMcpConfig({command: 'node', args: ['./bin/cap-mcp.js']}), true);
  assert.equal(isCapMcpConfig({command: 'npx', args: ['some-other-cap']}), false);
});

test('CLI inspect treats project CAP as the surface', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const mcpPath = path.join(options.projectRoot, '.mcp.json');
  await fs.writeFile(mcpPath, JSON.stringify({mcpServers: {cap: {command: 'node', args: ['./bin/cap-mcp.js']}}}));
  const report = await inspectLocal({
    ...options,
    jsonConfigs: [[mcpPath, 'Project']],
    env: {}
  });
  const text = inspectText(report, options);
  assert.match(text, /没有需要迁走的第三方 MCP/);
  assert.doesNotMatch(text, /这些 MCP 现在是 Direct Exposure/);
  assert.doesNotMatch(text, /^入口  /m);
  assert.doesNotMatch(text, /^漏斗  /m);
  assert.match(text, /3 个工具/);
  assert.match(text, /Project/);
});

test('optimize keeps the CAP mcp entry and migrates the rest', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const mcpPath = path.join(options.projectRoot, '.mcp.json');
  await fs.writeFile(mcpPath, JSON.stringify({
    mcpServers: {
      cap: {command: 'node', args: ['./bin/cap-mcp.js']},
      github: {command: 'github-mcp'}
    }
  }, null, 2));
  const result = await applyOptimization({
    ...options,
    jsonConfigs: [[mcpPath, 'Project']],
    skillRoots: []
  });
  assert.equal(result.changed.length, 1);
  const config = JSON.parse(await fs.readFile(mcpPath, 'utf8'));
  assert.deepEqual(Object.keys(config.mcpServers), ['cap']);
  assert.deepEqual(result.changed[0].providers, ['github']);
});

test('inspect flags path/name duplicates and probable skill overlap (INV-06)', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const skills = path.join(options.userHome, '.claude', 'skills');
  await fs.mkdir(path.join(skills, 'pr-review'), {recursive: true});
  await fs.mkdir(path.join(skills, 'github-review'), {recursive: true});
  await fs.mkdir(path.join(skills, 'postgres-explain'), {recursive: true});
  await fs.writeFile(path.join(skills, 'pr-review', 'SKILL.md'), '---\nname: pr-review\ndescription: Review GitHub pull requests for bugs and style\n---\n');
  await fs.writeFile(path.join(skills, 'github-review', 'SKILL.md'), '---\nname: github-pr-review\ndescription: Review GitHub pull requests and comment on diffs\n---\n');
  await fs.writeFile(path.join(skills, 'postgres-explain', 'SKILL.md'), '---\nname: postgres-explain\ndescription: Explain slow PostgreSQL queries with EXPLAIN ANALYZE\n---\n');
  const result = await inspectLocal({...options, env: {}});
  assert.ok(result.overlaps.length >= 1);
  const overlap = result.overlaps.find((group) => group.names.includes('pr-review') && group.names.includes('github-pr-review'));
  assert.ok(overlap);
  assert.ok(['token-jaccard', 'name-containment'].includes(overlap.method));
  assert.ok(overlap.score >= 0.5);
  assert.match(overlap.note, /False positives/);
  assert.equal(result.overlaps.some((group) => group.names.includes('postgres-explain') && group.names.includes('pr-review')), false);
  const reviewer = result.items.find((item) => item.name === 'pr-review');
  assert.ok(reviewer.reasons.includes('overlap'));
  assert.equal(reviewer.scope, 'user');
  assert.equal(skillOverlapScore({name: 'reviewer', description: 'Review code'}, {name: 'reviewer', description: 'Review code'}), null);
});

test('inspect filters inventory by agent scope type status cost and reason (INV-10)', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  await fs.mkdir(path.join(options.projectRoot, '.claude', 'skills', 'project-note'), {recursive: true});
  await fs.writeFile(path.join(options.projectRoot, '.claude', 'skills', 'project-note', 'SKILL.md'), '---\nname: project-note\ndescription: Project notes\n---\n');
  const full = await inspectLocal({
    ...options,
    skillRoots: [
      [path.join(options.userHome, '.claude', 'skills'), 'Claude Code'],
      [path.join(options.projectRoot, '.claude', 'skills'), 'Claude Code']
    ],
    env: {}
  });
  assert.equal(full.items.find((item) => item.name === 'project-note').scope, 'project');
  assert.equal(full.items.find((item) => item.name === 'reviewer').scope, 'user');
  const skills = await inspectLocal({...options, env: {}, filters: {type: 'skill'}});
  assert.ok(skills.filtered.every((item) => item.kind === 'skill'));
  assert.ok(skills.items.some((item) => item.kind === 'mcp'));
  assert.equal(skills.summary.mcpServers, full.summary.mcpServers);
  const byStatus = filterInventory(full.items, {status: 'direct'});
  assert.ok(byStatus.length);
  assert.ok(byStatus.every((item) => item.status === 'direct'));
  const costly = filterInventory(full.items, {costMin: 10_000});
  assert.ok(costly.every((item) => item.contextTokens >= 10_000));
  const migrate = filterInventory(full.items, {reason: 'migrate'});
  assert.ok(migrate.every((item) => item.reasons.includes('migrate')));
  const sourceHit = filterInventory(full.items, {source: 'skills'});
  assert.ok(sourceHit.every((item) => /skills/i.test(item.source)));
  assert.deepEqual(parseInspectFilters({scope: 'plugin', type: 'mcp'}).scope, 'plugin');
  const text = inspectText(skills, options);
  assert.match(text, /筛选/);
  assert.match(text, /type=skill/);
});

test('inspect groups extra cap-mcp names as duplicate CAP surfaces', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  await fs.writeFile(path.join(options.userHome, '.claude.json'), JSON.stringify({mcpServers: {
    cap: {command: 'node', args: ['./bin/cap-mcp.js']},
    'cap-old': {command: 'npx', args: ['-y', '-p', '@harvey2008/cap', 'cap-mcp']}
  }}));
  const result = await inspectLocal({...options, skillRoots: [], env: {}});
  assert.equal(result.summary.capSurfaces, 2);
  assert.ok(result.duplicates.some((group) => group.reason === 'cap-surface'));
  const cap = result.items.find((item) => item.name === 'cap');
  assert.ok(cap.reasons.includes('cap-duplicate'));
});
