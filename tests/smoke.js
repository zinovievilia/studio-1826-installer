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
        const visible = () => w.dataset.view;
        const out = { views: [...w.querySelectorAll('.s-view')].length, first: visible() };
        w.querySelector('.s-collapse').click(); // развернуть
        w.querySelector('.s-collapse').click(); // свернуть
        out.collapsedTitle = w.querySelector('#s-head-title').textContent;
        w.querySelector('.s-collapse').click();
        w.querySelector('.s-open-settings').click();
        out.settings = visible();
        out.features = w.querySelectorAll('[data-feature]').length;
        w.querySelector('.s-back').click();
        out.payout = visible();
        return out;
    });

    /* Диагностика: основная страница + iframe-сборщик с одной выдуманной карточкой. */
    const page2 = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors2 = [];
    page2.on('pageerror', e => errors2.push(String(e)));
    await page2.route('https://1826studio.bitrix24.ru/**', route => route.fulfill({
        contentType: 'text/html',
        body: '<html><body><iframe src="https://app.bitrix24.ru/app.6805e7948ac458.97401951/x" width="900" height="700"></iframe></body></html>'
    }));
    await page2.route('https://app.bitrix24.ru/**', route => route.fulfill({
        contentType: 'text/html',
        body: '<html><body><div class="time-line-container"><div class="time-line-coordinate-item"><span>10:00</span></div></div>' +
            '<div class="deal-item-contaner"><div class="reserve-title-label">Зал 100 (С)</div><div class="reserve-phone-label">Бум, Фон</div></div></body></html>'
    }));
    await page2.goto('https://1826studio.bitrix24.ru/marketplace/app/129/');
    /* Настройки хранит основное окно и каждые несколько секунд отправляет их сборщику:
     * цвет задаём там же, иначе следующий запрос основного окна его перезапишет. */
    await page2.evaluate(() => localStorage.setItem('studio1826.v32.features',
        JSON.stringify({ arrows: false, colors: { done: '#123456' } })));
    await page2.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'studio1826.user.js'), 'utf8') });
    const frame = page2.frames().find(f => f.url().startsWith('https://app.bitrix24.ru'));
    /* Крючок для проверки «пульса»: по сообщению '__s26_break__' JSON.stringify в iframe начинает падать. */
    await frame.evaluate(() => {
        const original = JSON.stringify;
        window.addEventListener('message', e => {
            if (e.data === '__s26_break__') JSON.stringify = () => { throw new Error('boom'); };
        });
        window.__s26_restore = () => { JSON.stringify = original; };
    });
    await frame.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'studio1826.user.js'), 'utf8') });
    await page2.waitForTimeout(800);
    await page2.evaluate(() => document.querySelector('.s-debug-button').click());
    await page2.waitForTimeout(3300);
    const debugStatus = await page2.evaluate(() => document.querySelector('#s-debug-status').textContent);

    /* Регрессия 4.3.0–4.5.0: запрос с ИЗМЕНЁННЫМИ настройками/цветами должен
     * применяться в iframe, сборщик обязан ответить, ошибок быть не должно. */
    const errorsBefore = errors2.length;
    const replies = await page2.evaluate(() => new Promise(resolve => {
        const iframe = document.querySelector('iframe');
        let count = 0;
        window.addEventListener('message', e => {
            if (e.data && e.data.type === 'STUDIO1826_V3_DATA') count++;
        });
        iframe.contentWindow.postMessage({
            type: 'STUDIO1826_V3_REQUEST',
            full: true,
            settings: { arrows: false, colors: { done: '#123456' } }
        }, '*');
        setTimeout(() => resolve(count), 1500);
    }));
    const styled = await frame.evaluate(() => {
        const style = document.getElementById('studio1826-stage-style-v32');
        return !!style && /123456|18, ?52, ?86/i.test(style.textContent);
    });
    const settingsResult = { replies, styled };
    const newErrors = errors2.slice(errorsBefore);

    /* 5.6.2 (Этап 10, P1): ошибка внутри обработчика сборщика не глушит его — «пульс» приходит,
     * ошибка попадает в журнал, а не в pageerror. Ошибку вызываем подменой JSON.stringify в iframe. */
    const pulseBefore = errors2.length;
    const pulse = await page2.evaluate(() => new Promise(resolve => {
        const iframe = document.querySelector('iframe');
        let pulses = 0;
        window.addEventListener('message', e => {
            if (e.data && e.data.type === 'STUDIO1826_V3_PULSE') pulses++;
        });
        iframe.contentWindow.postMessage('__s26_break__', '*');
        setTimeout(() => {
            iframe.contentWindow.postMessage(JSON.stringify({
                type: 'STUDIO1826_V3_REQUEST', settings: { arrows: true, colors: { done: '#654321' } }
            }), '*');
        }, 50);
        setTimeout(() => resolve(pulses), 1200);
    }));
    await frame.evaluate(() => window.__s26_restore());
    const collectorLog = await page2.evaluate(() => new Promise(resolve => {
        window.addEventListener('message', e => {
            if (e.data && e.data.type === 'STUDIO1826_V3_DIAG') resolve(e.data.diag.errors.join('\n'));
        });
        document.querySelector('iframe').contentWindow.postMessage(JSON.stringify({ type: 'STUDIO1826_V3_REQUEST', diag: true }), '*');
        setTimeout(() => resolve(''), 1500);
    }));
    const pulseResult = { pulses: pulse, logged: /\[collector\] boom/.test(collectorLog || ''), pageErrors: errors2.slice(pulseBefore) };

    /* Календарь пропал (iframe удалён) — через ~12 с «Обзор» пишет «Календарь не отвечает», панель не скрыта. */
    await page2.evaluate(() => document.querySelector('iframe').remove());
    await page2.waitForTimeout(16000);
    const silence = await page2.evaluate(() => ({
        warn: (document.querySelector('#s-branch-status') || {}).textContent || '',
        hidden: document.documentElement.classList.contains('s26-overlay-open')
    }));
    await browser.close();

    const ok = settingsResult.replies > 0 && newErrors.length === 0 &&
        settingsResult.styled && result &&
        result.views === 2 &&
        result.first === 'home' &&
        result.settings === 'settings' &&
        result.payout === 'home' &&
        result.features === 11 &&
        /₽/.test(result.collapsedTitle) &&
        errors.length === 0 &&
        errors2.length === 0 &&
        /Готово/.test(debugStatus) && !/не ответил/.test(debugStatus) &&
        pulseResult.pulses > 0 && pulseResult.logged && pulseResult.pageErrors.length === 0 &&
        /Календарь не отвечает/.test(silence.warn) && !silence.hidden;

    console.log(JSON.stringify({ result, errors, errors2, debugStatus, settingsResult, newErrors, pulseResult, silence }, null, 1));
    if (!ok) { console.error('SMOKE FAILED'); process.exit(1); }
    console.log('SMOKE OK');
})().catch(e => { console.error(e); process.exit(1); });
