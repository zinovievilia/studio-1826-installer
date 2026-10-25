'use strict';
/* Заметки под блоком «Помещения» в календаре (5.6.5) на копии правой колонки (не входит в `npm test`).
 * Запуск: NODE_PATH=<путь с модулем playwright> CHROMIUM_PATH=<Chrome> node tests/ui-notes.js [файл] [скриншот]
 * Выход с кодом 1, если проверки внизу не выполнены. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const file = process.argv[2] || path.join(__dirname, '..', 'studio1826.user.js');
const script = fs.readFileSync(file, 'utf8');

/* Правая колонка приложения: карточки «Сегодня», «Помещения» с галочками, внизу «Настройки». */
const CARD = 'style="background:#fff;border-radius:12px;padding:12px;margin-top:12px"';
const COLUMN = `<div id="side" style="display:flex;flex-direction:column;width:260px;height:760px;padding:12px;background:#eef2f4">
  <div class="card" ${CARD}><div>Сегодня</div></div>
  <div class="card" ${CARD}><div class="hd"><span>Помещения</span></div>
    <label><input type="checkbox" checked> Серпуховская</label><br><label><input type="checkbox" checked> Гримерные</label></div>
  <div style="margin-top:auto"><button>Настройки</button></div>
</div>`;

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage({ viewport: { width: 600, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    /* Сборщик запускается только внутри iframe приложения, поэтому колонка — в iframe на странице портала. */
    await page.route('https://1826studio.bitrix24.ru/**', r => r.fulfill({ contentType: 'text/html',
        body: '<html><body style="margin:0"><iframe src="https://app.bitrix24.ru/app.6805e7948ac458.97401951/x" width="300" height="790" style="border:0"></iframe></body></html>' }));
    await page.route('https://app.bitrix24.ru/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><body style="margin:0">${COLUMN}</body></html>` }));

    let frame;
    const open = async () => {
        await page.goto('https://1826studio.bitrix24.ru/x');
        frame = page.frames().find(f => f.url().startsWith('https://app.bitrix24.ru'));
        await frame.addScriptTag({ content: script });
        await page.waitForTimeout(500);
    };
    const st = () => frame.evaluate(() => {
        const notes = document.getElementById('studio1826-notes');
        const prev = notes && notes.previousElementSibling;
        return { exists: !!notes, afterRooms: !!prev && prev.textContent.includes('Помещения'),
            value: notes ? notes.querySelector('textarea').value : null, count: document.querySelectorAll('#studio1826-notes').length };
    });

    const r = {};
    await open();
    r.start = await st();
    await frame.fill('#studio1826-notes textarea', 'Ключ от 110 у охраны');
    await page.waitForTimeout(500);
    await open();
    r.reloaded = await st();
    /* Bitrix перерисовал колонку: заметки возвращаются под новую карточку «Помещения». */
    await frame.evaluate(html => { document.getElementById('side').remove(); document.body.insertAdjacentHTML('afterbegin', html); }, COLUMN);
    await page.waitForTimeout(3500);
    r.rerendered = await st();
    /* «?» в Настройках шлёт flashNotes — поле мигает; выключенная функция убирает поле. */
    const send = message => page.evaluate(m => document.querySelector('iframe').contentWindow.postMessage(JSON.stringify(m), '*'), message);
    await send({ type: 'STUDIO1826_V3_REQUEST', flashNotes: true });
    await page.waitForTimeout(300);
    r.flashing = await frame.evaluate(() => document.getElementById('studio1826-notes').classList.contains('s26-notes-flash'));
    await page.screenshot({ path: (process.argv[3] || require('os').tmpdir() + '/studio1826-notes.png').replace(/\.png$/, '-flash.png') });
    await page.waitForTimeout(2600);
    await page.screenshot({ path: process.argv[3] || require('os').tmpdir() + '/studio1826-notes.png' });
    await send({ type: 'STUDIO1826_V3_REQUEST', settings: { notes: false } });
    await page.waitForTimeout(500);
    r.offRemoved = await frame.evaluate(() => !document.getElementById('studio1826-notes'));
    await send({ type: 'STUDIO1826_V3_REQUEST', settings: { notes: true } });
    await page.waitForTimeout(500);
    r.onBack = await st();
    r.errors = errors;
    console.log(JSON.stringify(r, null, 1));
    await browser.close();

    const ok = r.start.exists && r.start.afterRooms && r.start.value === '' &&
        r.reloaded.afterRooms && r.reloaded.value === 'Ключ от 110 у охраны' &&
        r.rerendered.afterRooms && r.rerendered.count === 1 && r.rerendered.value === 'Ключ от 110 у охраны' &&
        r.flashing && r.offRemoved && r.onBack.afterRooms && r.onBack.value === 'Ключ от 110 у охраны' &&
        errors.length === 0;
    console.log(ok ? 'UI-NOTES OK' : 'UI-NOTES FAILED');
    process.exit(ok ? 0 : 1);
})();
