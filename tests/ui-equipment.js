'use strict';
/* Браузерная проверка вкладки «Оборудование» и автозагрузки «Не разбирать на завтра» на заглушке BX.rest
 * (снимок завтрашнего дня из tests/fixtures). Не входит в `npm test`.
 * Запуск: NODE_PATH=<путь с модулем playwright> CHROMIUM_PATH=<Chrome> node tests/ui-equipment.js [файл] */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const file = process.argv[2] || path.join(__dirname, '..', 'studio1826.user.js');
const script = fs.readFileSync(file, 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'day-2026-10-25.json'), 'utf8'));

/* BX.rest: список сделок и товарные строки из снимка; режим сбоя включается из теста. */
const STUB = `(${function (fx) {
    const deals = fx.deals;
    window.__bx = { calls: 0, fail: false };
    const answer = (data, error) => ({ data: () => data, total: () => (data || []).length, error: () => error || null });
    window.BX = {
        rest: {
            callMethod(method, params, cb) {
                window.__bx.calls += 1;
                setTimeout(() => {
                    if (window.__bx.fail) return cb(answer(null, { error: 'TEST_FAIL', error_description: 'тестовый сбой' }));
                    if (method === 'crm.deal.list') {
                        const rows = deals.map(d => ({
                            ID: d.id, STAGE_ID: d.sem === 'F' ? 'LOSE' : 'NEW', STAGE_SEMANTIC_ID: d.sem,
                            UF_CRM_DATETIME_START: fx.day + 'T' + d.start + ':00+03:00', UF_CRM_DATETIME_END: fx.day + 'T' + d.end + ':00+03:00'
                        }));
                        return cb(answer(rows.slice(params.start || 0, (params.start || 0) + 50)));
                    }
                    cb(answer([]));
                }, 5);
            },
            callBatch(commands, cb) {
                window.__bx.calls += 1;
                setTimeout(() => {
                    const out = {};
                    Object.entries(commands).forEach(([key, [, params]]) => {
                        const deal = deals.find(d => d.id === String(params.id));
                        out[key] = answer((deal ? deal.rows : []).map(([name, qty]) => ({ PRODUCT_NAME: name, QUANTITY: qty })));
                    });
                    cb(out);
                }, 5);
            }
        }
    };
}})(${JSON.stringify(fixture)});`;

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(STUB);
    await page.route('https://1826studio.bitrix24.ru/**', r => r.fulfill({ contentType: 'text/html', body: '<html><body>stub</body></html>' }));
    await page.goto('https://1826studio.bitrix24.ru/marketplace/app/129/');
    await page.addScriptTag({ content: script });
    await page.waitForTimeout(800);

    const r = {};
    await page.evaluate(() => document.querySelector('.s-collapse').click());
    await page.waitForTimeout(600);
    r.view = await page.evaluate(() => document.getElementById('studio1826-widget-v3').dataset.view);
    r.tab = await page.evaluate(() => ({
        pressed: [...document.querySelectorAll('[data-eq-day]')].map(b => b.dataset.eqDay + ':' + b.getAttribute('aria-pressed')),
        status: document.querySelector('.eq-status').textContent,
        halls: [...document.querySelectorAll('.eq-hall')].map(n => n.textContent),
        items: [...document.querySelectorAll('.eq-item > summary')].map(n => n.textContent),
        totals: [...document.querySelectorAll('.eq-totals .eq-total')].map(n => n.textContent),
        sources: document.querySelectorAll('.eq-src').length
    }));
    /* раскрытие источников: ссылка на сделку */
    await page.click('.eq-item > summary');
    r.link = await page.evaluate(() => document.querySelector('.eq-src a')?.getAttribute('href'));
    /* повторная отрисовка (автообновление) не схлопывает открытые позиции */
    await page.evaluate(() => document.querySelector('.eq-refresh').click());
    await page.waitForTimeout(400);
    r.openKept = await page.evaluate(() => document.querySelectorAll('.eq-item[open]').length);
    r.copyEnabled = await page.evaluate(() => !document.querySelector('.eq-copy').disabled);

    /* дата переключается, запросов не больше одного на дату в минуту */
    const callsBefore = await page.evaluate(() => window.__bx.calls);
    await page.click('[data-eq-day=today]');
    await page.click('[data-eq-day=tomorrow]');
    await page.waitForTimeout(300);
    r.callsAfterSwitch = (await page.evaluate(() => window.__bx.calls)) - callsBefore;

    /* «Не разбирать на завтра»: список подставляется сам */
    await page.click('.da-plan');
    await page.waitForTimeout(700);
    r.dialog = await page.evaluate(() => ({
        input: document.querySelector('.dd-input').value,
        source: document.querySelector('.dd-source').textContent,
        auto: document.querySelector('.dd-input').dataset.auto
    }));
    /* ручной текст не затирается при повторном открытии */
    await page.fill('.dd-input', 'Зал 1\nМой список — 5 шт.');
    await page.click('.dd-close');
    await page.click('.da-plan');
    await page.waitForTimeout(500);
    r.manualKept = await page.evaluate(() => document.querySelector('.dd-input').value.startsWith('Зал 1'));
    await page.click('.dd-load');
    await page.waitForTimeout(500);
    r.reloaded = await page.evaluate(() => document.querySelector('.dd-input').dataset.auto === '1');
    await page.click('.dd-close');

    /* сбой Bitrix: понятное сообщение, не пустой экран, потом восстановление */
    await page.evaluate(() => { window.__bx.fail = true; });
    await page.click('[data-eq-day=today]');
    await page.click('.eq-refresh');
    await page.waitForTimeout(500);
    r.error = await page.evaluate(() => ({ text: document.querySelector('.eq-status').textContent, warn: document.querySelector('.eq-status').classList.contains('eq-warn'), copyDisabled: document.querySelector('.eq-copy').disabled }));
    await page.evaluate(() => { window.__bx.fail = false; });
    await page.click('.eq-refresh');
    await page.waitForTimeout(500);
    r.recovered = await page.evaluate(() => !document.querySelector('.eq-status').classList.contains('eq-warn') && document.querySelectorAll('.eq-item').length > 0);

    r.errors = errors;
    console.log(JSON.stringify(r, null, 1));
    await page.screenshot({ path: process.argv[3] || require('os').tmpdir() + '/studio1826-equipment.png' });
    await browser.close();

    const checks = [
        r.view === 'home',
        r.tab.pressed.join() === 'today:false,tomorrow:true',
        r.tab.halls.join() === 'Зал 75,Зал 105',
        r.tab.items.length === 2, r.tab.totals.length === 2,
        /^\/crm\/deal\/details\/\d+\/$/.test(r.link || ''),
        r.openKept === 1, r.copyEnabled, r.callsAfterSwitch <= 4,
        r.dialog.input.startsWith('Зал 75') && r.dialog.auto === '1' && /из Bitrix24/.test(r.dialog.source),
        r.manualKept, r.reloaded,
        r.error.warn && /тестовый сбой/.test(r.error.text) && /могли устареть/.test(r.error.text), r.recovered,
        errors.length === 0
    ];
    console.log(checks.every(Boolean) ? 'UI-EQUIPMENT OK' : 'UI-EQUIPMENT FAILED ' + JSON.stringify(checks));
    process.exit(checks.every(Boolean) ? 0 : 1);
})();
