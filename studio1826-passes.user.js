// ==UserScript==
// @name         v1.3.0 Studio 1826 — Пропуска списком (Авангард)
// @namespace    studio1826
// @version      1.3.0
// @description  Кнопка «Оформить пропуск» в окне ввода открытых линий Bitrix24: список ФИО + дата → пропуска в Авангарде оформляются по очереди
// @updateURL    https://raw.githubusercontent.com/zinovievilia/studio-1826-installer/main/studio1826-passes.user.js
// @downloadURL  https://raw.githubusercontent.com/zinovievilia/studio-1826-installer/main/studio1826-passes.user.js
// @match        https://1826studio.bitrix24.ru/*
// @match        https://my.avanguard.pro/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.openInTab
// @grant        unsafeWindow
// ==/UserScript==

// Отдельный скрипт, не часть «Основного» (studio1826.user.js).
// Bitrix24 и Авангард — разные сайты, поэтому они общаются через хранилище Tampermonkey:
//   Bitrix кладёт задание {id, names, from, to} → открывает вкладку Авангарда с #s1826-job=<id> →
//   эта вкладка оформляет пропуска по одному и пишет результат по каждому имени → Bitrix показывает ✓/✗.
// Задание берёт только вкладка, открытая с его id, — обычная открытая вкладка Авангарда его не трогает.

(function () {
  'use strict';

  const VERSION = '1.3.0';
  const DEFAULT_GUESTS_URL = 'https://my.avanguard.pro/account/354/guests';

  // ── Чистые функции (тесты: tests/passes.test.js) ───────────────────────────

  // Госномер: буква, 3 цифры, 2 буквы, регион 2–3 цифры. Латиницу клиентов (A123BC) переводим в кириллицу.
  const PLATE_LETTERS = 'АВЕКМНОРСТУХ';
  const LATIN_TO_CYR = { A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М', H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т', Y: 'У', X: 'Х' };
  const PLATE_IN_TEXT = /(^|[^0-9A-Za-zА-Яа-яЁё])([АВЕКМНОРСТУХABEKMHOPCTYX])[\s-]*(\d{3})[\s-]*([АВЕКМНОРСТУХABEKMHOPCTYX]{2})[\s-]*(\d{2,3})(?:\s*RUS)?(?=$|[^0-9A-Za-zА-Яа-яЁё])/i;

  /** «е334ав34», «A 123 BC 777 RUS» → { number: 'Е334АВ', region: '34' }; не номер — null. */
  function parsePlate(text) {
    const m = PLATE_IN_TEXT.exec(' ' + String(text || '') + ' ');
    if (!m) return null;
    const cyr = (s) => s.toUpperCase().split('').map((c) => LATIN_TO_CYR[c] || c).join('');
    return { number: cyr(m[2]) + m[3] + cyr(m[4]), region: m[5] };
  }

  /** Подпись строки списка: «Иванов Иван · Е334АВ 34». По ней же скрипт в Авангарде восстанавливает ФИО и номер. */
  function passLabel(name, plate) {
    return plate ? `${name} · ${plate.number} ${plate.region}` : name;
  }

  /** «Иванов Иван · Е334АВ 34» → { name, plate } */
  function splitLabel(label) {
    const m = new RegExp(`^(.*?)\\s*·\\s*([${PLATE_LETTERS}]\\d{3}[${PLATE_LETTERS}]{2})\\s+(\\d{2,3})$`).exec(String(label || '').trim());
    return m ? { name: m[1], plate: { number: m[2], region: m[3] } } : { name: String(label || '').trim(), plate: null };
  }

  /**
   * Список пропусков из вставленного текста: по строке (или через «;» и «,»), без нумерации, пробелов и повторов.
   * Номер машины — в строке с ФИО или отдельной строкой: отдельный номер достаётся первому ФИО без машины,
   * а если такого нет — пропуск на «Машина». Строки с цифрами, но без понятного номера — в `invalid`.
   */
  function parseNames(text) {
    const entries = [];
    const loosePlates = [];
    const invalid = [];
    for (const raw of String(text || '').split(/[\n;,]+/)) {
      let piece = raw
        .replace(/^\s*(?:\d+\s*[.)]|[-–—•*])\s*/, '') // «1.», «2)», «-», «•»
        .replace(/\s+/g, ' ')
        .trim();
      if (!piece) continue;
      const known = splitLabel(piece);
      let plate = known.plate;
      if (plate) piece = known.name;
      else {
        plate = parsePlate(piece);
        if (plate) piece = (' ' + piece + ' ').replace(PLATE_IN_TEXT, '$1').replace(/[\s·:—–-]+$|^[\s·:—–-]+/g, '').replace(/\s+/g, ' ').trim();
      }
      if (/\d/.test(piece)) { invalid.push(raw.trim()); continue; }
      if (!piece) { if (plate) loosePlates.push(plate); continue; }
      entries.push({ name: piece, plate });
    }
    for (const plate of loosePlates) {
      const free = entries.find((e) => !e.plate);
      if (free) free.plate = plate; else entries.push({ name: 'Машина', plate });
    }
    const names = [];
    const duplicates = [];
    const seen = new Set();
    for (const e of entries) {
      const label = passLabel(e.name, e.plate);
      const key = normalize(label);
      if (seen.has(key)) { duplicates.push(label); continue; }
      seen.add(key);
      names.push(label);
    }
    return { names, duplicates, invalid };
  }

  /** В строке таблицы есть этот номер («М593УХ 790»)? */
  function rowHasPlate(rowText, plate) {
    if (!plate) return true;
    return new RegExp(`${plate.number}\\s*${plate.region}(?!\\d)`).test(String(rowText || '').toUpperCase());
  }

  /** «Показано 1-50 из 140» → видны не все строки? */
  function tableTruncated(pageText) {
    const m = /Показано\s+(\d+)\s*[-–]\s*(\d+)\s+из\s+(\d+)/i.exec(String(pageText || ''));
    return Boolean(m && Number(m[2]) < Number(m[3]));
  }

  function normalize(s) {
    return String(s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  }

  /** Дата для input[type=date]: YYYY-MM-DD по местному времени. */
  function isoDate(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  /** «2026-10-24» → «24.10.2026» */
  function humanDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
  }

  function periodText(from, to) {
    return from === to ? humanDate(from) : `${humanDate(from)} – ${humanDate(to)}`;
  }

  /**
   * Строка таблицы посетителей — уже есть пропуск на этого человека, который покрывает [fromIso, toIso]?
   * Период в таблице «24.10.2026 - 31.10.2026»: пропуск на 29-е уже есть, даже если «29.10.2026» в строке нет.
   */
  function rowMatches(rowText, name, fromIso, toIso = fromIso) {
    if (!normalize(rowText).includes(normalize(name))) return false;
    return rowCoversPeriod(rowText, fromIso, toIso);
  }

  /** Даты строки покрывают [fromIso, toIso] (без проверки имени). */
  function rowCoversPeriod(rowText, fromIso, toIso = fromIso) {
    const row = normalize(rowText);
    const want = (iso) => (/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '') || []).slice(1).join('');
    const wantFrom = want(fromIso);
    const wantTo = want(toIso);
    if (!wantFrom || !wantTo) return false;
    const period = /(\d{2})\.(\d{2})\.(\d{4})\s*[-–—]\s*(\d{2})\.(\d{2})\.(\d{4})/.exec(row);
    if (period) {
      const rowFrom = period[3] + period[2] + period[1];
      const rowTo = period[6] + period[5] + period[4];
      return rowFrom <= wantFrom && rowTo >= wantTo;
    }
    // Одна дата в строке (на всякий случай: dd.mm.yyyy, dd.mm.yy, yyyy-mm-dd)
    const [y, mo, d] = [wantFrom.slice(0, 4), wantFrom.slice(4, 6), wantFrom.slice(6, 8)];
    return wantFrom === wantTo && [`${d}.${mo}.${y}`, `${d}.${mo}.${y.slice(2)}`, `${y}-${mo}-${d}`].some((v) => row.includes(v));
  }

  /**
   * Таблица уже показывает список за нужные даты, а не прежний (за сегодня)? Все строки с датами покрывают период;
   * пустая таблица считается свежей, только если сайт пишет, что записей нет.
   */
  function tableFresh(rowTexts, fromIso, toIso = fromIso, emptyShown = false) {
    const dated = rowTexts.filter((t) => /\d{2}\.\d{2}\.\d{2,4}|\d{4}-\d{2}-\d{2}/.test(t));
    if (dated.length === 0) return emptyShown;
    return dated.every((t) => rowCoversPeriod(t, fromIso, toIso));
  }

  /** Запрос списка посетителей именно за этот период (а не стартовый за сегодня). */
  function guestsRequestMatches(url, from, to) {
    if (!/\/api\/guests(?:[/?]|$)/.test(url || '')) return false;
    let decoded = url;
    try { decoded = decodeURIComponent(url); } catch (e) { /* оставляем как есть */ }
    const start = /[?&]dateStart=(\d{4}-\d{2}-\d{2})/.exec(decoded);
    const finish = /[?&]dateFinish=(\d{4}-\d{2}-\d{2})/.exec(decoded);
    return Boolean(start && finish && start[1] === from && finish[1] === to);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseNames, isoDate, addDays, humanDate, periodText, rowMatches, rowCoversPeriod, tableFresh, guestsRequestMatches,
      parsePlate, passLabel, splitLabel, rowHasPlate, tableTruncated, VERSION };
    return;
  }

  // ── Хранилище Tampermonkey (и GM.* в других менеджерах) ─────────────────────

  const store = {
    async get(key, fallback) {
      try {
        if (typeof GM !== 'undefined' && GM.getValue) return await GM.getValue(key, fallback);
        if (typeof GM_getValue !== 'undefined') return GM_getValue(key, fallback);
      } catch (e) { /* нет доступа — ниже fallback */ }
      return fallback;
    },
    async set(key, value) {
      if (typeof GM !== 'undefined' && GM.setValue) return GM.setValue(key, value);
      if (typeof GM_setValue !== 'undefined') return GM_setValue(key, value);
    },
  };

  /** Вкладка Авангарда в фоне: Bitrix остаётся на экране. Возвращает ручку вкладки (чтобы закрыть), если менеджер её даёт. */
  async function openBackgroundTab(url) {
    const options = { active: false, insert: true, setParent: true };
    try {
      if (typeof GM_openInTab !== 'undefined') return GM_openInTab(url, options);
      if (typeof GM !== 'undefined' && GM.openInTab) return await GM.openInTab(url, options);
    } catch (e) { /* ниже обычное окно */ }
    return window.open(url, '_blank');
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(fn, timeout = 8000, step = 50) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const value = fn();
      if (value) return value;
      await sleep(step);
    }
    return null;
  }

  const visible = (el) => !!el && el.offsetParent !== null;
  const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();

  function addStyle(css) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  const PANEL_CSS = `
    .s1826p-toggle { position: fixed; z-index: 99999; padding: 9px 13px; border: 0; border-radius: 10px;
      background: #1f6feb; color: #fff; font: 600 13px system-ui; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.2); }
    .s1826p { position: fixed; z-index: 99999; width: 360px; max-height: 80vh; display: none; flex-direction: column;
      gap: 8px; padding: 14px; border-radius: 12px; background: #fff; color: #222; font: 14px system-ui;
      box-shadow: 0 8px 30px rgba(0,0,0,.25); }
    .s1826p.open { display: flex; }
    .s1826p h3 { margin: 0; font-size: 15px; display: flex; justify-content: space-between; }
    .s1826p h3 button { border: 0; background: none; font-size: 16px; cursor: pointer; color: #888; }
    .s1826p textarea { width: 100%; height: 130px; box-sizing: border-box; font: 13px system-ui; padding: 6px; }
    .s1826p .row { display: flex; gap: 8px; }
    .s1826p .row label { display: flex; flex-direction: column; font-size: 12px; color: #666; flex: 1; }
    .s1826p button.main { padding: 8px; border: 0; border-radius: 8px; background: #1f6feb; color: #fff;
      font: 600 14px system-ui; cursor: pointer; }
    .s1826p button.main:disabled { background: #9bb8e8; cursor: default; }
    .s1826p .hint { font-size: 12px; color: #666; }
    .s1826p ol { margin: 0; padding-left: 22px; overflow: auto; max-height: 30vh; font-size: 13px; }
    .s1826p li.ok { color: #1a7f37; }
    .s1826p li.skip { color: #666; }
    .s1826p li.err { color: #c62828; }
    .s1826p li.work { font-weight: 600; }
    .s1826p .confirm { display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: 8px; background: #eef4ff; }
    .s1826p .confirm-title { font-weight: 600; }
    .s1826p .confirm button.no { background: #8a8f98; }
    .s1826p .confirm button { flex: 1; }
    .s1826p .days { display: flex; gap: 6px; align-items: flex-end; }
    .s1826p .days button { padding: 6px 10px; border: 1px solid #c9d4e6; border-radius: 8px; background: #fff;
      color: #1f6feb; font: 600 13px system-ui; cursor: pointer; }
    .s1826p .days button.active { background: #1f6feb; border-color: #1f6feb; color: #fff; }
    .s1826p .days label { flex: 1; }
  `;

  /** Панель: список ФИО + даты + кнопка. `single` — одна дата вместо «с/по». */
  function buildPanel({ id, toggleText, position, single, defaultDate, onStart }) {
    // Две копии скрипта (старая и новая под другим именем) не должны рисовать две панели
    if (document.getElementById(id)) return null;
    // Без toggleText плавающей кнопки нет — панель открывают снаружи (ui.openAt)
    const toggle = toggleText ? document.createElement('button') : null;
    if (toggle) {
      toggle.className = 's1826p-toggle';
      toggle.id = `${id}-toggle`;
      toggle.textContent = toggleText;
      Object.assign(toggle.style, position.toggle);
    }

    const panel = document.createElement('div');
    panel.className = 's1826p';
    panel.id = id;
    Object.assign(panel.style, position.panel);
    panel.innerHTML = `
      <h3><span>Оформить пропуск · v${VERSION}</span><button class="close" title="Свернуть">✕</button></h3>
      <div class="hint">ФИО — по одному на строку. Номер машины (Е334ав34) — в той же строке или отдельной: без ФИО пропуск будет на «Машина».</div>
      <textarea placeholder="Воронцова Лилия Эдуардовна&#10;Хван Валерия Алексеевна"></textarea>
      ${single ? `
      <div class="row days">
        <button type="button" data-days="0">Сегодня</button>
        <button type="button" data-days="1">Завтра</button>
        <label>Другая дата <input type="date" class="from" value="${defaultDate}"></label>
      </div>` : `
      <div class="row">
        <label>С <input type="date" class="from" value="${defaultDate}"></label>
        <label>По <input type="date" class="to" value="${defaultDate}"></label>
      </div>`}
      <div class="hint summary"></div>
      <button class="main start" disabled>Оформить</button>
      <ol class="status"></ol>
      <div class="hint footer">Studio 1826 · пропуска · ${VERSION}</div>
    `;
    document.body.append(...[toggle, panel].filter(Boolean));

    const ui = {
      panel,
      area: panel.querySelector('textarea'),
      from: panel.querySelector('.from'),
      to: panel.querySelector('.to') || panel.querySelector('.from'),
      summary: panel.querySelector('.summary'),
      start: panel.querySelector('.start'),
      status: panel.querySelector('.status'),
      footer: panel.querySelector('.footer'),
      running: false,
    };

    if (toggle) toggle.addEventListener('click', () => panel.classList.toggle('open'));
    /** Открыть/закрыть над элементом (значок в окне ввода сообщения) */
    ui.openAt = (anchor) => {
      if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
      panel.classList.add('open');
      const r = anchor.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, window.innerWidth - panel.offsetWidth - 8));
      Object.assign(panel.style, { left: `${left}px`, right: 'auto', top: 'auto',
        bottom: `${Math.max(8, window.innerHeight - r.top + 8)}px` });
      ui.area.focus();
    };
    panel.querySelector('.close').addEventListener('click', () => panel.classList.remove('open'));

    ui.refresh = () => {
      if (ui.running) return;
      const { names, duplicates, invalid } = parseNames(ui.area.value);
      if (ui.to.value < ui.from.value) ui.to.value = ui.from.value;
      ui.summary.textContent = (names.length
        ? `${names.length} чел. на ${periodText(ui.from.value, ui.to.value)}` +
          (duplicates.length ? ` · повторы убраны: ${duplicates.length}` : '')
        : '') + (invalid.length ? ` · не понял номер: ${invalid.join(', ')}` : '');
      ui.start.disabled = names.length === 0 || invalid.length > 0 || !ui.from.value;
      markDay();
      ui.start.textContent = names.length ? `Оформить: ${names.length} чел.` : 'Оформить';
    };
    // Быстрые кнопки «Сегодня / Завтра»: подсвечена та, что совпадает с датой в поле
    const dayButtons = [...panel.querySelectorAll('.days button')];
    const markDay = () => dayButtons.forEach((b) =>
      b.classList.toggle('active', ui.from.value === isoDate(addDays(new Date(), Number(b.dataset.days)))));
    dayButtons.forEach((b) => b.addEventListener('click', () => {
      ui.from.value = isoDate(addDays(new Date(), Number(b.dataset.days)));
      ui.refresh();
    }));
    ui.area.addEventListener('input', ui.refresh);
    ui.from.addEventListener('change', ui.refresh);
    ui.to.addEventListener('change', ui.refresh);

    ui.setRunning = (running, label) => {
      ui.running = running;
      ui.area.disabled = ui.from.disabled = ui.to.disabled = running;
      dayButtons.forEach((b) => { b.disabled = running; });
      if (running) ui.start.textContent = label || 'Стоп'; else ui.refresh();
    };

    /** Подтверждение внутри панели (родной confirm() замораживает страницу). Resolve: true — «Да». */
    ui.confirm = (title, names) => new Promise((resolve) => {
      const box = document.createElement('div');
      box.className = 'confirm';
      const heading = document.createElement('div');
      heading.className = 'confirm-title';
      heading.textContent = title;
      const list = document.createElement('ol');
      for (const n of names) { const li = document.createElement('li'); li.textContent = n; list.appendChild(li); }
      const row = document.createElement('div');
      row.className = 'row';
      const yes = document.createElement('button');
      yes.className = 'main yes';
      yes.textContent = 'Да, оформить';
      const no = document.createElement('button');
      no.className = 'main no';
      no.textContent = 'Отмена';
      row.append(yes, no);
      box.append(heading, list, row);
      ui.start.hidden = true;
      ui.start.parentNode.insertBefore(box, ui.start);
      const done = (answer) => { box.remove(); ui.start.hidden = false; resolve(answer); };
      yes.addEventListener('click', () => done(true));
      no.addEventListener('click', () => done(false));
    });

    /** Статусы по именам: {name: 'ok' | 'skip' | 'work' | 'err:текст'} */
    ui.showStatus = (names, results) => {
      ui.status.innerHTML = '';
      for (const name of names) {
        const r = results[name];
        const li = document.createElement('li');
        if (r === 'ok') { li.className = 'ok'; li.textContent = `✓ ${name}`; }
        else if (r === 'skip') { li.className = 'skip'; li.textContent = `✓ ${name} — уже был оформлен`; }
        else if (r === 'work') { li.className = 'work'; li.textContent = `… ${name}`; }
        else if (r && r.startsWith('err:')) { li.className = 'err'; li.textContent = `✗ ${name} — ${r.slice(4)}`; }
        else { li.textContent = name; }
        ui.status.appendChild(li);
      }
    };

    ui.start.addEventListener('click', () => onStart(ui));
    ui.refresh();
    return ui;
  }

  // ── Авангард: оформление ───────────────────────────────────────────────────

  function buttonByText(root, text) {
    return [...root.querySelectorAll('button, [role="button"], a')]
      .find((b) => visible(b) && textOf(b) === text && !b.closest('.s1826p'));
  }

  /** Открытое окно «Добавить нового посетителя» (самое вложенное — сама форма). */
  function findModal() {
    const candidates = [...document.querySelectorAll('[role="dialog"], .modal, [class*="modal" i], [class*="dialog" i]')]
      .filter((el) => visible(el) && /Добавить нового посетителя/.test(el.textContent || ''));
    return candidates.sort((a, b) => (a.contains(b) ? 1 : b.contains(a) ? -1 : 0))[0] || null;
  }

  /** Поле по подписи рядом с ним («ФИО *») */
  function inputByLabel(modal, labelRe) {
    for (const label of modal.querySelectorAll('label, span, div, p')) {
      if (label.children.length > 2 || !labelRe.test(textOf(label))) continue;
      if (label.htmlFor) {
        const byFor = modal.querySelector(`#${CSS.escape(label.htmlFor)}`);
        if (byFor) return byFor;
      }
      const inside = label.querySelector('input');
      if (inside) return inside;
      let node = label;
      for (let i = 0; i < 3 && node; i++, node = node.parentElement) {
        const next = node.nextElementSibling;
        const input = next && (next.matches('input') ? next : next.querySelector('input'));
        if (input) return input;
      }
    }
    return null;
  }

  /** Значение в поле, которым управляет React: через нативный setter + события. */
  function setValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function modalError(modal) {
    return [...modal.querySelectorAll('[class*="error" i], [role="alert"], .invalid-feedback')]
      .map(textOf).filter(Boolean)[0] || null;
  }

  /** Фильтры списка над таблицей (вне окна «Новый посетитель») */
  function listControls() {
    const dates = [...document.querySelectorAll('input[type="date"]')].filter((i) => visible(i) && !i.closest('[role="dialog"], .s1826p'));
    const search = [...document.querySelectorAll('input')].find((i) => visible(i) && /Поиск по посетителям/i.test(i.placeholder || ''));
    return { from: dates[0] || null, to: dates[1] || null, search: search || null };
  }

  /** Завершённые запросы списка посетителей. Performance API общий со страницей: перехват fetch/XHR
   *  из Tampermonkey запросов сайта не видит. Запись появляется, когда ответ уже пришёл. */
  function guestsRequests() {
    try {
      return performance.getEntriesByType('resource').filter((e) => /\/api\/guests(?:[/?]|$)/.test(e.name));
    } catch (e) { return []; }
  }

  /**
   * Уже есть пропуск на этого человека на весь период? Ставим фильтр на даты и поиск по имени и смотрим таблицу.
   * true / false — ответ; null — список не обновился, и сказать нельзя (тогда ничего не создаём).
   */
  async function alreadyListed(label, from, to) {
    const { name, plate } = splitLabel(label);
    const { from: f, to: t } = listControls();
    const datesChange = Boolean(f && t && (f.value !== from || t.value !== to));
    // Стартовая загрузка (список за сегодня, до 6 с) должна закончиться до нашего фильтра
    if (datesChange) await waitFor(() => guestsRequests().length > 0, 10000, 150);
    const setAt = performance.now();
    if (f && t) { setValue(f, from); setValue(t, to); }
    // Поиск по посетителям от setValue таблицу не фильтрует — смотрим весь список за дату
    const matches = () => [...document.querySelectorAll('tr, [role="row"]')]
      .some((row) => rowMatches(textOf(row), name, from, to) && rowHasPlate(textOf(row), plate));
    if (!f) return matches();

    if (datesChange) {
      // Ждём ответ сервера именно на наш фильтр; без него — не гадаем
      const answer = await waitFor(() => guestsRequests()
        .find((e) => e.startTime >= setAt - 50 && guestsRequestMatches(e.name, from, to)), 15000, 150);
      if (!answer) return null;
      // В скрытой вкладке сайт перерисовывает таблицу с опозданием: ждём, пока в ней будут строки за нужные даты
      const rows = () => [...document.querySelectorAll('tr, [role="row"]')].map(textOf);
      const emptyShown = () => /нет (данных|записей|посетителей)|ничего не найдено|список пуст/i.test(textOf(document.body));
      const fresh = await waitFor(() => tableFresh(rows(), from, to, emptyShown()), 10000, 250);
      if (!fresh) return null;
    }
    // Таблица постраничная (50 строк): нужный человек может быть дальше — просим 500 на странице
    if (tableTruncated(textOf(document.body))) {
      showAllRows();
      const all = await waitFor(() => !tableTruncated(textOf(document.body)), 15000, 250);
      if (!all) return null;
      await sleep(400);
    }
    if (datesChange) return matches() || (await sleep(1000), matches());

    // Даты уже стояли — сервер не спрашиваем, поиск по имени фильтрует таблицу на странице: ждём, пока она успокоится
    const table = () => [...document.querySelectorAll('tr, [role="row"]')].map(textOf).join('|');
    const started = Date.now();
    let last = table();
    let stableSince = started;
    while (!matches() && Date.now() - started < 8000) {
      await sleep(150);
      const now = table();
      if (now !== last) { last = now; stableSince = Date.now(); }
      else if (Date.now() - started > 1000 && Date.now() - stableSince >= 1500) break;
    }
    return matches();
  }

  /** Переключатель «На странице: 50 / 100 / 500» — ставим самое большое. */
  function showAllRows() {
    const select = [...document.querySelectorAll('select')].find((sel) => [...sel.options].some((o) => /^\s*500\s*$/.test(o.textContent) || o.value === '500'));
    if (select) {
      const option = [...select.options].find((o) => /^\s*500\s*$/.test(o.textContent) || o.value === '500');
      setValue(select, option.value);
      return true;
    }
    const button = [...document.querySelectorAll('button, [role="option"], li, a, span')]
      .find((el) => visible(el) && textOf(el) === '500' && !el.closest('.s1826p'));
    if (button) { button.click(); return true; }
    return false;
  }

  /** Один пропуск. null — оформлен, иначе текст ошибки. */
  async function createPass(label, from, to) {
    const { name, plate } = splitLabel(label);
    const newButton = buttonByText(document, 'Новый посетитель');
    if (!newButton) return 'не нашёл кнопку «Новый посетитель»';
    newButton.click();

    const modal = await waitFor(findModal, 5000);
    if (!modal) return 'не открылось окно «Добавить нового посетителя»';
    await sleep(50);

    const dates = [...modal.querySelectorAll('input[type="date"]')].filter(visible);
    if (dates.length < 2) return 'не нашёл поля дат';
    const fio = inputByLabel(modal, /^ФИО(?![А-Яа-яЁё])/) ||
      [...modal.querySelectorAll('input[type="text"], input:not([type])')]
        .find((i) => visible(i) && !/\+7|X999|000/.test(i.placeholder || ''));
    if (!fio) return 'не нашёл поле ФИО';

    // Сайт не принимает «с» позже текущего «по» (в окне оба стоят на сегодня) и откатывает значение:
    // «по», «с», и ещё раз «по» на случай прошедших дат
    setValue(dates[1], to);
    setValue(dates[0], from);
    setValue(dates[1], to);
    setValue(fio, name);
    if (plate) {
      const number = [...modal.querySelectorAll('input')].find((i) => visible(i) && /999/.test(i.placeholder || '') && !/\+7/.test(i.placeholder || ''));
      const region = [...modal.querySelectorAll('input')].find((i) => visible(i) && (i.placeholder || '') === '000');
      if (!number || !region) return 'не нашёл поля номера машины';
      setValue(number, plate.number);
      setValue(region, plate.region);
      await sleep(50);
      if (number.value.toUpperCase() !== plate.number || region.value !== plate.region) return `номер ${plate.number} ${plate.region} не вписался`;
    }
    await sleep(50);
    if (fio.value !== name) return 'ФИО не вписалось в поле';
    if (dates[0].value !== from || dates[1].value !== to) return 'даты не вписались';

    const save = buttonByText(modal, 'Сохранить');
    if (!save) return 'не нашёл кнопку «Сохранить»';
    save.click();

    // Успех — окно закрылось. Осталось открытым — показываем, что пишет сайт, и закрываем.
    if (await waitFor(() => !findModal(), 10000)) return null;
    const m = findModal();
    const error = m && modalError(m);
    const cancel = m && buttonByText(m, 'Отмена');
    if (cancel) cancel.click();
    return error ? `сайт ответил: ${error}` : 'окно не закрылось после «Сохранить»';
  }

  /**
   * Оформить всех по очереди. На первой ошибке останавливаемся: что-то на странице не так,
   * дальше вслепую не идём. `report(results)` вызывается после каждого имени.
   */
  async function runBatch(names, from, to, report, shouldStop = () => false) {
    const results = {};
    for (const name of names) {
      if (shouldStop()) break;
      const listed = await alreadyListed(name, from, to);
      if (listed === null) {
        // Не знаем, есть ли пропуск: создавать вслепую нельзя — можно получить дубль
        results[name] = 'err:список посетителей не обновился, проверить дубль не удалось — ничего не создано';
        await report(results);
        break;
      }
      if (listed) { results[name] = 'skip'; await report(results); continue; }
      results[name] = 'work';
      await report(results);
      const error = await createPass(name, from, to);
      results[name] = error ? `err:${error}` : 'ok';
      await report(results);
      if (error) break;
      await sleep(150);
    }
    return results;
  }

  const JOB_KEY = 's1826-job-id';
  const JUMP_KEY = 's1826-job-jumped';
  function readSession(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } }
  function writeSession(key, value) { try { sessionStorage.setItem(key, value); } catch (e) { /* без него вкладка просто не продолжит после перезагрузки */ } }

  const onGuestsPage = () => /\/account\/\d+\/guests/.test(location.pathname);

  async function avanguardMain() {
    try { performance.setResourceTimingBufferSize(2000); } catch (e) { /* по умолчанию 250 — хватает на пару десятков имён */ }
    // Запоминаем адрес страницы посетителей — Bitrix откроет именно его
    const rememberUrl = () => {
      if (onGuestsPage()) store.set('guestsUrl', location.origin + location.pathname);
    };

    // Вкладка, открытая из Bitrix с заданием
    const jobMatch = /#s1826-job=([\w-]+)/.exec(location.hash);
    {
      const job = await store.get('job', null);
      // Адрес с #s1826-job мог потеряться при загрузке: тогда берём свежее ничьё задание, если вкладка фоновая
      const fresh = job && !job.taken && Date.now() - (job.createdAt || 0) < 45000 && document.hidden;
      // Сайт на секунду уходит на /login и теряет хвост адреса; если мы сами перезагрузили вкладку — продолжаем своё задание
      const resumed = job && job.taken && readSession(JOB_KEY) === job.id &&
        !(await store.get(`result:${job.id}`, {})).done;
      if (job && ((!job.taken && ((jobMatch && job.id === jobMatch[1]) || fresh)) || resumed)) {
        if (!resumed) {
          await store.set('job', { ...job, taken: true });
          await store.set(`result:${job.id}`, { done: false, started: true, results: {} });
          writeSession(JOB_KEY, job.id);
        }
        // Хвост адреса с заданием убираем только на странице посетителей: на /login это ломает возврат роутера сайта
        const cleanHash = () => { if (onGuestsPage() && location.hash) history.replaceState(history.state, '', location.pathname + location.search); };
        const guestsUrl = await store.get('guestsUrl', DEFAULT_GUESTS_URL);
        const started = Date.now();
        let jumped = readSession(JUMP_KEY) === job.id;
        const ready = await waitFor(() => {
          cleanHash();
          // Прошло 10 с, а страницы посетителей нет (фоновая вкладка застряла после /login) — идём на неё сами, один раз
          if (!onGuestsPage() && !jumped && Date.now() - started > 10000) {
            jumped = true;
            writeSession(JUMP_KEY, job.id);
            location.href = guestsUrl;
          }
          return onGuestsPage() && buttonByText(document, 'Новый посетитель');
        }, 30000, 300);
        if (!ready) {
          await store.set(`result:${job.id}`, { done: true, error: `Страница посетителей не открылась (вкладка Авангарда на ${location.pathname}) — войдите в Авангард и попробуйте снова`, results: {} });
          return;
        }
        rememberUrl();
        document.title = '⏳ Пропуска… ' + document.title;
        const results = await runBatch(job.names, job.from, job.to,
          (r) => store.set(`result:${job.id}`, { done: false, results: r }),
          () => false);
        await store.set(`result:${job.id}`, { done: true, results });
        document.title = document.title.replace(/^⏳ Пропуска… /, '✓ ');
        setTimeout(() => window.close(), 1500); // если Bitrix не закрыл вкладку сам
        return;
      }
    }

    // Обычная вкладка Авангарда — своя панель на странице посетителей
    let mounted = false;
    const sync = () => {
      rememberUrl();
      if (onGuestsPage() && !mounted) { mountAvanguardPanel(); mounted = true; }
      const toggle = document.getElementById('s1826p-av-toggle');
      if (toggle) toggle.style.display = onGuestsPage() ? '' : 'none';
    };
    sync();
    setInterval(sync, 1000);
  }

  function mountAvanguardPanel() {
    addStyle(PANEL_CSS);
    let stop = false;
    buildPanel({
      id: 's1826p-av',
      toggleText: 'Пропуска списком',
      single: true,
      defaultDate: isoDate(addDays(new Date(), 1)),
      position: { toggle: { right: '20px', bottom: '20px' }, panel: { right: '20px', bottom: '70px' } },
      async onStart(ui) {
        if (ui.running) { stop = true; ui.start.textContent = 'Останавливаю…'; return; }
        const { names } = parseNames(ui.area.value);
        const from = ui.from.value;
        const to = from;
        if (!(await ui.confirm(`Оформить ${names.length} чел. на ${periodText(from, to)}?`, names))) return;
        stop = false;
        ui.setRunning(true, 'Стоп');
        const results = await runBatch(names, from, to, (r) => ui.showStatus(names, r), () => stop);
        ui.setRunning(false);
        // В поле остаются только неоформленные — можно поправить и запустить снова
        ui.area.value = names.filter((n) => results[n] !== 'ok' && results[n] !== 'skip').join('\n');
        ui.refresh();
      },
    });
  }

  // ── Bitrix24: кнопка «Пропуск» ──────────────────────────────────────────────

  // Значок «🎫» встраивается в окно ввода сообщения — только в открытых линиях:
  // ряд значков .bx-imol-textarea-buttons (CRM-формы, Быстрые ответы, …) есть только у линий.
  // Окно ввода перерисовывается при смене диалога, поэтому следим за страницей и вставляем заново.
  const LINES_BUTTONS = '.bx-imol-textarea-buttons';

  function bitrixMain() {
    addStyle(PANEL_CSS + `
      .s1826p-btn { display: inline-flex; align-items: center; gap: 4px; height: 24px; margin-left: 6px; padding: 0 10px;
        border: 1px solid rgba(31,111,235,.35); border-radius: 12px; background: rgba(31,111,235,.08); color: #1f6feb;
        font: 600 12px system-ui; white-space: nowrap; cursor: pointer; }
      .s1826p-btn:hover { background: rgba(31,111,235,.16); }
    `);
    let ui = null;
    const panel = () => ui || (ui = createBitrixPanel());

    const inject = () => {
      for (const row of document.querySelectorAll(LINES_BUTTONS)) {
        if (row.querySelector('.s1826p-btn')) continue;
        const wrap = document.createElement('span');
        const icon = document.createElement('button');
        icon.type = 'button';
        icon.className = 's1826p-btn';
        icon.title = `Оформить пропуска в Авангарде списком (v${VERSION})`;
        icon.textContent = '🎫 Оформить пропуск';
        icon.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const p = panel(); if (p) p.openAt(icon); });
        wrap.appendChild(icon);
        row.appendChild(wrap);
      }
      // Ушли из линий — панель закрываем (если она не работает)
      if (ui && !ui.running && !document.querySelector(LINES_BUTTONS)) ui.panel.classList.remove('open');
    };
    inject();
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; inject(); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  function createBitrixPanel() {
    return buildPanel({
      id: 's1826p-bx',
      toggleText: null,
      single: true,
      defaultDate: isoDate(addDays(new Date(), 1)),
      position: { panel: {} },
      async onStart(ui) {
        if (ui.running) return;
        const { names } = parseNames(ui.area.value);
        const date = ui.from.value;
        if (!(await ui.confirm(`Оформить пропуска на ${humanDate(date)}?`, names))) return;

        const job = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), names, from: date, to: date, createdAt: Date.now() };
        await store.set('job', job);
        await store.set(`result:${job.id}`, { done: false, results: {} });
        const url = await store.get('guestsUrl', DEFAULT_GUESTS_URL);
        const tab = await openBackgroundTab(`${url}#s1826-job=${job.id}`);

        ui.setRunning(true, 'Оформляю в Авангарде…');
        ui.showStatus(names, {});
        // Ждём результаты; если вкладка Авангарда 60 с ничего не сообщает — сдаёмся
        let lastChange = Date.now();
        let lastSeen = '';
        let last = null;
        for (;;) {
          await sleep(700);
          const res = await store.get(`result:${job.id}`, null);
          const seen = JSON.stringify(res);
          if (seen !== lastSeen) { lastSeen = seen; lastChange = Date.now(); }
          if (res) { ui.showStatus(names, res.results || {}); last = res; }
          if (res && res.done) break;
          if (Date.now() - lastChange > 60000) {
            const j = await store.get('job', null);
            const started = j && j.id === job.id && j.taken;
            last = { ...(res || {}), done: true,
              error: started
                ? 'Вкладка Авангарда запустилась, но 60 с ничего не сообщает. Откройте её и посмотрите, что на странице.'
                : 'Вкладка Авангарда не запустила скрипт (задание не взято). Проверьте, что скрипт включён для my.avanguard.pro и вы вошли в аккаунт, и запустите снова.' };
            break;
          }
        }
        // Фоновая вкладка Авангарда больше не нужна
        try { if (tab && tab.close) tab.close(); } catch (e) { /* закроется сама или останется */ }
        ui.setRunning(false);
        const results = (last && last.results) || {};
        const left = names.filter((n) => results[n] !== 'ok' && results[n] !== 'skip');
        ui.area.value = left.join('\n');
        ui.refresh();
        ui.summary.textContent = last && last.error
          ? last.error
          : left.length ? `Не оформлено: ${left.length}. Остались в поле — можно запустить снова.` : 'Готово: все пропуска оформлены.';
      },
    });
  }

  /**
   * Фоновая вкладка: Chrome не вызывает requestAnimationFrame, и сайт (React) не перерисовывает таблицу и окна.
   * Подмена через unsafeWindow до страницы не доходит (скрипт в своём мире), поэтому вставляем её тегом <script>
   * в мир страницы — как можно раньше, до старта сайта. CSP у Авангарда нет.
   */
  function patchAnimationFrameInPage() {
    const code = `(function () {
      var raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
      var timers = new Set();
      window.requestAnimationFrame = function (cb) {
        if (!document.hidden) return raf(cb);
        var id = setTimeout(function () { timers.delete(id); cb(performance.now()); }, 16);
        timers.add(id);
        return id;
      };
      window.cancelAnimationFrame = function (id) {
        if (timers.has(id)) { timers.delete(id); clearTimeout(id); } else caf(id);
      };
    })();`;
    try {
      const tag = document.createElement('script');
      tag.textContent = code;
      (document.head || document.documentElement).appendChild(tag);
      tag.remove();
    } catch (e) { /* без подмены фоновая вкладка просто медленнее */ }
  }

  const whenReady = (fn) => (document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true }) : fn());

  if (location.hostname === 'my.avanguard.pro') {
    patchAnimationFrameInPage();
    whenReady(avanguardMain);
  } else {
    whenReady(bitrixMain);
  }
})();
