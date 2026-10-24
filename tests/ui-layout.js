'use strict';
/* Проверка оформления и вёрстки панели в браузере на заглушке страницы (не входит в `npm test`).
 * Запуск: NODE_PATH=<путь с модулем playwright> node tests/ui-layout.js [файл] [скриншот.png]
 * Выход с кодом 1, если не выполнены проверки внизу. */
const fs = require('fs');
const { chromium } = require('playwright');
const file = process.argv[2] || require('path').join(__dirname, '..', 'studio1826.user.js');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('https://1826studio.bitrix24.ru/**', r => r.fulfill({ contentType: 'text/html', body: '<html><body>stub</body></html>' }));
  await page.goto('https://1826studio.bitrix24.ru/marketplace/app/129/');
  await page.addScriptTag({ content: fs.readFileSync(file, 'utf8') });
  await page.waitForTimeout(1000);
  const out = {};
  out.skinDefault = await page.evaluate(() => document.getElementById('studio1826-widget-v3').dataset.skin);
  out.bgLight = await page.evaluate(() => { const w = document.getElementById('studio1826-widget-v3'); w.querySelector('.s-collapse').click(); return getComputedStyle(w).backgroundColor; });
  // settings tab, switch to dark
  await page.evaluate(() => document.querySelector('[data-tab=settings]').click());
  out.pressedBefore = await page.evaluate(() => [...document.querySelectorAll('[data-skin-choice]')].map(b => b.dataset.skinChoice + ':' + b.getAttribute('aria-pressed')));
  await page.evaluate(() => document.querySelector('[data-skin-choice=dark]').click());
  out.afterDark = await page.evaluate(() => { const w = document.getElementById('studio1826-widget-v3'); return [w.dataset.skin, getComputedStyle(w).backgroundColor, localStorage.getItem('studio1826.v4.ui')]; });
  // tab choice must keep skin
  await page.evaluate(() => document.querySelector('[data-tab=payout]').click());
  out.uiAfterTab = await page.evaluate(() => localStorage.getItem('studio1826.v4.ui'));
  // reload persists dark + tab
  await page.reload();
  await page.addScriptTag({ content: fs.readFileSync(file, 'utf8') });
  await page.waitForTimeout(800);
  out.afterReload = await page.evaluate(() => { const w = document.getElementById('studio1826-widget-v3'); return [w.dataset.skin, !!document.querySelector('#s-panel-payout:not([hidden])'), document.querySelectorAll('#studio1826-widget-v3').length]; });
  // back to light, low viewport: header reachable
  await page.evaluate(() => { document.querySelector('[data-tab=settings]').click(); document.querySelector('[data-skin-choice=light]').click(); });
  await page.evaluate(() => { const w=document.getElementById('studio1826-widget-v3'); if (w.classList.contains('collapsed')) w.querySelector('.s-collapse').click(); });
  for (const h of [900, 600, 440, 360]) {
    await page.setViewportSize({ width: 1000, height: h });
    await page.waitForTimeout(200);
    out['h' + h] = await page.evaluate(() => { const w = document.getElementById('studio1826-widget-v3'); const r = w.getBoundingClientRect(); const hd = w.querySelector('.s-head').getBoundingClientRect(); const bd = w.querySelector('.s-body'); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, headVisible: hd.top >= 0 && hd.bottom <= innerHeight, bodyScrolls: bd.scrollHeight > bd.clientHeight }; });
  }
  // collapse via header button works at low height
  await page.evaluate(() => document.querySelector('.s-collapse').click());
  out.collapsedAtLow = await page.evaluate(() => document.getElementById('studio1826-widget-v3').classList.contains('collapsed'));
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await page.screenshot({ path: process.argv[3] || require('os').tmpdir() + '/studio1826-ui.png' });
  await browser.close();
  const ok = out.skinDefault === 'light' && out.afterDark[0] === 'dark' && out.afterReload[0] === 'dark' &&
    out.afterReload[2] === 1 && JSON.parse(out.uiAfterTab).skin === 'dark' &&
    [900, 600, 440, 360].every(h => out['h' + h].headVisible) && out.collapsedAtLow && errors.length === 0;
  console.log(ok ? 'UI-LAYOUT OK' : 'UI-LAYOUT FAILED');
  process.exit(ok ? 0 : 1);
})();
