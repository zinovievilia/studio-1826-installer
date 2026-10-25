// ==UserScript==
// @name         v1.5.0 Studio 1826 — Пропуска списком (Авангард)
// @namespace    studio1826
// @version      1.5.0
// @description  Кнопка «Оформить пропуск» в окне ввода открытых линий Bitrix24: список ФИО + дата → пропуска в Авангарде оформляются по очереди с проверкой; в Авангарде — кнопка «Пропуска списком» и часы машин за сегодня
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
//   эта вкладка оформляет пропуска по одному (запросом к API сайта, как кнопка «Сохранить») и пишет результат
//   по каждому имени → Bitrix показывает ✓/✗. «Оформлен» — только когда новый пропуск нашёлся в списке сайта.
// Задание берёт только вкладка, открытая с его id, — обычная открытая вкладка Авангарда его не трогает.

(function () {
  'use strict';

  const VERSION = '1.5.0';
  const DEFAULT_GUESTS_URL = 'https://my.avanguard.pro/account/354/guests';

  // ── Чистые функции (тесты: tests/passes.test.js) ───────────────────────────

  // Госномер: буква, 3 цифры, 2 буквы, регион 2–3 цифры. Латиницу клиентов (A123BC) переводим в кириллицу.
  const PLATE_LETTERS = 'АВЕКМНОРСТУХ';
  const LATIN_TO_CYR = { A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М', H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т', Y: 'У', X: 'Х' };
  // Буквы берём любые: клиенты пишут и «Е334аб34». Номер не из 12 «номерных» букв Авангард примет только
  // как «специальный номер» (отдельная галочка в окне) — это решает `plateIsSpecial`.
  const PLATE_IN_TEXT = /(^|[^0-9A-Za-zА-Яа-яЁё])([A-Za-zА-Яа-яЁё])[\s-]*(\d{3})[\s-]*([A-Za-zА-Яа-яЁё]{2})[\s-]*(\d{2,3})(?:\s*RUS)?(?=$|[^0-9A-Za-zА-Яа-яЁё])/i;

  /** «е334ав34», «A 123 BC 777 RUS» → { number: 'Е334АВ', region: '34' }; не номер — null. */
  function parsePlate(text) {
    const m = PLATE_IN_TEXT.exec(' ' + String(text || '') + ' ');
    if (!m) return null;
    const cyr = (s) => s.toUpperCase().split('').map((c) => LATIN_TO_CYR[c] || c).join('');
    return { number: cyr(m[2]) + m[3] + cyr(m[4]), region: m[5] };
  }

  /** В номере есть буквы, которых нет на обычных номерах (Б, Д, латинская D…) — вводим как специальный. */
  function plateIsSpecial(plate) {
    return Boolean(plate) && !new RegExp(`^[${PLATE_LETTERS}]\\d{3}[${PLATE_LETTERS}]{2}$`).test(plate.number);
  }

  /** Подпись строки списка: «Иванов Иван · Е334АВ 34». По ней же скрипт в Авангарде восстанавливает ФИО и номер. */
  function passLabel(name, plate) {
    return plate ? `${name} · ${plate.number} ${plate.region}` : name;
  }

  /** «Иванов Иван · Е334АВ 34» → { name, plate } */
  function splitLabel(label) {
    const m = /^(.*?)\s*·\s*([A-ZА-ЯЁ]\d{3}[A-ZА-ЯЁ]{2})\s+(\d{2,3})$/.exec(String(label || '').trim());
    return m ? { name: m[1], plate: { number: m[2], region: m[3] } } : { name: String(label || '').trim(), plate: null };
  }

  // Отчество: «…овна», «…евич», «…ична»; «оглы/кызы» идут следом отдельным словом
  const PATRONYMIC = /^[А-ЯЁа-яё]+(?:(?:ович|евич|ьич|ич)(?:а|у|ем)?|(?:овн|евн|ичн)(?:а|ы|е|ой|у))$/i; // и в падежах: «…Петровича», «…Эдуардовне»
  const PATRONYMIC_TAIL = /^(?:оглы|кызы|улы|уулу)$/i;
  const PURE_NAME_LINE = /^[A-Za-zА-Яа-яЁё.'’\- ]+$/;

  // Вежливые слова из сообщений клиентов — не люди
  const STOP_PHRASES = /(^|[^А-Яа-яЁёA-Za-z])(добр(?:ый|ого) (?:день|дня|вечер|вечера)|доброе утро|доброго утра|здравствуйте|здравствуй|привет(?:ствую)?|спасибо(?: большое| заранее)?|благодарю|пожалуйста|до свидания|хорошего (?:дня|вечера)|оформите|оформить|оформи|нужен|нужны|нужно|пропуска|пропуск|пропусков|на завтра|на сегодня|вот|список|гости|гостей|участники|участников|на|для|ещё|еще|я|мы|нас|нам|втро[её]м|вдво[её]м|вчетвером|подруга|подруги|друг|друзья|коллега|коллеги|фотограф|визажист|стилист|модель|модели|ассистент|гость|будем|будет|приедем|приедут|приеду|машине|машину|на машине|авто|автомобиль|номер|гос номер|госномер|с уважением|большое|съ[её]мка|съ[её]мки|зал|завтра|сегодня|послезавтра|тел|телефон|бронь|брони|ок|окей|хорошо|ждём|ждем|подскажите|придём|придем|придут|список гостей)(?=$|[^А-Яа-яЁёA-Za-z])/gi;

  /**
   * Сообщение клиента → только содержательное: без приветствий и благодарностей. С `noise` (вставка из выделения
   * или буфера) — ещё без телефонов, почты, ссылок, дат, времени, «Зал 110» и отдельных чисел (номера машин
   * сохраняются); тире между словами — граница, как запятая. Набранное вручную числа не теряет: там они — ошибка.
   */
  function cleanMessage(text, { noise = false } = {}) {
    let s = String(text || '');
    if (!noise) {
      for (let i = 0; i < 3; i++) s = s.replace(STOP_PHRASES, '$1');
      return s.replace(/[!?:«»"]/g, ' ').replace(/[ \t]+$/gm, '').replace(/^[ \t]+/gm, '');
    }
    s = s.replace(/^\s*(?:\d+\s*[.)]|[-–—•*])\s*/gm, ''); // нумерация «1.», «2)», «-»
    // Номера машин прячем, чтобы чистка чисел их не задела
    const plates = [];
    s = s.replace(new RegExp(PLATE_IN_TEXT.source, 'gi'), (m, pre) => {
      plates.push(m.slice(pre.length));
      return `${pre}\u0001${plates.length - 1}\u0002`;
    });
    s = s
      .replace(/(^|[^А-Яа-яЁёA-Za-z])(?:с|до|по|в|к|на|зал|зале|№)(?=\s*\d)/gi, '$1 ') // «с 10:00 до 14:00», «Зал 110»
      .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
      .replace(/\S+@\S+\.\S+/g, ' ')
      .replace(/(?:\+7|8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g, ' ')
      .replace(/\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?/g, ' ')
      .replace(/\d{1,2}:\d{2}/g, ' ')
      // Отдельные числа — шум; «Е33ав34» (смесь букв и цифр) оставляем: это опечатка в номере, её надо показать
      .replace(/(^|[^\dA-Za-zА-Яа-яЁё\u0001])\d+(?![\dA-Za-zА-Яа-яЁё\u0002])/g, '$1 ')
      .replace(/[()]/g, ' ')
      .replace(/\s[-–—]\s/g, ', ');
    for (let i = 0; i < 3; i++) s = s.replace(STOP_PHRASES, '$1'); // подряд идущие («Добрый день, спасибо»)
    s = s
      .replace(/([А-Яа-яЁёA-Za-z]{3,})\.(?=\s|,|$)/g, '$1') // точка в конце фразы, но не у инициалов «В.А.»
      .replace(/(^|\s)\.+(?=\s|$)/g, '$1')
      .replace(/\u0001(\d+)\u0002/g, (m, n) => plates[Number(n)]);
    return s.replace(/[!?:«»"]/g, ' ').replace(/[ \t]+$/gm, '').replace(/^[ \t]+/gm, '');
  }

  /**
   * Клиенты переносят строки посреди ФИО: «Воронцова Лилия Эдуардовна Хван\nВалерия Алексеевна».
   * В подряд идущих строках из одних слов ФИО заканчивается на отчестве (не первым словом: «Шостакович…» — фамилия).
   * Строка без отчества остаётся как есть («Иванов Иван», «Прокопчук»). Обрывок «Хван» склеивается со следующей
   * строкой, только если там отчество и вместе выходит не больше трёх слов. Остальные строки не трогаем.
   */
  function splitByPatronymics(text) {
    const out = [];
    let run = [];
    const flush = () => {
      const names = [];
      let cur = [];
      run.forEach((words, li) => {
        for (let j = 0; j < words.length; j++) {
          cur.push(words[j]);
          if ((cur.length >= 2 && PATRONYMIC.test(words[j])) || (cur.length >= 3 && PATRONYMIC_TAIL.test(words[j]))) {
            if (PATRONYMIC_TAIL.test(words[j + 1] || '')) cur.push(words[++j]);
            names.push(cur); cur = [];
          }
        }
        if (!cur.length) return;
        const next = run[li + 1] || [];
        const k = next.findIndex((w) => PATRONYMIC.test(w));
        const glue = k >= 0 && cur.length + k + 1 <= 3 && !cur.some((w) => PATRONYMIC.test(w));
        if (!glue) { names.push(cur); cur = []; }
      });
      if (cur.length) names.push(cur);
      out.push(...names.map((n) => n.join(' ')));
      run = [];
    };
    // Запятая и «;» — тоже граница строки, но ФИО через неё может продолжаться («…Хван,\nВалерия Алексеевна»)
    for (const line of text.split('\n')) {
      for (const seg of line.split(/[,;]/)) {
        const bare = seg.replace(/^\s*(?:\d+\s*[.)]|[-–—•*])\s*/, '').trim();
        if (!bare) continue;
        if (PURE_NAME_LINE.test(bare)) run.push(bare.split(/\s+/));
        else { flush(); out.push(seg.trim()); }
      }
    }
    flush();
    return out.join('\n');
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
    for (const raw of splitByPatronymics(cleanMessage(String(text || '').replace(/[ \t]+и[ \t]+/gi, '\n'))).split(/[\n;,]+/)) {
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
      entries.push({ name: properName(piece), plate });
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
    // Отчество не в именительном («Воронцовой Лилии Эдуардовны») — пропуск выйдет на «кого»: показываем, чтобы поправили
    const oblique = names.filter((l) => /(?:ович|евич|ьич)(?:а|у|ем)(?:\s|$)|(?:овн|евн|ичн)(?:ы|е|ой|у)(?:\s|$)/i.test(splitLabel(l).name));
    return { names, duplicates, invalid, oblique };
  }

  /** «прокопчук юлия», «ХВАН валерия» → «Прокопчук Юлия», «Хван Валерия». Инициалы и смешанный регистр не трогаем. */
  function properName(s) {
    const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    return s.replace(/[A-Za-zА-Яа-яЁё]+/g, (w, i) => {
      if (s.charAt(i + w.length) === '.') return w; // «В.А.»
      if (/^(?:оглы|кызы|улы|уулу)$/i.test(w)) return w.toLowerCase();
      if (w === w.toLowerCase() || (w === w.toUpperCase() && w.length > 1)) return cap(w);
      return w;
    });
  }

  /**
   * Текст для поля из выделения или буфера: оставляем только строки, похожие на ФИО или номер машины
   * («Здравствуйте! Вот список:», время, телефоны отбрасываются). Нет ни одной такой строки — ''.
   */
  const NAME_LIKE = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё.'’\-]*(?: [A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё.'’\-]*){0,3}$/;
  const COMPANY = /(^|\s)(ИП|ООО|ОАО|ЗАО|ПАО|АО|НКО|АНО)(\s|$)/;
  const STATUS_WORD = /^(ушел|ушёл|новый|на месте|архив|разрешить выезд|машина не заезжала|не заезжала|стоит)$/i; // колонки «Статус» и «Сегодня»
  const NAME_PARTICLE = /^(?:оглы|кызы|улы|уулу|ибн|бен|де|фон|ван|ди|да|ла)$/i;
  /** `dropped` (необязательно) — сюда попадут одиночные слова, похожие на фамилию, которые не взяты («для Петрова»). */
  function prefillText(selected, clipboard, dropped = null) {
    for (const raw of [selected, clipboard]) {
      const text = String(raw || '').trim();
      if (!text || text.length > 5000) continue;
      // Выделение из таблицы — ячейки через табуляцию: каждая ячейка отдельно. Названия аккаунтов (ИП, ООО…) не люди.
      const cells = text.split(/[\n\t]+/).filter((line) => !COMPANY.test(line.trim()) && !STATUS_WORD.test(line.trim()));
      // Сначала чистим и делим всё сообщение целиком (ФИО может переходить через строку), потом отбираем строки
      const split = splitByPatronymics(cleanMessage(cells.join('\n').replace(/[ \t]+и[ \t]+/gi, '\n'), { noise: true }));
      const allLower = text === text.toLowerCase();
      const lines = split.split('\n').filter((line) => {
        const { names, invalid } = parseNames(line);
        // Строка с опечаткой в номере остаётся: в поле её видно, «Оформить» не даст запустить, пока не исправят
        if (invalid.length) return /[A-Za-zА-Яа-яЁё]{2,}/.test(line);
        return names.length > 0 && names.every((label) => {
          const { name, plate } = splitLabel(label);
          if (plate && name === 'Машина') return true;
          const words = splitLabel(line.trim()).name.split(/\s+/).filter(Boolean);
          // Одно слово из сообщения — почти всегда не человек («Ок», «Бронь»); исключение — фамилия с инициалами
          if (words.length < 2 && !plate) {
            if (dropped && NAME_LIKE.test(name) && /^[A-ZА-ЯЁ]/.test(words[0] || '')) dropped.push(name);
            return false;
          }
          // В обычном сообщении ФИО пишут с заглавных: «получается с собой паспорт» — не ФИО
          if (!allLower && !words.every((w) => /^[A-ZА-ЯЁ]/.test(w) || NAME_PARTICLE.test(w))) return false;
          return NAME_LIKE.test(name);
        });
      });
      if (lines.length && lines.length <= 50) return lines.map((l) => l.trim()).join('\n');
    }
    return '';
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

  // ── Данные Авангарда (api.avanguard.pro) ───────────────────────────────────

  /** Период одного дня в формате API: местное время без пояса, как отправляет сам сайт. */
  function apiPeriod(iso) {
    return { dateStart: `${iso}T00:00:00`, dateFinish: `${iso}T23:59:59` };
  }

  /** Время из API (UTC; бывает без «Z») → миллисекунды, или NaN. */
  function parseApiTime(value) {
    if (!value) return NaN;
    const s = String(value).trim();
    return Date.parse(/(Z|[+-]\d{2}:?\d{2})$/i.test(s) ? s : `${s.replace(' ', 'T')}Z`);
  }

  /** Начало и конец местного дня «YYYY-MM-DD» в миллисекундах. */
  function dayBounds(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return { start: new Date(y, m - 1, d).getTime(), end: new Date(y, m - 1, d + 1).getTime() - 1 };
  }

  /** Пропуск из API действует хотя бы часть дня `iso`. */
  function guestCoversDay(guest, iso) {
    const { start, end } = dayBounds(iso);
    const from = parseApiTime(guest.dateStart);
    const to = parseApiTime(guest.dateFinish);
    return !Number.isNaN(from) && !Number.isNaN(to) && from <= end && to >= start;
  }

  const plateKey = (number, region) => `${String(number || '').toUpperCase().replace(/\s+/g, '')} ${String(region || '').trim()}`.trim();

  /** Пропуска того же человека (и той же машины, если она указана) на этот день, без архивных. */
  function matchingPasses(guests, name, iso, plate = null) {
    return (guests || []).filter((g) => !g.isArchived &&
      normalize(g.name || '') === normalize(name) &&
      guestCoversDay(g, iso) &&
      (!plate || plateKey(g.carNumber, g.carRegion) === plateKey(plate.number, plate.region)));
  }

  /** Пропуска для строки таблицы: то же ФИО (ячейка целиком) и тот же номер машины, если он есть. */
  function guestsForRow(nameText, carText, guests) {
    const name = normalize(nameText);
    const car = normalize(carText).replace(/\s+/g, '');
    return [...guests].filter((g) => g && g.name && normalize(g.name) === name &&
      (g.carNumber ? car.includes(normalize(g.carNumber).replace(/\s+/g, '')) : !/\d/.test(car)));
  }

  /** Событие журнала проходов → 'in' (въезд) | 'out' (выезд) | null. Учитываем только машины: «Въезд/Выезд». */
  function eventKind(event) {
    const name = String((event && event.eventName) || '').toLowerCase();
    if (/выезд/.test(name)) return 'out';
    if (/въезд/.test(name)) return 'in';
    if (name) return null;
    // Без названия — по коду: 21, 23 … 37 въезд, 22, 24 … 38 выезд
    const code = Number(event && event.event);
    if (code >= 21 && code <= 38) return code % 2 ? 'in' : 'out';
    return null;
  }

  /**
   * Сколько машина стояла за день: пары «въезд → выезд» внутри дня [dayStart, now].
   * Стоит сейчас — считаем до `now`. Выезд без въезда за день — заехала раньше: считаем с начала дня.
   * → { ms, inside, seen } (seen — были ли события за этот день)
   */
  function parkedTime(events, dayStart, now) {
    const list = (events || [])
      .map((e) => ({ t: parseApiTime(e.time), kind: eventKind(e) }))
      .filter((e) => e.kind && !Number.isNaN(e.t) && e.t <= now)
      .sort((a, b) => a.t - b.t);
    let inside = null;
    let known = false; // знаем ли, где была машина до текущего события
    let ms = 0;
    let seen = false;
    for (const e of list) {
      if (e.t < dayStart) { inside = e.kind === 'in' ? dayStart : null; known = true; continue; }
      seen = true;
      if (e.kind === 'in') { if (inside === null) inside = e.t; }
      else if (inside !== null) { ms += e.t - inside; inside = null; }
      else if (!known) ms += e.t - dayStart;
      known = true;
    }
    if (inside !== null) ms += now - inside;
    return { ms, inside: inside !== null, seen: seen || inside !== null };
  }

  /** 8100000 → «2 ч 15 мин», 2700000 → «45 мин» */
  function formatDuration(ms) {
    const minutes = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? `${h} ч${m ? ` ${m} мин` : ''}` : `${m} мин`;
  }

  /** Код для мира страницы (см. patchPageWorld). Это шаблонная строка: «\/» в ней теряет «\», поэтому без регулярок. Тест проверяет разбор. */
  function pageWorldCode() {
    return `(function () {
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
      // Ответ сайта со списком посетителей — копия для колонки «Сегодня» (строки таблицы идут в его порядке)
      var isGuests = function (url) { return String(url).indexOf('/api/guests?') >= 0; };
      var post = function (url, text) {
        try { window.dispatchEvent(new CustomEvent('s1826-guests', { detail: JSON.stringify({ url: url, text: text }) })); } catch (e) {}
      };
      var origFetch = window.fetch;
      if (origFetch) window.fetch = function (input) {
        var p = origFetch.apply(this, arguments);
        try {
          var url = String((input && input.url) || input);
          if (isGuests(url)) p.then(function (r) { r.clone().text().then(function (t) { post(url, t); }, function () {}); }, function () {});
        } catch (e) {}
        return p;
      };
      var open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) { this.__s1826url = String(url); return open.apply(this, arguments); };
      XMLHttpRequest.prototype.send = function () {
        var xhr = this;
        if (isGuests(xhr.__s1826url || '')) xhr.addEventListener('load', function () {
          try {
            var t = xhr.responseType === '' || xhr.responseType === 'text' ? xhr.responseText : JSON.stringify(xhr.response);
            post(xhr.responseURL || xhr.__s1826url, t);
          } catch (e) {}
        });
        return send.apply(this, arguments);
      };
    })();`;
  }

  /**
   * Случайный ответ «пропуск готов», не такой, как прошлый. Примерно в трети случаев (если `link` есть) — с адресом
   * и случайной подводкой к нему.
   */
  function pickDoneMessage(pool, last, link, intros = [], rnd = Math.random) {
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    for (let i = 0; i < 10; i++) {
      let text = pick(pool);
      if (link && intros.length && rnd() < 0.35) text += `\n\n${pick(intros)}\n${link}`;
      if (text !== last || pool.length < 2) return text;
    }
    return pool.find((m) => m !== last) || pool[0];
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseNames, cleanMessage, splitByPatronymics, properName, prefillText, isoDate, addDays, humanDate, periodText, parsePlate, plateIsSpecial, passLabel, splitLabel,
      apiPeriod, parseApiTime, dayBounds, guestCoversDay, matchingPasses, eventKind, parkedTime, formatDuration, guestsForRow, pageWorldCode, pickDoneMessage, VERSION };
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

  /** Выделенный на странице текст на момент нажатия кнопки (к click выделение может пропасть). */
  function keepSelection(button) {
    let text = '';
    const grab = () => { try { text = String(window.getSelection() || ''); } catch (e) { text = ''; } };
    button.addEventListener('pointerdown', grab);
    button.addEventListener('mousedown', grab);
    return () => text;
  }

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
    /**
     * Список сразу в поле: выделенный текст (заменяет то, что в поле) или, если поле пустое, скопированный.
     * Берём, только если там узнаются ФИО/номера. Ничего не оформляется — дальше обычное «Оформить» и подтверждение.
     */
    ui.prefill = async (selected) => {
      if (ui.running) return;
      let clip = '';
      let clipNote = '';
      const dropped = [];
      if (!prefillText(selected, '') && !ui.area.value.trim()) {
        try {
          clip = await navigator.clipboard.readText();
          if (!prefillText('', clip)) clipNote = 'В буфере нет списка ФИО — вставьте вручную';
        } catch (e) {
          clipNote = 'Буфер: нет доступа (разрешите сайту буфер обмена) — вставьте ⌘V / Ctrl+V';
        }
      }
      const text = prefillText(selected, clip, dropped);
      if (!text) { if (clipNote) ui.summary.textContent = clipNote; return; }
      ui.area.value = text;
      ui.refresh();
      ui.summary.textContent = `${text === prefillText(selected, '') ? 'Взято из выделения' : 'Вставлено из буфера'} · ${ui.summary.textContent}` +
        (dropped.length ? ` · ⚠ не взял (одно слово): ${[...new Set(dropped)].join(', ')} — допишите, если это человек` : '');
    };

    /** Открыть/закрыть над элементом (значок в окне ввода сообщения) */
    ui.openAt = (anchor, selected = '') => {
      if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
      ui.prefill(selected);
      panel.classList.add('open');
      const r = anchor.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, window.innerWidth - panel.offsetWidth - 8));
      Object.assign(panel.style, { left: `${left}px`, right: 'auto', top: 'auto',
        bottom: `${Math.max(8, window.innerHeight - r.top + 8)}px` });
      ui.area.focus();
    };
    /** Открыть/закрыть под кнопкой (кнопка «Пропуска списком» на странице Авангарда) */
    ui.openBelow = (anchor, selected = '') => {
      if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
      ui.prefill(selected);
      panel.classList.add('open');
      const r = anchor.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, window.innerWidth - panel.offsetWidth - 8));
      Object.assign(panel.style, { left: `${left}px`, right: 'auto', bottom: 'auto', top: `${r.bottom + 8}px` });
      ui.area.focus();
    };
    panel.querySelector('.close').addEventListener('click', () => panel.classList.remove('open'));

    ui.refresh = () => {
      if (ui.running) return;
      const { names, duplicates, invalid, oblique } = parseNames(ui.area.value);
      if (ui.to.value < ui.from.value) ui.to.value = ui.from.value;
      ui.summary.textContent = (names.length
        ? `${names.length} чел. на ${periodText(ui.from.value, ui.to.value)}` +
          (duplicates.length ? ` · повторы убраны: ${duplicates.length}` : '')
        : '') + (invalid.length ? ` · не понял номер: ${invalid.join(', ')}` : '') +
        (oblique.length ? ` · ⚠ проверьте падеж (нужно «кто»): ${oblique.join(', ')}` : '');
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

    /** Статусы по именам: results {name: 'ok' | 'work' | 'err:текст'}, info {name: {before}} — сколько пропусков было раньше. */
    ui.showStatus = (names, results = {}, info = {}) => {
      ui.status.innerHTML = '';
      for (const name of names) {
        const r = results[name];
        const before = info[name] && info[name].before;
        const earlier = before === undefined ? '' : before ? ` · раньше на эту дату уже был${before > 1 ? ` (${before})` : ''}` : ' · раньше не было';
        const li = document.createElement('li');
        if (r === 'ok') { li.className = 'ok'; li.textContent = `✓ ${name} — оформлен${earlier}`; }
        else if (r === 'work') { li.className = 'work'; li.textContent = `… ${name}`; }
        else if (r && r.startsWith('err:')) { li.className = 'err'; li.textContent = `✗ ${name} — не оформлен: ${r.slice(4)}${earlier}`; }
        else { li.textContent = name; }
        ui.status.appendChild(li);
      }
    };

    ui.start.addEventListener('click', () => onStart(ui));
    ui.refresh();
    return ui;
  }

  // ── Авангард: оформление через API сайта ───────────────────────────────────
  // Пропуск создаётся тем же запросом, что и кнопка «Сохранить» в окне «Новый посетитель».
  // «Оформлен» пишем только когда новый пропуск нашёлся в списке сайта — сайт сам подтверждает.

  const API_BASE = 'https://api.avanguard.pro/api/';

  function buttonByText(root, text) {
    return [...root.querySelectorAll('button, [role="button"], a')]
      .find((b) => visible(b) && textOf(b) === text && !b.closest('.s1826p'));
  }

  // Сайт берёт номер аккаунта из адреса строкой — так же и мы
  const accountId = () => (/\/account\/(\d+)/.exec(location.pathname) || [])[1] || '354';

  /** Ключ входа сайта (сайт сам кладёт его в localStorage и обновляет). Никуда, кроме API Авангарда, не уходит. */
  function accessToken() {
    let t = null;
    try { t = localStorage.getItem('access_token'); } catch (e) { return null; }
    if (t && t.startsWith('"')) { try { t = JSON.parse(t); } catch (e) { /* как есть */ } }
    return t || null;
  }

  async function api(path, { method = 'GET', body } = {}) {
    const token = accessToken();
    if (!token) throw new Error('нет входа в Авангард — войдите на сайте');
    let res;
    try {
      res = await fetch(API_BASE + path, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new Error('Авангард не отвечает (нет связи с api.avanguard.pro)');
    }
    if (res.status === 401) throw new Error('Авангард не пустил (вход устарел) — обновите страницу Авангарда');
    let data = null;
    try { data = await res.json(); } catch (e) { /* не JSON */ }
    if (data && data.error) throw new Error(`сайт ответил: ${data.errorDescription || 'ошибка'}`);
    if (!res.ok) throw new Error(`сайт ответил кодом ${res.status}`);
    return data;
  }

  /** Пропуска на день `iso` по фамилии (поиск сайта), со всего аккаунта. */
  async function guestsOnDay(iso, search, pageSize = 500) {
    const p = apiPeriod(iso);
    const q = new URLSearchParams({ accountId: accountId(), dateStart: p.dateStart, dateFinish: p.dateFinish,
      search, mine: 'false', onlyCars: 'false', showArchived: 'false', sort: '', pageIndex: '1', pageSize: String(pageSize) });
    const data = await api(`guests?${q}`);
    return (data && data.result) || [];
  }

  /** Связь с Авангардом: вход есть и список отвечает. null — всё хорошо, иначе текст ошибки. */
  async function checkAvanguard(iso) {
    try { await guestsOnDay(iso, '', 1); return null; } catch (e) { return e.message; }
  }

  /**
   * Один пропуск. → { ok: true, before, id } или { error, before? }.
   * before — сколько пропусков на этот день у человека было до оформления.
   */
  async function createPass(label, iso, stage) {
    const { name, plate } = splitLabel(label);
    const search = name.split(' ')[0];
    let before;
    try {
      await stage('проверяю, был ли пропуск');
      before = matchingPasses(await guestsOnDay(iso, search), name, iso, plate);
      // Как кнопка «Сохранить»: даты — начало и конец местного дня в UTC; спецномер — тот же carNumber без маски
      const { start, end } = dayBounds(iso);
      const body = { accountId: accountId(), name, type: 'full',
        dateStart: new Date(start).toISOString(), dateFinish: new Date(end - 999).toISOString(), login: '' };
      if (plate) Object.assign(body, { carNumber: plate.number, carRegion: plate.region });
      await stage('оформляю');
      const created = await api('guests', { method: 'POST', body });
      const r = created && created.result;
      const id = r && typeof r === 'object' ? r.id : r;
      await stage('проверяю, что пропуск появился');
      // Список на сайте обновляется не мгновенно — несколько попыток
      for (let i = 0; i < 4; i++) {
        await sleep(400 + i * 600);
        const after = matchingPasses(await guestsOnDay(iso, search), name, iso, plate);
        const found = id != null && id !== true ? after.some((g) => String(g.id) === String(id))
          : after.some((g) => !before.some((b) => String(b.id) === String(g.id)));
        if (found) return { ok: true, before: before.length, id };
      }
      return { error: 'сайт принял запрос, но пропуска в списке нет — проверьте в Авангарде', before: before.length };
    } catch (e) {
      return { error: e.message, before: before ? before.length : undefined };
    }
  }

  /**
   * Оформить всех по очереди. На первой ошибке останавливаемся. Уже оформленные (`prev`, после перезагрузки вкладки)
   * второй раз не оформляем. `report({results, info, stage})` — после каждого шага.
   */
  async function runBatch(names, iso, report, shouldStop = () => false, prev = {}) {
    const results = { ...(prev.results || {}) };
    const info = { ...(prev.info || {}) };
    for (const name of names) {
      if (results[name] === 'ok') continue;
      if (shouldStop()) break;
      // Дубли не пропускаем: по решению Ильи пропуск оформляется всегда, «был ли раньше» только показываем
      results[name] = 'work';
      const stage = (text) => report({ results, info, stage: `${name}: ${text}` });
      const r = await createPass(name, iso, stage);
      results[name] = r.ok ? 'ok' : `err:${r.error}`;
      if (r.before !== undefined) info[name] = { before: r.before };
      await report({ results, info, stage: '' });
      if (!r.ok) break;
    }
    return { results, info };
  }

  /** Ждём, пока сайт сам загрузит список (и при необходимости обновит вход) — тогда ключ свежий. */
  const siteLoadedGuests = () => performance.getEntriesByType('resource')
    .some((e) => /api\.avanguard\.pro\/api\/guests\?/.test(e.name));

  const JOB_KEY = 's1826-job-id';
  const JUMP_KEY = 's1826-job-jumped';
  function readSession(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } }
  function writeSession(key, value) { try { sessionStorage.setItem(key, value); } catch (e) { /* без него вкладка просто не продолжит после перезагрузки */ } }

  const onGuestsPage = () => /\/account\/\d+\/guests\/?$/.test(location.pathname);

  async function avanguardMain() {
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
      const prev = job ? await store.get(`result:${job.id}`, {}) : {};
      const resumed = job && job.taken && readSession(JOB_KEY) === job.id && !prev.done;
      if (job && ((!job.taken && ((jobMatch && job.id === jobMatch[1]) || fresh)) || resumed)) {
        const save = (r) => store.set(`result:${job.id}`, r);
        if (!resumed) {
          await store.set('job', { ...job, taken: true });
          await save({ done: false, started: true, results: {}, stage: 'Авангард открылся, жду вход' });
          writeSession(JOB_KEY, job.id);
        }
        // Хвост адреса с заданием убираем только на странице посетителей: на /login это ломает возврат роутера сайта
        const cleanHash = () => { if (onGuestsPage() && location.hash) history.replaceState(history.state, '', location.pathname + location.search); };
        const guestsUrl = await store.get('guestsUrl', DEFAULT_GUESTS_URL);
        const started = Date.now();
        let jumped = readSession(JUMP_KEY) === job.id;
        // Готово, когда сайт сам загрузил список посетителей: значит, вход действует
        const ready = await waitFor(() => {
          cleanHash();
          // Прошло 10 с, а страницы посетителей нет (фоновая вкладка застряла после /login) — идём на неё сами, один раз
          if (!onGuestsPage() && !jumped && Date.now() - started > 10000) {
            jumped = true;
            writeSession(JUMP_KEY, job.id);
            location.href = guestsUrl;
          }
          return onGuestsPage() && accessToken() && siteLoadedGuests();
        }, 30000, 300);
        if (!ready) {
          await save({ ...prev, done: true, error: `Авангард не открыл список посетителей (вкладка на ${location.pathname}) — войдите в Авангард и попробуйте снова` });
          return;
        }
        rememberUrl();
        await save({ ...prev, done: false, stage: 'Авангард: вход есть, проверяю связь' });
        const problem = await checkAvanguard(job.from);
        if (problem) { await save({ ...prev, done: true, error: `Авангард: ${problem}` }); return; }
        document.title = '⏳ Пропуска… ' + document.title;
        const out = await runBatch(job.names, job.from,
          (r) => save({ done: false, ...r }), () => false, prev);
        await save({ done: true, ...out });
        document.title = document.title.replace(/^⏳ Пропуска… /, '✓ ');
        setTimeout(() => window.close(), 1500); // если Bitrix не закрыл вкладку сам
        return;
      }
    }

    // Обычная вкладка Авангарда — кнопка «Пропуска списком» рядом с «Новый посетитель» и часы машин в таблице
    addStyle(PANEL_CSS + PARKING_CSS);
    let ui = null;
    const sync = () => {
      rememberUrl();
      if (!onGuestsPage()) { if (ui) ui.panel.classList.remove('open'); return; }
      if (!ui) ui = createAvanguardPanel();
      injectAvanguardButton(ui);
    };
    sync();
    setInterval(sync, 1000);
    startParkingColumn();
  }

  /** Своя кнопка справа от «+ Новый посетитель», в том же стиле (классы берём у неё). */
  function injectAvanguardButton(ui) {
    if (!ui || document.getElementById('s1826p-av-btn')) return;
    const native = buttonByText(document, 'Новый посетитель');
    if (!native) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 's1826p-av-btn';
    btn.className = native.className;
    btn.title = `Оформить пропуска списком (v${VERSION})`;
    btn.textContent = '🎫 Пропуска списком';
    const selected = keepSelection(btn);
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); ui.openBelow(btn, selected()); });
    // Кнопку сайта не двигаем (ей управляет React) — ставим свою следом. margin-right:auto забирает свободное место
    // панели фильтров (justify-between), и обе кнопки стоят рядом слева, а фильтры остаются справа.
    btn.style.marginLeft = '8px';
    btn.style.marginRight = 'auto';
    native.after(btn);
  }

  function createAvanguardPanel() {
    let stop = false;
    return buildPanel({
      id: 's1826p-av',
      toggleText: null,
      single: true,
      defaultDate: isoDate(addDays(new Date(), 1)),
      position: { panel: {} },
      async onStart(ui) {
        if (ui.running) { stop = true; ui.start.textContent = 'Останавливаю…'; return; }
        const { names } = parseNames(ui.area.value);
        const date = ui.from.value;
        if (!(await ui.confirm(`Оформить ${names.length} чел. на ${humanDate(date)}?`, names))) return;
        stop = false;
        ui.setRunning(true, 'Стоп');
        ui.summary.textContent = 'Авангард: проверяю связь…';
        const problem = await checkAvanguard(date);
        let out = { results: {}, info: {} };
        if (problem) ui.summary.textContent = `Авангард: ${problem}`;
        else {
          out = await runBatch(names, date, (r) => { ui.showStatus(names, r.results, r.info); ui.summary.textContent = r.stage || ''; }, () => stop);
        }
        ui.setRunning(false);
        // В поле остаются только неоформленные — можно поправить и запустить снова
        const left = names.filter((n) => out.results[n] !== 'ok');
        ui.area.value = left.join('\n');
        ui.refresh();
        ui.showStatus(names, out.results, out.info);
        ui.summary.textContent = problem ? `Авангард: ${problem}` : doneText(names, out.results);
      },
    });
  }

  function doneText(names, results) {
    const ok = names.filter((n) => results[n] === 'ok').length;
    return ok === names.length ? `Готово: оформлено ${ok} из ${names.length}, сайт подтвердил каждый.`
      : `Оформлено ${ok} из ${names.length}. Неоформленные остались в поле — можно запустить снова.`;
  }

  // ── Авангард: часы машины на парковке за сегодня ──────────────────────────
  // Колонка «Сегодня» между «Период» и «Статус». Данные — журнал проходов пропуска (то же, что видно,
  // если открыть пропуск: «Въезд/Выезд по распознаванию»), без кликов. Считаем только пропуска на сегодня с машиной.

  const PARKING_CSS = `
    .s1826p-hours { white-space: nowrap; font-size: 13px; color: #374151; }
    .s1826p-hours.inside { color: #1a7f37; font-weight: 600; }
    .s1826p-hours.muted { color: #9ca3af; }
  `;

  /**
   * Все пропуска, которые сайт уже показывал (id → пропуск): ответы ловит скрипт в мире страницы (patchPageWorld).
   * Сайт возвращается к прежним спискам из своего кэша без запроса, поэтому строки ищем по всем известным пропускам.
   */
  const knownGuests = new Map();
  const rememberGuests = (list) => { for (const g of list || []) if (g && g.id != null) knownGuests.set(String(g.id), g); };
  window.addEventListener('s1826-guests', (e) => {
    try {
      const data = JSON.parse(JSON.parse(e.detail).text);
      if (data && Array.isArray(data.result)) rememberGuests(data.result);
    } catch (err) { /* не наш ответ */ }
  });

  // Журнал проходов всего аккаунта за сегодня — одним запросом (по страницам), раз в минуту
  const DAY_LOG_TTL = 60000;
  let dayLog = null; // { at, iso, byGuest: Map(id → events[]) } | { at, error }

  async function todayLog() {
    const iso = isoDate(new Date());
    if (dayLog && dayLog.iso === iso && Date.now() - dayLog.at < DAY_LOG_TTL) return dayLog;
    // Пояс у start/finish не ясен — берём окно шире суток, лишнее отсекает parkedTime по времени
    const p = { start: apiPeriod(isoDate(addDays(new Date(), -1))).dateStart, finish: apiPeriod(isoDate(addDays(new Date(), 1))).dateFinish };
    try {
      const byGuest = new Map();
      for (let page = 1, pages = 1; page <= pages && page <= 10; page++) {
        const q = new URLSearchParams({ subjectAccountId: accountId(), entityType: 'guest', pageIndex: String(page), pageSize: '500', ...p });
        const data = await api(`log/access?${q}`);
        pages = (data && data.paginator && data.paginator.totalPages) || 1;
        for (const ev of (data && data.result) || []) {
          const id = ev.entity && ev.entity.id;
          if (id == null) continue;
          if (!byGuest.has(String(id))) byGuest.set(String(id), []);
          byGuest.get(String(id)).push(ev);
        }
      }
      dayLog = { at: Date.now(), iso, byGuest };
    } catch (e) {
      dayLog = { at: Date.now(), iso, error: e.message };
    }
    return dayLog;
  }

  function startParkingColumn() {
    let busy = false;
    let again = false;
    const run = async () => {
      if (busy) { again = true; return; }
      busy = true;
      try { await fillParkingColumn(); } catch (e) { /* таблица перерисовалась — повторим на следующей перемене */ }
      busy = false;
      if (again) { again = false; schedule(); }
    };
    let timer = null;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 250); };
    new MutationObserver((records) => {
      // Свои вставки не считаем
      if (records.every((r) => [...r.addedNodes, ...r.removedNodes].every((n) => n.nodeType !== 1 || n.classList.contains('s1826p-hours')))) return;
      schedule();
    }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('s1826-guests', schedule);
    setInterval(schedule, DAY_LOG_TTL);
    schedule();
  }

  function guestsTable() {
    return [...document.querySelectorAll('table')].find((t) => {
      const heads = [...t.querySelectorAll('thead th')].map(textOf);
      return heads.includes('Период') && heads.includes('Статус');
    }) || null;
  }

  /** Включена ли галочка фильтра с такой подписью («Только мои», «Показать архивные»). */
  function checkedByLabel(re) {
    const label = [...document.querySelectorAll('label')].find((l) => !l.closest('.s1826p') && re.test(textOf(l)));
    const box = label && (label.querySelector('input[type="checkbox"]') ||
      (label.htmlFor && document.getElementById(label.htmlFor)) ||
      (label.previousElementSibling && label.previousElementSibling.matches('input[type="checkbox"]') && label.previousElementSibling));
    return !!(box && box.checked);
  }

  /** Список, который сейчас на экране: даты «С/ПО» и поиск из полей страницы, все строки одной страницей. */
  let screenFetch = { key: '', at: 0 };
  async function guestsForScreen() {
    const dates = [...document.querySelectorAll('input[type="date"]')].filter((i) => visible(i) && !i.closest('.s1826p, [role="dialog"]'));
    const search = document.querySelector('input[placeholder="Поиск по посетителям"]');
    const today = isoDate(new Date());
    const from = (dates[0] && dates[0].value) || today;
    const to = (dates[1] && dates[1].value) || from;
    const q = new URLSearchParams({ accountId: accountId(), dateStart: apiPeriod(from).dateStart, dateFinish: apiPeriod(to).dateFinish,
      search: (search && search.value.trim()) || '', mine: String(checkedByLabel(/только мои/i)), onlyCars: 'false',
      showArchived: String(checkedByLabel(/архив/i)), sort: '', pageIndex: '1', pageSize: '500' });
    const key = String(q);
    // Тот же запрос не чаще раза в 30 с: строки без пропуска в ответе (чужая разметка) не должны гонять сайт по кругу
    if (screenFetch.key === key && Date.now() - screenFetch.at < 30000) return [];
    screenFetch = { key, at: Date.now() };
    const data = await api(`guests?${q}`);
    return (data && data.result) || [];
  }

  async function fillParkingColumn() {
    if (!onGuestsPage()) return;
    const table = guestsTable();
    if (!table) return;
    const heads = [...table.querySelectorAll('thead th')].filter((th) => !th.classList.contains('s1826p-hours'));
    const periodIdx = heads.findIndex((th) => textOf(th) === 'Период');
    if (periodIdx < 0) return;
    if (!table.querySelector('thead th.s1826p-hours')) {
      const th = document.createElement('th');
      th.className = `${heads[periodIdx].className} s1826p-hours`;
      th.textContent = 'Сегодня';
      th.title = 'Сколько машина стояла на парковке сегодня (по въездам и выездам) — скрипт пропусков Studio 1826';
      heads[periodIdx].after(th);
    }
    const nameIdx = heads.findIndex((th) => textOf(th) === 'ФИО');
    const carIdx = heads.findIndex((th) => textOf(th) === 'Автомобиль');
    const today = isoDate(new Date());
    const collect = () => {
      const jobs = [];
      let missing = 0;
      for (const tr of table.querySelectorAll('tbody tr')) {
        const cells = [...tr.children].filter((td) => !td.classList.contains('s1826p-hours'));
        if (cells.length <= periodIdx || nameIdx < 0) continue; // строка «нет данных»
        let td = tr.querySelector('td.s1826p-hours');
        if (!td) {
          td = document.createElement('td');
          td.className = `${cells[periodIdx].className} s1826p-hours`;
          cells[periodIdx].after(td);
        }
        const set = (text, cls = '') => {
          if (td.textContent !== text) td.textContent = text;
          td.className = td.className.replace(/\s*(inside|muted)\b/g, '') + (cls ? ` ${cls}` : '');
        };
        const guests = guestsForRow(textOf(cells[nameIdx]), carIdx >= 0 ? textOf(cells[carIdx]) : '', knownGuests.values());
        if (!guests.length) { missing++; set('…', 'muted'); continue; }
        const onToday = guests.filter((g) => g.carNumber && guestCoversDay(g, today));
        if (!onToday.length) { set('', 'muted'); continue; }
        jobs.push({ guests: onToday, set });
      }
      return { jobs, missing };
    };
    let { jobs, missing } = collect();
    if (missing) {
      // Строки нет среди известных пропусков — сами запрашиваем то, что сейчас на экране
      rememberGuests(await guestsForScreen());
      ({ jobs, missing } = collect());
      if (missing) for (const td of table.querySelectorAll('tbody td.s1826p-hours.muted')) if (td.textContent === '…') td.textContent = '';
    }
    if (!jobs.length) return;
    const log = await todayLog();
    const dayStart = dayBounds(today).start;
    for (const { guests, set } of jobs) {
      if (log.error) { set('?', 'muted'); continue; }
      // Одна машина на нескольких пропусках сегодня — события всех складываем
      const events = guests.flatMap((g) => log.byGuest.get(String(g.id)) || []);
      const v = parkedTime(events, dayStart, Date.now());
      if (!v.seen) set('не заезжала', 'muted');
      else set(v.inside ? `${formatDuration(v.ms)} · стоит` : formatDuration(v.ms), v.inside ? 'inside' : '');
    }
  }

  // ── Bitrix24: кнопка «✅ Пропуск готов» — ответ клиенту ────────────────────
  // Вставляет в поле ввода случайную формулировку (не отправляет). Подряд одна и та же не повторяется.

  // Один человек
  const DONE_ONE = [
    'Здравствуйте, пропуск оформили 🤍',
    'Здравствуйте! Пропуск оформлен 🤍',
    'Добрый день! Пропуск готов 🤍',
    'Здравствуйте, пропуск уже оформлен, ждём вас 🤍',
    'Добрый день, пропуск оформили, до встречи в студии 🤍',
    'Здравствуйте! Всё готово, пропуск оформлен 🤍',
    'Здравствуйте, оформили пропуск. Ждём вас 🤍',
    'Добрый день! Оформили пропуск, всё в силе 🤍',
    'Здравствуйте! Пропуск на вас оформлен 🤍',
    'Добрый день! Пропуск оформлен, ждём вас в студии 🤍',
    'Здравствуйте! Готово: пропуск оформили 🤍',
    'Здравствуйте, всё сделали: пропуск оформлен 🤍',
    'Добрый день, пропуск на ваше имя оформлен 🤍',
    'Здравствуйте! Пропуск оформлен, хорошей съёмки 🤍',
    'Здравствуйте, пропуск готов. Хорошей съёмки 🤍',
    'Добрый день! Пропуск оформили, будем рады вас видеть 🤍',
    'Добрый день! Пропуск уже в системе, ждём вас 🤍',
    'Здравствуйте! Пропуск внесли, всё готово 🤍',
    'Добрый день, пропуск оформлен. До встречи 🤍',
    'Здравствуйте! Пропуск оформлен, до встречи 🤍',
    'Здравствуйте, сделали пропуск, всё готово к вашему приходу 🤍',
    'Добрый день! Всё оформили, пропуск ждёт вас 🤍',
    'Здравствуйте, пропуск оформлен на нужную дату 🤍',
    'Добрый день! Пропуск на указанную дату оформлен 🤍',
    'Здравствуйте! Оформили пропуск на нужный день 🤍',
    'Здравствуйте, готово! Пропуск оформлен 🤍',
    'Добрый день, готово, пропуск оформили 🤍',
    'Здравствуйте! Пропуск оформлен, приятной работы в студии 🤍',
    'Добрый день! Пропуск сделали, хорошего дня 🤍',
    'Здравствуйте! Пропуск оформлен, хорошего дня 🤍',
    'Здравствуйте, пропуск оформили, спасибо, что написали заранее 🤍',
    'Добрый день! Спасибо, пропуск оформлен 🤍',
    'Здравствуйте! Спасибо за данные, пропуск оформили 🤍',
    'Здравствуйте, спасибо! Пропуск готов 🤍',
    'Добрый день! Получили данные, пропуск оформили 🤍',
    'Здравствуйте, пропуск оформлен ✨ Ждём вас 🤍',
    'Добрый день! Пропуск готов ✨ До встречи 🤍',
    'Здравствуйте! Пропуск оформили 🙌🤍',
    'Здравствуйте, пропуск оформлен, всё по плану 🤍',
    'Здравствуйте! Пропуск оформлен, если что-то изменится, пишите 🤍',
    'Здравствуйте, пропуск оформили. Если появятся вопросы, пишите 🤍',
    'Добрый день! Пропуск оформлен, мы на связи 🤍',
    'Здравствуйте! Пропуск готов, будем ждать 🤍',
    'Здравствуйте, ваш пропуск готов 🤍',
    'Добрый день! Ваш пропуск оформлен 🤍',
    'Здравствуйте! Ваш пропуск уже оформлен 🤍',
  ];

  // Несколько человек
  const DONE_MANY = [
    'Здравствуйте, пропуска оформили 🤍',
    'Здравствуйте! Пропуска оформлены 🤍',
    'Добрый день! Пропуска готовы 🤍',
    'Здравствуйте, пропуска на всех оформили 🤍',
    'Добрый день! Пропуска на всех оформлены 🤍',
    'Здравствуйте! Пропуска оформили на всех участников 🤍',
    'Здравствуйте, пропуска для всей команды оформлены 🤍',
    'Добрый день! Пропуска на всю команду готовы 🤍',
    'Здравствуйте! Оформили пропуска на всех, ждём вас 🤍',
    'Здравствуйте, все пропуска оформлены, до встречи в студии 🤍',
    'Добрый день! Все пропуска готовы, ждём вас 🤍',
    'Здравствуйте! Пропуска оформлены, хорошей съёмки 🤍',
    'Здравствуйте, пропуска готовы. Хорошей съёмки 🤍',
    'Добрый день! Пропуска уже в системе, ждём вас 🤍',
    'Здравствуйте! Всё готово, пропуска оформлены 🤍',
    'Здравствуйте, пропуска на нужную дату оформлены 🤍',
    'Добрый день! Спасибо за список, пропуска оформили 🤍',
    'Здравствуйте! Спасибо, пропуска на всех готовы 🤍',
    'Здравствуйте, получили список, пропуска оформлены 🤍',
    'Здравствуйте! Пропуска оформили ✨ Ждём всех 🤍',
    'Добрый день! Пропуска готовы, будем рады вас видеть 🤍',
    'Здравствуйте, пропуска оформлены. Если состав изменится, пишите 🤍',
    'Здравствуйте! Пропуска на всех сделали, до встречи 🤍',
    'Добрый день, всем оформили пропуска 🤍',
  ];

  // С адресом — для Павелецкой (ссылку на Серпуховскую Илья пока не дал). Добавляется к любому варианту выше.
  const DONE_LINK = 'https://1826.studio/pav/contacts';
  const DONE_LINK_INTROS = [
    'Информация, как нас найти:',
    'Как нас найти:',
    'Как добраться до студии:',
    'Подробно, как нас найти:',
    'На всякий случай, как нас найти:',
    'Чтобы легко нас найти:',
    'Как пройти в студию, описали здесь:',
  ];

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
        const selected = keepSelection(icon);
        icon.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const p = panel(); if (p) p.openAt(icon, selected()); });
        const done = document.createElement('button');
        done.type = 'button';
        done.className = 's1826p-btn s1826p-done';
        done.title = 'Вставить в поле ответ «пропуск оформлен» (каждый раз другими словами). Сообщение не отправляется.';
        done.textContent = '✅ Пропуск готов';
        done.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); insertDoneMessage(row, done); });
        wrap.append(icon, done);
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

  let lastDone = '';
  let lastRunCount = 1; // сколько человек было в последнем запуске из этой вкладки: «пропуск» или «пропуска»
  /** Вставить ответ в поле ввода этого диалога (к уже набранному — с новой строки). Не отправляет. */
  function insertDoneMessage(row, button) {
    let box = row;
    while (box && !box.querySelector('textarea')) box = box.parentElement;
    const area = box && box.querySelector('textarea');
    // Адрес — только Павелецкой: в заголовке диалога линии пишется филиал
    const title = textOf(document.querySelector('.bx-im-dialog-header, .bx-messenger-panel, .bx-im-chat-header, header') || document.body).slice(0, 2000);
    const withLink = !/серпух/i.test(title);
    const text = pickDoneMessage(lastRunCount > 1 ? DONE_MANY : DONE_ONE, lastDone, withLink ? DONE_LINK : '', DONE_LINK_INTROS);
    lastDone = text;
    if (!area) {
      try { navigator.clipboard.writeText(text); } catch (e) { /* без буфера — только подсказка */ }
      button.title = 'Не нашёл поле ввода — ответ скопирован, вставьте ⌘V';
      return;
    }
    const value = area.value.trim() ? `${area.value.replace(/\s+$/, '')}\n${text}` : text;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(area, value);
    area.dispatchEvent(new Event('input', { bubbles: true }));
    area.focus();
    area.setSelectionRange(value.length, value.length);
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

        lastRunCount = names.length;
        const job = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), names, from: date, to: date, createdAt: Date.now() };
        await store.set('job', job);
        await store.set(`result:${job.id}`, { done: false, results: {} });
        const url = await store.get('guestsUrl', DEFAULT_GUESTS_URL);
        const tab = await openBackgroundTab(`${url}#s1826-job=${job.id}`);

        ui.setRunning(true, 'Оформляю в Авангарде…');
        ui.showStatus(names, {});
        ui.summary.textContent = 'Авангард: открываю вкладку…';
        // Ждём результаты; если вкладка Авангарда 60 с ничего не сообщает — сдаёмся
        let lastChange = Date.now();
        let lastSeen = '';
        let last = null;
        for (;;) {
          await sleep(700);
          const res = await store.get(`result:${job.id}`, null);
          const seen = JSON.stringify(res);
          if (seen !== lastSeen) { lastSeen = seen; lastChange = Date.now(); }
          if (res) {
            ui.showStatus(names, res.results || {}, res.info || {});
            ui.summary.textContent = res.stage ? `Авангард · ${res.stage}` : 'Авангард: открываю вкладку…';
            last = res;
          }
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
        const left = names.filter((n) => results[n] !== 'ok');
        ui.area.value = left.join('\n');
        ui.refresh();
        ui.showStatus(names, results, (last && last.info) || {});
        ui.summary.textContent = last && last.error ? last.error : doneText(names, results);
      },
    });
  }

  /**
   * Мир страницы. 1) Фоновая вкладка: Chrome не вызывает requestAnimationFrame, и сайт (React) не перерисовывает таблицу и окна.
   * Подмена через unsafeWindow до страницы не доходит (скрипт в своём мире), поэтому вставляем её тегом <script>
   * в мир страницы — как можно раньше, до старта сайта. CSP у Авангарда нет.
   * 2) Копия ответа сайта со списком посетителей (событие s1826-guests) — для колонки «Сегодня». Запросы сайта не меняются.
   */
  function patchPageWorld() {
    const code = pageWorldCode();
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
    patchPageWorld();
    whenReady(avanguardMain);
  } else {
    whenReady(bitrixMain);
  }
})();
