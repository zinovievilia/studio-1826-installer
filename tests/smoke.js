'use strict';
/*
 * Smoke-тест интерфейса в headless Chromium на заглушке страницы Bitrix24.
 * НЕ входит в `npm test` (нужен playwright и браузер):
 *   NODE_PATH=$(npm root -g) node tests/smoke.js
 * Проверяет: панель создаётся, вкладки переключаются, настройки собраны,
 * ошибок JS нет. Живой Bitrix24 и оверлей календаря не проверяет.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
        args: ['--no-sandbox']
    });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));

    await page.route('https://1826studio.bitrix24.ru/**', route =>
        route.fulfill({ contentType: 'text/html', body: '<html><body>stub</body></html>' }));
    await page.goto('https://1826studio.bitrix24.ru/marketplace/app/129/');
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'studio1826.user.js'), 'utf8') });
    await page.waitForTimeout(1200);

    const result = await page.evaluate(() => {
        const w = document.getElementById('studio1826-widget-v3');
        if (!w) return null;
        const visible = () => [...w.querySelectorAll('.s-panel')].filter(p => !p.hidden).map(p => p.id);
        const out0 = { collapsedTitle: null };
        const out = { tabs: [...w.querySelectorAll('[data-tab]')].map(b => b.dataset.tab), first: visible() };
        w.querySelector('.s-collapse').click(); // развернуть
        w.querySelector('.s-collapse').click(); // свернуть
        out.collapsedTitle = w.querySelector('#s-head-title').textContent;
        w.querySelector('.s-collapse').click();
        w.querySelector('[data-tab=settings]').click();
        out.settings = visible();
        out.features = w.querySelectorAll('[data-feature]').length;
        w.querySelector('[data-tab=payout]').click();
        out.payout = visible();
        return out;
    });

    await browser.close();

    const ok = result &&
        result.tabs.join() === 'overview,payout,settings' &&
        result.first.join() === 's-panel-overview' &&
        result.settings.join() === 'studio1826-settings-v32' &&
        result.payout.join() === 's-panel-payout' &&
        result.features === 11 &&
        /₽/.test(result.collapsedTitle) &&
        errors.length === 0;

    console.log(JSON.stringify({ result, errors }, null, 1));
    if (!ok) { console.error('SMOKE FAILED'); process.exit(1); }
    console.log('SMOKE OK');
})().catch(e => { console.error(e); process.exit(1); });
