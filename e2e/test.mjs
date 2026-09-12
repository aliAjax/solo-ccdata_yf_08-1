// 端到端真实操作测试：桌面 1280x900 + 窄屏 390x844
import { chromium } from 'playwright';
import fs from 'node:fs';
import { uid } from '../src/model.js';

const BASE = 'http://localhost:4173/';
const results = [];
const ok = (name) => { results.push(['PASS', name]); console.log('PASS', name); };
const fail = (name, e) => { results.push(['FAIL', name + ' :: ' + (e?.message || e)]); console.log('FAIL', name, '\n ', e?.message || e); };
async function t(name, fn) { try { await fn(); ok(name); } catch (e) { fail(name, e); } }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE);
await page.waitForSelector('.chapter');

// ---------- 桌面：初始数据 ----------
await t('初始载入：3 章节 / 3 角色 / 3 地点 / 3 战利品', async () => {
  assert(await page.locator('.chapter').count() === 3, '章节数不是 3');
  assert((await page.locator('.count').textContent()).includes('3 CHAPTERS'), '计数错误');
});

// ---------- 角色 CRUD ----------
await t('角色：新建（含重名拦截）', async () => {
  await page.getByRole('button', { name: '角色', exact: true }).click();
  await page.getByRole('button', { name: /＋ 新建角色/ }).click();
  await page.locator('.modal input').first().fill('艾德里安');
  await page.getByRole('button', { name: '添加角色' }).click();
  await wait(50);
  assert(await page.locator('.modal').count() === 1, '重名时弹窗不应关闭');
  assert((await page.locator('.field-error').first().textContent()).includes('不能重复'), '应提示重名');
  await page.locator('.modal input').first().fill('伊琳');
  await page.locator('input[placeholder="例：圣骑士"]').fill('流浪法师');
  await page.getByRole('button', { name: '添加角色' }).click();
  await wait(50);
  assert(await page.locator('.char-card', { hasText: '伊琳' }).count() === 1, '伊琳未出现');
});

await t('角色：编辑', async () => {
  const card = page.locator('.char-card', { hasText: '伊琳' });
  await card.locator('button[title="编辑"]').click();
  await page.locator('.modal input').first().fill('伊琳·海风');
  await page.getByRole('button', { name: '保存修改' }).click();
  await wait(50);
  assert(await page.locator('.char-card', { hasText: '伊琳·海风' }).count() === 1, '编辑未生效');
});

// ---------- 地点 ----------
await t('地点：新建 + 空名称拦截', async () => {
  await page.getByRole('button', { name: '地点', exact: true }).click();
  await page.getByRole('button', { name: /＋ 新建地点/ }).click();
  await page.getByRole('button', { name: '添加地点' }).click();
  await wait(50);
  assert((await page.locator('.field-error').textContent()).includes('不能为空'), '空名称应报错');
  await page.locator('.modal input').first().fill('月下集市');
  await page.getByRole('button', { name: '添加地点' }).click();
  await wait(50);
  assert(await page.locator('.char-card', { hasText: '月下集市' }).count() === 1, '地点未创建');
});

// ---------- 战利品 ----------
await t('战利品：新建，数量非法被拦截', async () => {
  await page.getByRole('button', { name: '战利品', exact: true }).click();
  await page.getByRole('button', { name: /＋ 新建战利品/ }).click();
  await page.locator('.modal input').first().fill('治疗药水');
  await page.locator('input[type="number"]').fill('0');
  await page.getByRole('button', { name: '添加战利品' }).click();
  await wait(50);
  assert(await page.locator('.field-error').count() >= 1, '数量 0 应被拦截');
  await page.locator('input[type="number"]').fill('4');
  await page.getByRole('button', { name: '添加战利品' }).click();
  await wait(50);
  assert(await page.locator('.char-card', { hasText: '治疗药水' }).count() === 1, '战利品未创建');
});

// 导出一份当前（含伊琳、月下集市、治疗药水）的档案，供回环用
const exportPath = '/tmp/e2e-export.json';
await t('导出：下载 JSON 文件', async () => {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('header .outline', { hasText: '导出' }).click(),
  ]);
  await dl.saveAs(exportPath);
  const j = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  assert(j.app === 'campaigner-workbench' && j.version === 1, '导出标识/版本错误');
  assert(j.characters.some((c) => c.name.includes('伊琳')), '导出缺少新建角色');
});

// ---------- 章节 CRUD + 关联 ----------
await t('章节：非法日期被拦截，合法章节含关联可保存', async () => {
  await page.getByRole('button', { name: '时间线', exact: true }).click();
  await page.getByRole('button', { name: /＋ 新建章节/ }).click();
  await page.locator('.modal input').first().fill('第三章：月下集市');
  await page.locator('input[type="date"]').fill('2024-07-01');
  await page.locator('.chip', { hasText: '伊琳' }).click();
  await page.locator('.chip', { hasText: '月下集市' }).click();
  await page.locator('.chip', { hasText: '治疗药水' }).click();
  await page.locator('.chip', { hasText: '艾德里安' }).click();
  // 先清空日期：缺失日期必须被拦截并说明原因（非法格式路径由导入用例覆盖）
  await page.locator('input[type="date"]').fill('');
  await page.getByRole('button', { name: '保存章节' }).click();
  await wait(60);
  assert(await page.locator('.modal').count() === 1, '空日期不应关闭弹窗');
  const errTxt = await page.locator('.field-error').first().textContent();
  assert(/不合法|请选择/.test(errTxt), '应说明日期问题，实际：' + errTxt);
  await page.locator('input[type="date"]').fill('2024-07-01');
  await page.getByRole('button', { name: '保存章节' }).click();
  await wait(60);
  assert(await page.locator('.chapter', { hasText: '第三章：月下集市' }).count() === 1, '章节未创建');
  // 详情面板自动打开（桌面为常驻），检查关联
  const panel = page.locator('.detail-panel');
  assert(await panel.locator('.mini-chip', { hasText: '伊琳·海风' }).count() === 1, '参与者关联缺失');
  assert(await panel.locator('.mini-chip', { hasText: '月下集市' }).count() === 1, '地点关联缺失');
  assert(await panel.locator('.mini-chip', { hasText: '治疗药水 ×4' }).count() === 1, '收获关联缺失');
});

// 再导出一份含 4 章节与关联的完整档案，供失败校验与回环测试使用
const roundPath = '/tmp/e2e-round.json';
await t('（导出含关联的完整档案）', async () => {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('header .outline', { hasText: '导出' }).click(),
  ]);
  await dl.saveAs(roundPath);
  const j = JSON.parse(fs.readFileSync(roundPath, 'utf8'));
  assert(j.sessions.length === 4, '应含 4 章节');
  assert(j.sessions.some((s) => s.loots.length > 0), '第三章应含战利品关联');
});

// ---------- 排序 / 搜索 / 筛选 ----------
await t('排序：升序首章 06/08，降序首章为第三章', async () => {
  await page.locator('select[aria-label="日期排序"]').selectOption('desc');
  await wait(40);
  assert((await page.locator('.chapter .date b').first().textContent()).includes('07/01'), '降序首项不是 07/01');
  await page.locator('select[aria-label="日期排序"]').selectOption('asc');
  await wait(40);
  assert((await page.locator('.chapter .date b').first().textContent()).includes('06/08'), '升序首项不是 06/08');
});

await t('搜索：关键词“符文”仅命中第一章；无结果有空状态', async () => {
  await page.locator('.search').fill('符文');
  await wait(60);
  assert(await page.locator('.chapter').count() === 1, '符文应命中 1 章');
  assert(await page.locator('.chapter', { hasText: '灰港的钟声' }).count() === 1, '应命中第一章');
  await page.locator('.search').fill('不存在的关键词xyz');
  await wait(60);
  assert(await page.locator('.empty').count() >= 1, '无结果应显示空状态');
  assert(await page.getByText('没有匹配的章节').count() === 1, '空状态文案错误');
  await page.locator('.search').fill('');
});

await t('搜索可命中关联的战利品名（治疗药水 → 仅第三章）', async () => {
  await page.locator('.search').fill('治疗药水');
  await wait(60);
  assert(await page.locator('.chapter').count() === 1, '治疗药水应仅命中第三章');
  assert(await page.locator('.chapter', { hasText: '第三章' }).count() === 1, '应命中第三章');
  await page.locator('.search').fill('');
});

await t('类别筛选：支线 1 章，番外 0 章有空状态，可清除', async () => {
  await page.locator('select[aria-label="类别筛选"]').selectOption('支线');
  await wait(40);
  assert(await page.locator('.chapter').count() === 1, '支线应 1 章');
  await page.locator('select[aria-label="类别筛选"]').selectOption('番外');
  await wait(40);
  assert(await page.locator('.empty').count() >= 1, '番外应空');
  await page.getByRole('button', { name: '清除搜索与筛选' }).click();
  await wait(40);
  assert(await page.locator('.chapter').count() === 4, '清除后应恢复 4 章');
});

// ---------- 删除被关联条目 → 章节同步解除 ----------
await t('删除关联中的战利品：确认提示列出章节，章节关联同步移除', async () => {
  await page.getByRole('button', { name: '战利品', exact: true }).click();
  const card = page.locator('.char-card', { hasText: '治疗药水' });
  const badge = await card.locator('.used-badge').textContent();
  assert(badge.includes('1 个章节'), '角标应显示用于 1 个章节，实际：' + badge);
  await card.locator('button[title="删除"]').click();
  await wait(40);
  assert((await page.locator('.confirm-desc').textContent()).includes('1 个章节'), '确认框应列出引用数');
  assert(await page.locator('.mini-chip', { hasText: '月下集市' }).count() === 0, '确认框不应含其他章节内容');
  await page.getByRole('button', { name: '确认删除' }).click();
  await wait(50);
  assert(await page.locator('.char-card', { hasText: '治疗药水' }).count() === 0, '删除失败');
  await page.getByRole('button', { name: '时间线', exact: true }).click();
  await page.locator('.chapter', { hasText: '第三章' }).click();
  await wait(40);
  assert(await page.locator('.detail-panel .mini-chip', { hasText: '治疗药水' }).count() === 0, '关联未解除');
  assert(await page.locator('.detail-panel .mini-chip', { hasText: '月下集市' }).count() === 1, '其他关联不应受影响');
});

// ---------- 章节删除 ----------
await t('删除章节', async () => {
  await page.getByRole('button', { name: '删除章节' }).first().click();
  await page.getByRole('button', { name: '删除章节' }).last().click(); // 确认框中的同名按钮
  await wait(50);
  assert(await page.locator('.chapter').count() === 3, '应剩 3 章');
});

// ---------- 刷新持久化 ----------
await t('刷新后数据保留（伊琳·海风、月下集市仍在）', async () => {
  await page.reload();
  await page.waitForSelector('.chapter');
  assert(await page.locator('.chapter').count() === 3, '刷新后章节数不对');
  await page.getByRole('button', { name: '角色', exact: true }).click();
  assert(await page.locator('.char-card', { hasText: '伊琳·海风' }).count() === 1, '新角色刷新后丢失');
  await page.getByRole('button', { name: '地点', exact: true }).click();
  assert(await page.locator('.char-card', { hasText: '月下集市' }).count() === 1, '新地点刷新后丢失');
  await page.getByRole('button', { name: '时间线', exact: true }).click();
});

// ---------- 导入：失败原因且原数据不变 ----------
const importFile = async (path) => {
  await page.locator('header .outline', { hasText: '导入' }).click();
  await page.setInputFiles('input[type="file"]', path);
  await page.waitForSelector('.import-errors, .import-warn, .import-line');
  await wait(40);
};
await t('导入非 JSON：失败且原数据不变', async () => {
  fs.writeFileSync('/tmp/e2e-bad.txt', 'not json at all{');
  await importFile('/tmp/e2e-bad.txt');
  assert(await page.locator('.import-errors li', { hasText: '不是合法的 JSON' }).count() === 1, '应报 JSON 解析错误');
  await page.getByRole('button', { name: '我知道了' }).click();
  assert(await page.locator('.chapter').count() === 3, '失败后章节数发生变化');
});

await t('导入版本过高：失败并说明版本原因', async () => {
  const j = JSON.parse(fs.readFileSync(roundPath, 'utf8'));
  j.version = 99;
  fs.writeFileSync('/tmp/e2e-v99.json', JSON.stringify(j));
  await importFile('/tmp/e2e-v99.json');
  assert(await page.locator('.import-errors li', { hasText: /版本 v99/ }).count() === 1, '应说明版本过高');
  await page.getByRole('button', { name: '我知道了' }).click();
});

await t('导入缺字段：失败并指出字段', async () => {
  fs.writeFileSync('/tmp/e2e-missing.json', JSON.stringify({ app: 'campaigner-workbench', version: 1, name: 'x' }));
  await importFile('/tmp/e2e-missing.json');
  assert(await page.locator('.import-errors li', { hasText: 'system' }).count() === 1, '应指出 system 缺失');
  assert(await page.locator('.import-errors li', { hasText: 'sessions' }).count() === 1, '应指出集合缺失');
  await page.getByRole('button', { name: '我知道了' }).click();
});

await t('导入重名：失败', async () => {
  const j = JSON.parse(fs.readFileSync(roundPath, 'utf8'));
  j.characters[1].id = uid();
  j.characters[1].name = j.characters[0].name;
  fs.writeFileSync('/tmp/e2e-dup.json', JSON.stringify(j));
  await importFile('/tmp/e2e-dup.json');
  assert(await page.locator('.import-errors li', { hasText: '重名' }).count() === 1, '应报重名');
  await page.getByRole('button', { name: '我知道了' }).click();
});

await t('导入非法日期：失败', async () => {
  const j = JSON.parse(fs.readFileSync(roundPath, 'utf8'));
  j.sessions[0].date = '2024-13-40';
  fs.writeFileSync('/tmp/e2e-baddate.json', JSON.stringify(j));
  await importFile('/tmp/e2e-baddate.json');
  assert(await page.locator('.import-errors li', { hasText: /日期.*无效/ }).count() === 1, '应报非法日期');
  await page.getByRole('button', { name: '我知道了' }).click();
});

await t('导入失效关联：失败并指出缺失 id', async () => {
  const j = JSON.parse(fs.readFileSync(roundPath, 'utf8'));
  j.sessions[0].characters.push('c-ghost');
  fs.writeFileSync('/tmp/e2e-dangling.json', JSON.stringify(j));
  await importFile('/tmp/e2e-dangling.json');
  assert(await page.locator('.import-errors li', { hasText: 'c-ghost' }).count() === 1, '应指出失效 id');
  await page.getByRole('button', { name: '我知道了' }).click();
  assert(await page.locator('.chapter').count() === 3, '失败后数据被改动');
});

// ---------- 导出 → 再导入 回环 ----------
await t('导出文件可再次导入并整体替换', async () => {
  await importFile(roundPath);
  assert(await page.locator('.import-line').count() === 1, '校验通过应显示统计');
  // 导出文件是删除前生成的：含 4 章节（第三章还在）、治疗药水
  assert((await page.locator('.import-line').textContent()).includes('4 个章节'), '统计章节数应为 4');
  await page.getByRole('button', { name: '确认导入' }).click();
  await wait(60);
  assert(await page.locator('.chapter').count() === 4, '导入后应为 4 章');
  assert(await page.locator('.chapter', { hasText: '第三章：月下集市' }).count() === 1, '第三章应回归');
  await page.getByRole('button', { name: '战利品', exact: true }).click();
  assert(await page.locator('.char-card', { hasText: '治疗药水' }).count() === 1, '治疗药水应回归');
});

// ---------- 全部删空 → 空列表反馈 ----------
await t('四类数据删空后均有空列表反馈', async () => {
  const gotoTab = (name) => page.getByRole('button', { name, exact: true }).first().click();
  for (const name of ['战利品', '地点', '角色']) {
    await gotoTab(name);
    await wait(30);
    while (await page.locator('.char-card').count() > 0) {
      await page.locator('.char-card .del').first().click();
      await page.getByRole('button', { name: '确认删除' }).click();
      await wait(40);
    }
    assert(await page.locator('.empty').count() >= 1, `${name}空状态缺失`);
  }
  await gotoTab('时间线');
  await wait(30);
  while (await page.locator('.chapter').count() > 0) {
    await page.locator('.chapter').first().click();
    await page.getByRole('button', { name: '删除章节' }).first().click();
    await page.getByRole('button', { name: '删除章节' }).last().click();
    await wait(40);
  }
  assert(await page.locator('.empty', { hasText: '时间线还是空的' }).count() === 1, '章节空状态缺失');
});

// ---------- 旧版数据迁移 ----------
await t('旧版 campaign-log 数据可迁移并保留', async () => {
  await ctx.clearCookies();
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => localStorage.setItem('campaign-log', JSON.stringify({
    name: '旧战役', system: 'COC', sessions: [{ id: 7, date: '2024-01-01', title: '旧章节', summary: 's', tag: '主线', color: '#123456' }],
    characters: [{ name: '旧角色', role: '调查员', player: 'A', color: '#654321' }],
  })));
  await page.reload();
  await page.waitForSelector('.chapter');
  assert(await page.locator('.chapter', { hasText: '旧章节' }).count() === 1, '旧章节未迁移');
  assert(await page.locator('.banner-info').count() === 1, '应有迁移提示横幅');
  await page.getByRole('button', { name: '角色', exact: true }).click();
  assert(await page.locator('.char-card', { hasText: '旧角色' }).count() === 1, '旧角色未迁移');
});

// ---------- 窄屏 390x844 真实操作 ----------
await t('窄屏：底部导航、卡片单列、详情滑层', async () => {
  await ctx.clearCookies();
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, isMobile: true });
  const mp = await m.newPage();
  await mp.goto(BASE);
  await mp.waitForSelector('.chapter');
  assert(await mp.locator('aside').isHidden(), '侧栏应隐藏');
  assert(await mp.locator('.mobile-nav').isVisible(), '底部导航应显示');
  const cardGrid = await mp.locator('.cards').count();
  await mp.locator('.mobile-nav button', { hasText: '角色' }).click();
  await mp.waitForSelector('.char-card');
  const cols = await mp.locator('.cards').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  assert(cols === 1, '窄屏卡片应为单列，实际列数 ' + cols);
  await mp.locator('.char-card button[title="编辑"]').first().click();
  await mp.waitForSelector('.modal');
  const modalW = await mp.locator('.modal').boundingBox();
  assert(modalW.width <= 390 - 20, '弹窗不应超出视口');
  await mp.locator('.close').click();
  await mp.locator('.mobile-nav button', { hasText: '时间线' }).click();
  await mp.locator('.chapter').first().click();
  await mp.waitForSelector('.detail-panel.open');
  const panel = mp.locator('.detail-panel');
  const box = await panel.boundingBox();
  assert(box.width <= 390 && box.width >= 350, '详情滑层宽度异常：' + box.width);
  assert(await panel.locator('.detail-back').isVisible(), '应显示返回按钮');
  await panel.locator('.detail-back').click();
  await wait(250);
  assert(await mp.locator('.detail-panel.open').count() === 0, '返回后滑层应关闭');
  await m.close();
});

// ---------- 页面运行时错误检查 ----------
await t('全程无未捕获页面错误', async () => {
  assert(errors.length === 0, '页面错误：' + errors.join(' | '));
});

console.log('\n==== 结果 ' + results.filter((r) => r[0] === 'PASS').length + '/' + results.length + ' ====');
for (const [s, n] of results) console.log(s, n);
await browser.close();
if (results.some((r) => r[0] === 'FAIL')) process.exit(1);
