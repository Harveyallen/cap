import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebServer } from '../src/web-server.js';
import { WEB_LOCALE_STORAGE_KEY, WEB_MESSAGES, resolveWebLocale, webHtmlLang } from '../src/web-i18n.js';

function holes(text) {
  return [...String(text).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort().join(',');
}

test('web locale prefers a saved choice, then the first zh or en tag', () => {
  assert.equal(resolveWebLocale('en', ['zh-CN']), 'en');
  assert.equal(resolveWebLocale('zh', ['en-US']), 'zh');
  assert.equal(resolveWebLocale('zh-TW', ['en-US']), 'zh');
  assert.equal(resolveWebLocale('zh_CN', ['en-US']), 'zh');
  assert.equal(resolveWebLocale('EN', []), 'en');
  assert.equal(resolveWebLocale('fr', ['zh-Hans']), 'zh');
  assert.equal(resolveWebLocale(null, ['en-GB', 'zh-CN']), 'en');
  assert.equal(resolveWebLocale(null, ['fr-FR', 'zh-CN']), 'zh');
  assert.equal(resolveWebLocale(null, ['fr-FR', 'de']), 'en');
  assert.equal(resolveWebLocale(undefined, 'zh-HK'), 'zh');
  assert.equal(resolveWebLocale('', []), 'en');
  assert.equal(webHtmlLang('zh'), 'zh-CN');
  assert.equal(webHtmlLang('en'), 'en');
  assert.equal(WEB_LOCALE_STORAGE_KEY, 'cap.web.locale');
});

test('zh and en web copy share keys and placeholders', () => {
  const zh = Object.keys(WEB_MESSAGES.zh).sort();
  const en = Object.keys(WEB_MESSAGES.en).sort();
  assert.deepEqual(zh, en);
  for (const key of zh) {
    assert.ok(WEB_MESSAGES.zh[key].length > 0, key);
    assert.ok(WEB_MESSAGES.en[key].length > 0, key);
    assert.equal(holes(WEB_MESSAGES.zh[key]), holes(WEB_MESSAGES.en[key]), key);
  }
  assert.match(WEB_MESSAGES.zh['hero.lead'], /Search、Add、Use/);
  assert.equal(WEB_MESSAGES.zh['search.add'], '添加');
  assert.equal(WEB_MESSAGES.zh['search.try'], '试用');
  assert.equal(WEB_MESSAGES.zh['owned.cleanup'], '清理试用');
  assert.equal(WEB_MESSAGES.en['search.add'], 'Add');
  assert.match(WEB_MESSAGES.zh['health.lead'], /Pin = Direct Exposure/);
  assert.match(WEB_MESSAGES.zh['health.lead'], /只读本地配置/);
  assert.equal(WEB_MESSAGES.zh['issues.title'], '问题与建议');
  assert.match(WEB_MESSAGES.zh['hero.score'], /健康分数/);
  assert.match(WEB_MESSAGES.zh['prof.notReady'], /频率结论未就绪/);
  assert.equal(WEB_MESSAGES.zh['prof.advice'], '频率 / 价值建议（信号分列，不是移除）');
  assert.match(WEB_MESSAGES.zh['issues.overlapLabel'], /Skill 重叠/);
  assert.match(WEB_MESSAGES.en['health.title'], /Capability Health/);
  assert.equal(WEB_MESSAGES.zh['role.direct'], 'Direct Exposure');
  assert.equal(WEB_MESSAGES.en['role.surface'], 'CAP Surface');
  assert.equal(WEB_MESSAGES.en['role.managed'], 'CAP-managed');
  assert.doesNotMatch(JSON.stringify(WEB_MESSAGES), /会暴露/);
  assert.doesNotMatch(JSON.stringify(WEB_MESSAGES), /本地发现/);
  assert.doesNotMatch(JSON.stringify(WEB_MESSAGES), /acquire\(/);
});

test('cap web page ships the switcher and both dictionaries', async (t) => {
  const server = createWebServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const {port} = server.address();
  const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  assert.match(html, /data-locale="zh"/);
  assert.match(html, /data-locale="en"/);
  assert.match(html, />中文</);
  assert.match(html, />English</);
  assert.match(html, /cap\.web\.locale/);
  assert.match(html, /localStorage\.setItem\(LOCALE_KEY/);
  assert.match(html, /document\.documentElement\.lang/);
  assert.match(html, /id="lang"/);
  assert.match(html, /optionList\(agents, healthQuery\.agent, false\)/);
  assert.match(html, /#views \[data-view="search"\]/);
  assert.doesNotMatch(html, /querySelector\('\[data-view="search"\]'\)/);
  assert.doesNotMatch(html, /location\.reload/);
  assert.ok(html.includes(resolveWebLocale.toString()));
  assert.ok(html.includes(webHtmlLang.toString()));
  assert.ok(html.includes(WEB_MESSAGES.zh['search.try']));
  assert.ok(html.includes(WEB_MESSAGES.en['owned.cleanup']));
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(scripts.length, 2);
  for (const source of scripts) new vm.Script(source);
});
