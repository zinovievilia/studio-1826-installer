// ==UserScript==
// @name         v1.2.0 Studio 1826 — Пропуска списком (Авангард)
// @namespace    studio1826
// @version      1.2.0
// @description  Кнопка «Оформить пропуск» в окне ввода открытых линий Bitrix24: список ФИО + дата → пропуска в Авангарде оформляются по очереди
// @updateURL    https://raw.githubusercontent.com/zinovievilia/studio-1826-installer/main/studio1826-passes.user.js
// @downloadURL  https://raw.githubusercontent.com/zinovievilia/studio-1826-installer/main/studio1826-passes.user.js
// @match        https://1826studio.bitrix24.ru/*
// @match        https://my.avanguard.pro/*
// @run-at       document-idle
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

  const VERSION = '1.2.0';
  const DEFAULT_GUESTS_URL = 'https://my.avanguard.pro/account/354/guests';

  // ── Чистые функции (тесты: tests/passes.test.js) ───────────────────────────

  /** Список ФИО из вставленного текста: по строке (или через «;» и «,»), без нумерации, пробелов и повторов. */
  function parseNames(text) {
    const names = [];
    const duplicates = [];
    const seen = new Set();
    for (const raw of String(text || '').split(/[\n;,]+/)) {
      const name = raw
        .replace(/^\s*(?:\d+\s*[.)]|[-–—•*])\s*/, '') // «1.», «2)», «-», «•»
        .replace(/[\t ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!name) continue;
      const key = normalize(name);
      if (seen.has(key)) { duplicates.push(name); continue; }
      seen.add(key);
      names.push(name);
    }
    return { names, duplicates };
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

  /** Строка таблицы посетителей — уже оформленный пропуск на этого человека с этой даты? */
  function rowMatches(rowText, name, fromIso) {
    const row = normalize(rowText);
    if (!row.includes(normalize(name))) return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromIso || '');
    if (!m) return false;
    const [, y, mo, d] = m;
    return [`${d}.${mo}.${y}`, `${d}.${mo}.${y.slice(2)}`, `${y}-${mo}-${d}`].some((v) => row.includes(v));
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseNames, isoDate, addDays, humanDate, periodText, rowMatches, VERSION };
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
  `;

  /** Панель: список ФИО + даты + кнопка. `single` — одна дата вместо «с/по». */
  function buildPanel({ id, toggleText, position, single, defaultDate, onStart }) {
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
      <h3><span>Оформить пропуска</span><button class="close" title="Свернуть">✕</button></h3>
      <div class="hint">ФИО — по одному на строку. Нумерация, запятые и пустые строки уберутся сами.</div>
      <textarea placeholder="Воронцова Лилия Эдуардовна&#10;Хван Валерия Алексеевна"></textarea>
      <div class="row">
        <label>${single ? 'Дата' : 'С'} <input type="date" class="from" value="${defaultDate}"></label>
        ${single ? '' : `<label>По <input type="date" class="to" value="${defaultDate}"></label>`}
      </div>
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
      const { names, duplicates } = parseNames(ui.area.value);
      if (ui.to.value < ui.from.value) ui.to.value = ui.from.value;
      ui.summary.textContent = names.length
        ? `${names.length} чел. на ${periodText(ui.from.value, ui.to.value)}` +
          (duplicates.length ? ` · повторы убраны: ${duplicates.length}` : '')
        : '';
      ui.start.disabled = names.length === 0 || !ui.from.value;
      ui.start.textContent = names.length ? `Оформить: ${names.length} чел.` : 'Оформить';
    };
    ui.area.addEventListener('input', ui.refresh);
    ui.from.addEventListener('change', ui.refresh);
    ui.to.addEventListener('change', ui.refresh);

    ui.setRunning = (running, label) => {
      ui.running = running;
      ui.area.disabled = ui.from.disabled = ui.to.disabled = running;
      if (running) ui.start.textContent = label || 'Стоп'; else ui.refresh();
    };

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

  /** Уже есть в таблице посетителей на эту дату? (по тексту строк; если формат дат другой — просто не находит) */
  function alreadyListed(name, from) {
    return [...document.querySelectorAll('tr, [role="row"]')].some((row) => rowMatches(textOf(row), name, from));
  }

  /** Один пропуск. null — оформлен, иначе текст ошибки. */
  async function createPass(name, from, to) {
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

    setValue(dates[0], from);
    setValue(dates[1], to);
    setValue(fio, name);
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
      if (alreadyListed(name, from)) { results[name] = 'skip'; await report(results); continue; }
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

  const onGuestsPage = () => /\/account\/\d+\/guests/.test(location.pathname);

  async function avanguardMain() {
    // Запоминаем адрес страницы посетителей — Bitrix откроет именно его
    const rememberUrl = () => {
      if (onGuestsPage()) store.set('guestsUrl', location.origin + location.pathname);
    };

    // Вкладка, открытая из Bitrix с заданием
    const jobMatch = /#s1826-job=([\w-]+)/.exec(location.hash);
    if (jobMatch) {
      const job = await store.get('job', null);
      if (job && job.id === jobMatch[1] && !job.taken) {
        await store.set('job', { ...job, taken: true });
        // Вкладка в фоне: Chrome не вызывает requestAnimationFrame, а окна сайта открываются с анимацией.
        // Подменяем на таймер, чтобы окно «Новый посетитель» появлялось и в фоновой вкладке.
        try {
          const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
          page.requestAnimationFrame = (cb) => page.setTimeout(() => cb(page.performance.now()), 16);
          page.cancelAnimationFrame = (id) => page.clearTimeout(id);
        } catch (e) { /* не вышло — сработает, когда вкладку откроют */ }
        history.replaceState(null, '', location.pathname + location.search);
        const ready = await waitFor(() => onGuestsPage() && buttonByText(document, 'Новый посетитель'), 30000, 300);
        if (!ready) {
          await store.set(`result:${job.id}`, { done: true, error: 'Страница посетителей не открылась — войдите в Авангард и попробуйте снова', results: {} });
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
      single: false,
      defaultDate: isoDate(new Date()),
      position: { toggle: { right: '20px', bottom: '20px' }, panel: { right: '20px', bottom: '70px' } },
      async onStart(ui) {
        if (ui.running) { stop = true; ui.start.textContent = 'Останавливаю…'; return; }
        const { names } = parseNames(ui.area.value);
        const from = ui.from.value;
        const to = ui.to.value;
        if (!confirm(`Оформить ${names.length} чел. на ${periodText(from, to)}?\n\n${names.join('\n')}`)) return;
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
        icon.title = 'Оформить пропуска в Авангарде списком';
        icon.textContent = '🎫 Оформить пропуск';
        icon.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); panel().openAt(icon); });
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
        if (!confirm(`Оформить пропуска в Авангарде на ${humanDate(date)}?\n\n${names.join('\n')}`)) return;

        const job = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), names, from: date, to: date };
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
            last = { ...(res || {}), done: true,
              error: 'Вкладка Авангарда не отвечает. Проверьте, что вы вошли в my.avanguard.pro, и запустите снова.' };
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

  if (location.hostname === 'my.avanguard.pro') avanguardMain();
  else bitrixMain();
})();
