'use strict';
/* Проверка режима «кнопка в шапке Bitrix24 + всплывающее окно» на копии вёрстки шапки (не входит в `npm test`).
 * Запуск: NODE_PATH=<путь с модулем playwright> CHROMIUM_PATH=<Chrome> node tests/ui-header.js [файл]
 * Выход с кодом 1, если проверки внизу не выполнены. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const file = process.argv[2] || path.join(__dirname, '..', 'studio1826.user.js');
const script = fs.readFileSync(file, 'utf8');

/* Копия структуры шапки портала: flex, menu во всю ширину, пункты слева, справа поле 140px под аватар. */
const HEADER = `<header id="app-header"><div id="header" class="air-header" style="display:flex;justify-content:space-between;align-items:center;position:relative;height:58px;padding:0 140px 0 22px;background:#333">
  <div id="air-header-menu" class="air-header__menu" style="flex:1"><div class="main-buttons"><div class="main-buttons-box" style="display:flex">
    ${['Рабочее место +1', 'WhatsApp от Whatcrm', 'Wappi', 'Мессенджеры +1', 'Сбросить кэш'].map((t, i) =>
        `<div class="main-buttons-item${i === 0 ? ' main-buttons-item-active' : ''}" style="padding:0 16px;flex:none"><span class="main-buttons-item-text" style="color:${i === 0 ? 'rgb(255,0,61)' : 'rgba(255,255,255,.7)'}">${t}</span></div>`).join('')}
  </div></div></div></div></header><main style="height:600px">stub</main>`;

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.route('https://1826studio.bitrix24.ru/**', r => r.fulfill({ contentType: 'text/html', body: `<html><body style="margin:0">${HEADER}</body></html>` }));
    await page.goto('https://1826studio.bitrix24.ru/marketplace/app/129/');
    await page.addScriptTag({ content: script });
    await page.waitForTimeout(900);

    const st = () => page.evaluate(() => {
        const w = document.getElementById('studio1826-widget-v3');
        const chip = document.getElementById('studio1826-chip');
        const wr = w.getBoundingClientRect();
        const cr = chip && chip.getBoundingClientRect();
        return {
            mode: w.dataset.mode, collapsed: w.classList.contains('collapsed'), shown: getComputedStyle(w).display !== 'none',
            chips: document.querySelectorAll('#studio1826-chip').length, chipHidden: chip ? document.getElementById('studio1826-chip-slot').hidden : null,
            expanded: chip && chip.getAttribute('aria-expanded'), chipText: chip && chip.textContent,
            chipAfterMenu: cr ? Math.round(cr.left - Math.max(...[...document.querySelectorAll('.main-buttons-item')].map(i => i.getBoundingClientRect().right))) === 16 : null,
            gapBelowChip: cr ? Math.round(wr.top - cr.bottom) : null, rightAligned: cr ? Math.abs(Math.round(wr.right - cr.right)) <= 1 : null,
            inViewport: wr.top >= 0 && wr.bottom <= innerHeight && wr.right <= innerWidth
        };
    });

    const r = {};
    r.start = await st();
    r.nativeClasses = await page.evaluate(() => document.getElementById('studio1826-chip').className === 'air-header-button' && document.getElementById('studio1826-chip-slot').className === 'air-header__button');
    await page.click('#studio1826-chip');
    r.open = await st();
    await page.mouse.click(300, 400);
    r.afterOutsideClick = await st();
    await page.click('#studio1826-chip');
    await page.keyboard.press('Escape');
    r.afterEsc = await st();
    await page.click('#studio1826-chip');
    await page.click('[data-tab=settings]');
    await page.click('[data-skin-choice=dark]');
    r.stillOpenAfterInsideClicks = (await st()).collapsed === false;
    await page.click('.s-collapse');
    r.closedByButton = (await st()).collapsed === true;

    await page.setViewportSize({ width: 900, height: 800 });
    await page.waitForTimeout(300);
    r.narrow = await st();
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.waitForTimeout(300);
    r.wideAgain = await st();

    await page.evaluate(() => {
        const box = document.createElement('div');
        box.className = 'air-header__personal-info';
        box.innerHTML = '<div id="fake-search" style="width:40px;height:30px;margin-left:0">x</div>';
        const menuRight = Math.max(...[...document.querySelectorAll('#air-header-menu .main-buttons-item')].map(i => i.getBoundingClientRect().right));
        box.style.cssText = `position:absolute;left:${Math.round(menuRight + 40)}px;top:10px`;
        document.getElementById('header').appendChild(box);
    });
    await page.waitForTimeout(1800);
    r.withBlocker = await st();
    await page.evaluate(() => document.querySelector('#header .air-header__personal-info').remove());
    await page.waitForTimeout(1800);
    r.blockerGone = await st();
    await page.evaluate(() => document.getElementById('header').remove());
    await page.waitForTimeout(1800);
    r.headerRemoved = await page.evaluate(() => ({ mode: document.getElementById('studio1826-widget-v3').dataset.mode, chips: document.querySelectorAll('#studio1826-chip').length }));
    await page.evaluate(html => document.body.insertAdjacentHTML('afterbegin', html), HEADER);
    await page.waitForTimeout(1800);
    r.headerBack = await st();
    r.errors = errors;
    console.log(JSON.stringify(r, null, 1));
    await page.click('#studio1826-chip');
    await page.screenshot({ path: process.argv[3] || require('os').tmpdir() + '/studio1826-header.png' });
    await browser.close();

    const ok = r.nativeClasses && r.start.mode === 'header' && r.start.chips === 1 && r.start.collapsed && !r.start.chipHidden &&
        r.open.shown && !r.open.collapsed && r.open.expanded === 'true' && r.open.rightAligned && Math.abs(r.open.gapBelowChip - 8) <= 1 && r.start.chipAfterMenu && r.open.inViewport &&
        r.afterOutsideClick.collapsed && r.afterEsc.collapsed && r.stillOpenAfterInsideClicks && r.closedByButton &&
        r.narrow.mode === 'float' && r.narrow.chipHidden === true && r.wideAgain.mode === 'header' &&
        r.withBlocker.mode === 'float' && r.blockerGone.mode === 'header' &&
        r.headerRemoved.mode === 'float' && r.headerRemoved.chips === 0 && r.headerBack.mode === 'header' && r.headerBack.chips === 1 &&
        errors.length === 0;
    console.log(ok ? 'UI-HEADER OK' : 'UI-HEADER FAILED');
    process.exit(ok ? 0 : 1);
})();
