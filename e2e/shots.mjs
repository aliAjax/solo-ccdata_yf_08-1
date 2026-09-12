import { chromium } from 'playwright';
import fs from 'node:fs';
const browser = await chromium.launch();
const shot = async (vp, mobile, name, fn) => {
  const ctx = await browser.newContext({ viewport: vp, isMobile: !!mobile, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await p.waitForSelector('.chapter');
  await fn(p);
  await p.waitForTimeout(250);
  await p.screenshot({ path: `/tmp/shot-${name}.png` });
  await ctx.close();
  console.log('shot', name);
};

await shot({ width: 1280, height: 900 }, false, 'desktop-timeline', async (p) => {
  await p.locator('.chapter', { hasText: '采药' }).click();
});
await shot({ width: 1280, height: 900 }, false, 'desktop-chars', async (p) => {
  await p.getByRole('button', { name: '角色', exact: true }).click();
});
await shot({ width: 1280, height: 900 }, false, 'desktop-session-modal', async (p) => {
  await p.getByRole('button', { name: /新建章节/ }).click();
  await p.locator('.modal input').first().fill('第三章：月下集市');
  await p.locator('.chip', { hasText: '瑟琳' }).click();
  await p.getByRole('button', { name: '灰港', exact: true }).click();
  await p.getByRole('button', { name: '古老铜币', exact: true }).click();
});
await shot({ width: 1280, height: 900 }, false, 'desktop-import-fail', async (p) => {
  fs.writeFileSync('/tmp/s-v99.json', JSON.stringify({ app: 'campaigner-workbench', version: 99, name: 'x', system: 'y', sessions: [], characters: [], places: [], loots: [] }));
  await p.locator('header .outline', { hasText: '导入' }).click();
  await p.setInputFiles('input[type="file"]', '/tmp/s-v99.json');
  await p.waitForSelector('.import-errors');
});
await shot({ width: 390, height: 844 }, true, 'mobile-timeline', async () => {});
await shot({ width: 390, height: 844 }, true, 'mobile-detail', async (p) => {
  await p.locator('.chapter').first().click();
  await p.waitForSelector('.detail-panel.open');
});
await shot({ width: 390, height: 844 }, true, 'mobile-chars', async (p) => {
  await p.locator('.mobile-nav button', { hasText: '角色' }).click();
  await p.waitForSelector('.char-card');
});
await shot({ width: 390, height: 844 }, true, 'mobile-new-modal', async (p) => {
  await p.getByRole('button', { name: /新建章节/ }).click();
  await p.waitForSelector('.modal');
});
await browser.close();
