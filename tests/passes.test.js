const test = require('node:test');
const assert = require('node:assert');
const { parseNames, isoDate, addDays, humanDate, periodText, parsePlate, plateIsSpecial, passLabel, splitLabel } = require('../studio1826-passes.user.js');

test('список ФИО: по строкам, без нумерации и пустых строк', () => {
  const { names } = parseNames(`
1. Воронцова Лилия Эдуардовна
2) Хван  Валерия Алексеевна

- Прокопчук Юлия Станиславовна\t
`);
  assert.deepStrictEqual(names, [
    'Воронцова Лилия Эдуардовна',
    'Хван Валерия Алексеевна',
    'Прокопчук Юлия Станиславовна',
  ]);
});

test('через запятую и точку с запятой', () => {
  assert.deepStrictEqual(parseNames('Иванов Иван, Петров Пётр; Сидоров Сидор').names,
    ['Иванов Иван', 'Петров Пётр', 'Сидоров Сидор']);
});

test('повторы убираются без учёта регистра и ё', () => {
  const { names, duplicates } = parseNames('Фёдоров Иван\nфедоров иван\nПетров Пётр');
  assert.deepStrictEqual(names, ['Фёдоров Иван', 'Петров Пётр']);
  assert.deepStrictEqual(duplicates, ['Федоров Иван']);
});

test('пустой ввод', () => {
  assert.deepStrictEqual(parseNames('  \n\n').names, []);
  assert.deepStrictEqual(parseNames(undefined).names, []);
});

test('даты', () => {
  assert.strictEqual(isoDate(new Date(2026, 9, 5)), '2026-10-05');
  assert.strictEqual(isoDate(addDays(new Date(2026, 9, 31), 1)), '2026-11-01');
  assert.strictEqual(humanDate('2026-10-05'), '05.10.2026');
  assert.strictEqual(periodText('2026-10-05', '2026-10-05'), '05.10.2026');
  assert.strictEqual(periodText('2026-10-05', '2026-10-06'), '05.10.2026 – 06.10.2026');
});

test('версия одна и та же в @name, @version и VERSION', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'studio1826-passes.user.js'), 'utf8');
  const { VERSION } = require('../studio1826-passes.user.js');
  assert.strictEqual(/@version\s+(\S+)/.exec(src)[1], VERSION);
  assert.strictEqual(/@name\s+v(\S+)/.exec(src)[1], VERSION);
});

test('parsePlate: номер как присылают клиенты', () => {
  assert.deepStrictEqual(parsePlate('Е334ав34'), { number: 'Е334АВ', region: '34' });
  assert.deepStrictEqual(parsePlate('a123bc 777 RUS'), { number: 'А123ВС', region: '777' });
  assert.deepStrictEqual(parsePlate('М 593 УХ 790'), { number: 'М593УХ', region: '790' });
  assert.strictEqual(parsePlate('Воронцова Лилия'), null);
});

test('parseNames: номер с ФИО, отдельной строкой и без ФИО', () => {
  assert.deepStrictEqual(parseNames('Иванов Иван Е334ав34').names, ['Иванов Иван · Е334АВ 34']);
  assert.deepStrictEqual(parseNames('Иванов Иван\nЕ334ав34').names, ['Иванов Иван · Е334АВ 34']);
  assert.deepStrictEqual(parseNames('Е334ав34').names, ['Машина · Е334АВ 34']);
  assert.deepStrictEqual(parseNames('Иванов Иван — Е334ав34\nПетров Пётр\nА123ВС77').names,
    ['Иванов Иван · Е334АВ 34', 'Петров Пётр · А123ВС 77']);
  assert.deepStrictEqual(parseNames('Е334ав34\nА123ВС77').names, ['Машина · Е334АВ 34', 'Машина · А123ВС 77']);
  assert.deepStrictEqual(parseNames('1. Хван Валерия').names, ['Хван Валерия']);
  assert.deepStrictEqual(parseNames('Иванов 12345').invalid, ['Иванов 12345']);
  // Оставшиеся в поле подписи разбираются так же
  assert.deepStrictEqual(parseNames('Иванов Иван · Е334АВ 34').names, ['Иванов Иван · Е334АВ 34']);
});

test('splitLabel / passLabel', () => {
  assert.deepStrictEqual(splitLabel('Машина · Е334АВ 34'), { name: 'Машина', plate: { number: 'Е334АВ', region: '34' } });
  assert.deepStrictEqual(splitLabel('Хван Валерия'), { name: 'Хван Валерия', plate: null });
  assert.strictEqual(passLabel('Хван', null), 'Хван');
});

test('номер с «необычными» буквами — специальный', () => {
  const plate = parsePlate('Е334аб34');
  assert.deepStrictEqual(plate, { number: 'Е334АБ', region: '34' });
  assert.ok(plateIsSpecial(plate));
  assert.ok(!plateIsSpecial(parsePlate('Е334ав34')));
  assert.ok(!plateIsSpecial(parsePlate('a123bc 777')));
  assert.ok(plateIsSpecial(parsePlate('D123ab77')));
  assert.deepStrictEqual(parseNames('Иванов Иван Е334аб34').names, ['Иванов Иван · Е334АБ 34']);
  assert.deepStrictEqual(splitLabel('Иванов Иван · Е334АБ 34'), { name: 'Иванов Иван', plate: { number: 'Е334АБ', region: '34' } });
});

// ── 1.4.0: данные Авангарда ────────────────────────────────────────────────

const { apiPeriod, parseApiTime, dayBounds, guestCoversDay, matchingPasses, eventKind, parkedTime, formatDuration } =
  require('../studio1826-passes.user.js');

test('время API без «Z» — это UTC', () => {
  assert.strictEqual(parseApiTime('2026-10-25T12:04:30'), Date.UTC(2026, 9, 25, 12, 4, 30));
  assert.strictEqual(parseApiTime('2026-10-25T12:04:30Z'), Date.UTC(2026, 9, 25, 12, 4, 30));
  assert.ok(Number.isNaN(parseApiTime('')));
  assert.ok(Number.isNaN(parseApiTime(null)));
});

test('период дня для фильтра списка', () => {
  assert.deepStrictEqual(apiPeriod('2026-11-05'), { dateStart: '2026-11-05T00:00:00', dateFinish: '2026-11-05T23:59:59' });
});

// Пропуск на день, как его отдаёт сайт: местные сутки в UTC
const passFor = (iso, extra = {}) => {
  const { start, end } = dayBounds(iso);
  const utc = (ms) => new Date(ms).toISOString().slice(0, 19);
  return { id: 1, name: 'Воронцова Лилия Эдуардовна', isArchived: false, dateStart: utc(start), dateFinish: utc(end - 999), ...extra };
};

test('пропуск действует в свой день и не действует в соседние', () => {
  const g = passFor('2026-10-29');
  assert.ok(guestCoversDay(g, '2026-10-29'));
  assert.ok(!guestCoversDay(g, '2026-10-28'));
  assert.ok(!guestCoversDay(g, '2026-10-30'));
});

test('пропуск на неделю покрывает день внутри', () => {
  const week = { ...passFor('2026-10-24'), dateFinish: passFor('2026-10-31').dateFinish };
  assert.ok(guestCoversDay(week, '2026-10-29'));
});

test('«был ли пропуск»: то же ФИО без учёта регистра, ё и пробелов; архивные и чужие не в счёт', () => {
  const list = [
    passFor('2026-10-29', { id: 1 }),
    passFor('2026-10-29', { id: 2, name: 'ВОРОНЦОВА  лилия эдуардовна' }),
    passFor('2026-10-29', { id: 3, isArchived: true }),
    passFor('2026-10-29', { id: 4, name: 'Воронцова Лилия' }),
    passFor('2026-10-30', { id: 5 }),
  ];
  assert.deepStrictEqual(matchingPasses(list, 'Воронцова Лилия Эдуардовна', '2026-10-29').map((g) => g.id), [1, 2]);
  const yo = [passFor('2026-10-29', { name: 'Фёдоров Иван' })];
  assert.strictEqual(matchingPasses(yo, 'федоров иван', '2026-10-29').length, 1);
});

test('«был ли пропуск» с машиной: сверяется и номер', () => {
  const list = [
    passFor('2026-10-29', { id: 1, name: 'Машина', carNumber: 'Е334АВ', carRegion: '34' }),
    passFor('2026-10-29', { id: 2, name: 'Машина', carNumber: 'А439ТУ', carRegion: '797' }),
  ];
  assert.deepStrictEqual(matchingPasses(list, 'Машина', '2026-10-29', { number: 'Е334АВ', region: '34' }).map((g) => g.id), [1]);
  assert.strictEqual(matchingPasses(list, 'Машина', '2026-10-29').length, 2);
});

test('события: въезд/выезд машины, пешие «Вход/Выход» не в счёт', () => {
  assert.strictEqual(eventKind({ event: 33, eventName: 'Въезд по распознаванию' }), 'in');
  assert.strictEqual(eventKind({ event: 34, eventName: 'Выезд по распознаванию' }), 'out');
  assert.strictEqual(eventKind({ event: 35, eventName: 'Въезд по заявке' }), 'in');
  assert.strictEqual(eventKind({ event: 37, eventName: 'Въезд спецтранспорта по распознаванию' }), 'in');
  assert.strictEqual(eventKind({ event: 1, eventName: 'Вход' }), null);
  assert.strictEqual(eventKind({ event: 2, eventName: 'Выход' }), null);
  assert.strictEqual(eventKind({ event: 36 }), 'out');
  assert.strictEqual(eventKind({ event: 21 }), 'in');
  assert.strictEqual(eventKind({ event: 2 }), null);
});

const T = (h, m = 0) => new Date(Date.UTC(2026, 9, 25, h, m)).toISOString().slice(0, 19); // UTC без Z, как у сайта
const DAY0 = Date.UTC(2026, 9, 24, 21, 0); // полночь по Москве
const ev = (time, event, eventName) => ({ time, event, eventName });

test('часы: въезд 12:04 — выезд 15:10 (как А439ТУ) = 3 ч 6 мин', () => {
  const events = [ev('2026-10-25T15:10:46', 34, 'Выезд по распознаванию'), ev('2026-10-25T12:04:30', 33, 'Въезд по распознаванию')];
  const r = parkedTime(events, DAY0, Date.UTC(2026, 9, 25, 18, 0));
  assert.strictEqual(formatDuration(r.ms), '3 ч 6 мин');
  assert.strictEqual(r.inside, false);
  assert.strictEqual(r.seen, true);
});

test('часы: несколько заездов складываются, стоит сейчас — до текущего момента', () => {
  const events = [
    ev(T(6), 33, 'Въезд по распознаванию'), ev(T(7, 30), 34, 'Выезд по распознаванию'),
    ev(T(10), 35, 'Въезд по заявке'), ev(T(10, 1), 1, 'Вход'),
  ];
  const r = parkedTime(events, DAY0, Date.UTC(2026, 9, 25, 12, 15));
  assert.strictEqual(formatDuration(r.ms), '3 ч 45 мин');
  assert.strictEqual(r.inside, true);
});

test('часы: выезд без въезда за день — стояла с полуночи; событие вчера задаёт состояние', () => {
  const r1 = parkedTime([ev(T(2), 34, 'Выезд по распознаванию')], DAY0, Date.UTC(2026, 9, 25, 12));
  assert.strictEqual(r1.ms, Date.UTC(2026, 9, 25, 2) - DAY0);
  const r2 = parkedTime([ev('2026-10-24T18:00:00', 33, 'Въезд по распознаванию')], DAY0, Date.UTC(2026, 9, 25, 1));
  assert.strictEqual(r2.ms, Date.UTC(2026, 9, 25, 1) - DAY0);
  assert.strictEqual(r2.inside, true);
});

test('часы: двойной въезд не удваивает, событий нет — «не заезжала»', () => {
  const r = parkedTime([ev(T(6), 33, 'Въезд'), ev(T(7), 33, 'Въезд'), ev(T(8), 34, 'Выезд')], DAY0, Date.UTC(2026, 9, 25, 12));
  assert.strictEqual(formatDuration(r.ms), '2 ч');
  const none = parkedTime([], DAY0, Date.UTC(2026, 9, 25, 12));
  assert.deepStrictEqual(none, { ms: 0, inside: false, seen: false });
});

test('длительность', () => {
  assert.strictEqual(formatDuration(45 * 60000), '45 мин');
  assert.strictEqual(formatDuration(2 * 3600000), '2 ч');
  assert.strictEqual(formatDuration(0), '0 мин');
});

test('разные написания списка: инициалы, только фамилия, табы, лишние пробелы, CAPS, ё', () => {
  const { names, invalid } = parseNames('ВОРОНЦОВА   Лилия\tЭдуардовна\nХван В.А.\nПрокопчук\n  Фёдоров Иван  ');
  assert.deepStrictEqual(names, ['Воронцова Лилия Эдуардовна', 'Хван В.А.', 'Прокопчук', 'Фёдоров Иван']);
  assert.deepStrictEqual(invalid, []);
});

test('разные написания номеров рядом с ФИО', () => {
  assert.deepStrictEqual(parseNames('Иванов Иван А 439 ТУ 797').names, ['Иванов Иван · А439ТУ 797']);
  assert.deepStrictEqual(parseNames('Иванов Иван — a439ty797 RUS').names, ['Иванов Иван · А439ТУ 797']);
  assert.deepStrictEqual(parseNames('Иванов Иван\nЕ334аб34').names, ['Иванов Иван · Е334АБ 34']);
  assert.deepStrictEqual(parseNames('Иванов Иван 89161234567').invalid, ['Иванов Иван 89161234567']);
});

test('код для мира страницы разбирается и ловит ответ со списком посетителей', async () => {
  const { pageWorldCode } = require('../studio1826-passes.user.js');
  const code = pageWorldCode();
  const events = [];
  class FakeXHR { open() {} send() {} addEventListener() {} }
  const win = {
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
    fetch: async (url) => ({ clone: () => ({ text: async () => `{"result":[{"id":1}],"url":"${url}"}` }) }),
    dispatchEvent: (e) => events.push(JSON.parse(e.detail)),
  };
  // eslint-disable-next-line no-new-func
  new Function('window', 'XMLHttpRequest', 'CustomEvent', 'document', 'performance', code)(
    win, FakeXHR, class { constructor(type, init) { this.type = type; this.detail = init.detail; } }, { hidden: false }, { now: () => 0 });
  await win.fetch('https://api.avanguard.pro/api/guests?accountId=354&search=439');
  await win.fetch('https://api.avanguard.pro/api/guests/1267210');
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(events.length, 1);
  assert.ok(events[0].url.includes('search=439'));
});

test('строка таблицы → пропуск: ФИО целиком и номер машины', () => {
  const { guestsForRow } = require('../studio1826-passes.user.js');
  const guests = [
    { id: 1, name: 'Хван Валерия Алексеевна' },
    { id: 2, name: 'Хван' },
    { id: 3, name: 'Машина', carNumber: 'А439ТУ', carRegion: '797' },
    { id: 4, name: 'Машина', carNumber: 'К013АК', carRegion: '15' },
    { id: 5, name: 'Хван Валерия Алексеевна', carNumber: 'Е334АВ', carRegion: '34' },
  ];
  assert.deepStrictEqual(guestsForRow('Хван Валерия Алексеевна', '—', guests).map((g) => g.id), [1]);
  assert.deepStrictEqual(guestsForRow('ХВАН', '', guests).map((g) => g.id), [2]);
  assert.deepStrictEqual(guestsForRow('Машина', 'А439ТУ 797', guests).map((g) => g.id), [3]);
  assert.deepStrictEqual(guestsForRow('Хван Валерия Алексеевна', 'Е334АВ 34', guests).map((g) => g.id), [5]);
  assert.deepStrictEqual(guestsForRow('Петров', '', guests), []);
});

test('ФИО с заглавной: строчные и КАПС исправляются, инициалы и двойные фамилии — нет', () => {
  const { properName } = require('../studio1826-passes.user.js');
  assert.strictEqual(properName('прокопчук юлия станиславовна'), 'Прокопчук Юлия Станиславовна');
  assert.strictEqual(properName('ХВАН валерия алексеевна'), 'Хван Валерия Алексеевна');
  assert.strictEqual(properName('Хван В.А.'), 'Хван В.А.');
  assert.strictEqual(properName('римский-корсаков николай'), 'Римский-Корсаков Николай');
  assert.strictEqual(properName('Мак-Дональд'), 'Мак-Дональд');
  assert.strictEqual(properName('Машина'), 'Машина');
  assert.deepStrictEqual(parseNames('прокопчук   юлия\nЕ334ав34').names, ['Прокопчук Юлия · Е334АВ 34']);
});

test('вставка из выделения/буфера: только строки с ФИО и номерами', () => {
  const { prefillText } = require('../studio1826-passes.user.js');
  const message = 'Здравствуйте! Вот список на завтра:\n1. Воронцова Лилия Эдуардовна\n2. Хван Валерия Алексеевна\nмашина Е334ав34\nСпасибо!\n12:30';
  assert.strictEqual(prefillText(message, ''), 'Воронцова Лилия Эдуардовна\nХван Валерия Алексеевна\nмашина Е334ав34');
  assert.strictEqual(prefillText('', 'Прокопчук Юлия'), 'Прокопчук Юлия');
  assert.strictEqual(prefillText('Иванов Иван', 'Прокопчук Юлия'), 'Иванов Иван');
  assert.strictEqual(prefillText('https://my.avanguard.pro/account/354/guests', ''), '');
  assert.strictEqual(prefillText('', 'Как добраться до студии? Подскажите пожалуйста парковку'), '');
  assert.strictEqual(prefillText('Е334ав34', ''), 'Е334ав34');
  assert.strictEqual(prefillText('', ''), '');
});

test('вставка: выделение строк таблицы Авангарда (ячейки через табуляцию)', () => {
  const { prefillText } = require('../studio1826-passes.user.js');
  const sel = 'Погоря Виктория Сергеевна\t—\t02.09.2026 - 31.12.2026\t\tушел\nГуревич Евгений Михайлович ИП\tПолина Андронова';
  assert.strictEqual(prefillText(sel, ''), 'Погоря Виктория Сергеевна\nПолина Андронова');
  assert.strictEqual(prefillText('ООО Ромашка\tИванов Иван\tА439ТУ 797', ''), 'Иванов Иван\nА439ТУ 797');
});

test('ФИО с переносом посреди имени делятся по отчествам', () => {
  const t = (text) => parseNames(text).names;
  assert.deepStrictEqual(t('Воронцова Лилия Эдуардовна Хван \nВалерия Алексеевна'),
    ['Воронцова Лилия Эдуардовна', 'Хван Валерия Алексеевна']);
  assert.deepStrictEqual(t('Воронцова Лилия Эдуардовна Хван Валерия Алексеевна Прокопчук Юлия Станиславовна'),
    ['Воронцова Лилия Эдуардовна', 'Хван Валерия Алексеевна', 'Прокопчук Юлия Станиславовна']);
  assert.deepStrictEqual(t('Хван Валерия\nАлексеевна\nИванов Иван Иванович'), ['Хван Валерия Алексеевна', 'Иванов Иван Иванович']);
  assert.deepStrictEqual(t('Шостакович Дмитрий Дмитриевич Пашкевич Анна Ильинична'),
    ['Шостакович Дмитрий Дмитриевич', 'Пашкевич Анна Ильинична']);
  assert.deepStrictEqual(t('Мамедов Али Гусейн оглы Алиева Лейла Рашидовна'), ['Мамедов Али Гусейн оглы', 'Алиева Лейла Рашидовна']);
});

test('без отчеств и с номерами ничего не склеивается и не режется', () => {
  const t = (text) => parseNames(text).names;
  assert.deepStrictEqual(t('Прокопчук\nИванов Иван'), ['Прокопчук', 'Иванов Иван']);
  assert.deepStrictEqual(t('Иванов Иван\nПетров Петр Петрович'), ['Иванов Иван', 'Петров Петр Петрович']);
  assert.deepStrictEqual(t('1. Воронцова Лилия Эдуардовна\n2. Хван Валерия Алексеевна'), ['Воронцова Лилия Эдуардовна', 'Хван Валерия Алексеевна']);
  assert.deepStrictEqual(t('Иванов Иван Иванович Е334ав34\nПетров Петр'), ['Иванов Иван Иванович · Е334АВ 34', 'Петров Петр']);
  assert.deepStrictEqual(t('Хван В.А.\nМашина'), ['Хван В.А.', 'Машина']);
});

test('«и» между людьми', () => {
  assert.deepStrictEqual(parseNames('Иванов Иван и Петров Петр').names, ['Иванов Иван', 'Петров Петр']);
  assert.deepStrictEqual(parseNames('Воронцова Лилия Эдуардовна и Хван\nВалерия Алексеевна').names,
    ['Воронцова Лилия Эдуардовна', 'Хван Валерия Алексеевна']);
});

test('сообщения клиентов: приветствия и благодарности — не люди, ФИО через запятую и перенос', () => {
  const t = (text) => parseNames(text).names;
  assert.deepStrictEqual(t('Спасибо'), []);
  assert.deepStrictEqual(t('Здравствуйте!'), []);
  assert.deepStrictEqual(t('Добрый день, Воронцова Лилия Эдуардовна Хван'), ['Воронцова Лилия Эдуардовна', 'Хван']);
  assert.deepStrictEqual(t('Воронцова Лилия Эдуардовна Хван\nВалерия Алексеевна, спасибо!'),
    ['Воронцова Лилия Эдуардовна', 'Хван Валерия Алексеевна']);
  assert.deepStrictEqual(t('Добрый день! Оформите пожалуйста пропуска на завтра:\nВоронцова Лилия Эдуардовна, Хван\nВалерия Алексеевна\nСпасибо большое!'),
    ['Воронцова Лилия Эдуардовна', 'Хван Валерия Алексеевна']);
  assert.deepStrictEqual(t('Иванов Иван, Петров Петр'), ['Иванов Иван', 'Петров Петр']);
});

test('вставка из сообщения: ФИО через перенос не теряется', () => {
  const { prefillText } = require('../studio1826-passes.user.js');
  const msg = 'Добрый день, Воронцова Лилия Эдуардовна Хван \nВалерия Алексеевна, спасибо!';
  assert.deepStrictEqual(parseNames(prefillText(msg, '')).names, ['Воронцова Лилия Эдуардовна', 'Хван Валерия Алексеевна']);
});

test('«пропуск на/для …» и отчества в падежах', () => {
  const t = (text) => parseNames(text).names;
  assert.deepStrictEqual(t('Пропуск на Иванова Ивана Ивановича'), ['Иванова Ивана Ивановича']);
  assert.deepStrictEqual(t('Нужен пропуск для Петрова Петра Петровича и еще Сидоров Сидор'), ['Петрова Петра Петровича', 'Сидоров Сидор']);
  assert.deepStrictEqual(t('Воронцовой Лилии Эдуардовне Хван Валерии Алексеевне'), ['Воронцовой Лилии Эдуардовне', 'Хван Валерии Алексеевне']);
  assert.deepStrictEqual(t('Еще машина А439ТУ797'), ['Машина · А439ТУ 797']);
});

test('«Пропуск готов»: случайный ответ, подряд не повторяется, ссылка только где можно', () => {
  const { pickDoneMessage } = require('../studio1826-passes.user.js');
  const pool = ['a', 'b', 'c'];
  let last = '';
  let linked = 0;
  for (let i = 0; i < 300; i++) {
    const m = pickDoneMessage(pool, last, 'https://x', ['Как нас найти:']);
    assert.notStrictEqual(m, last);
    if (m.includes('https://x')) { linked++; assert.ok(/^[abc]\n\nКак нас найти:\nhttps:\/\/x$/.test(m)); }
    last = m;
  }
  assert.ok(linked > 30 && linked < 200);
  for (let i = 0; i < 50; i++) assert.ok(pool.includes(pickDoneMessage(pool, '', '', ['x'])));
  assert.strictEqual(pickDoneMessage(['x'], 'x', ''), 'x');
});

test('вставка из реальных сообщений: никто не теряется, лишнее не попадает', () => {
  const { prefillText } = require('../studio1826-passes.user.js');
  const fromMessage = (msg) => parseNames(prefillText(msg, '')).names;
  assert.deepStrictEqual(fromMessage('Здравствуйте, на 28.10 с 10:00 до 14:00 пропуска: Хван Валерия Алексеевна; Прокопчук Юлия Станиславовна'),
    ['Хван Валерия Алексеевна', 'Прокопчук Юлия Станиславовна']);
  assert.deepStrictEqual(fromMessage('Зал 110, съемка с 12 до 18. Гости: Воронцова Лилия, Хван Валерия'), ['Воронцова Лилия', 'Хван Валерия']);
  assert.deepStrictEqual(fromMessage('Воронцова Лилия Эдуардовна +79161234567'), ['Воронцова Лилия Эдуардовна']);
  assert.deepStrictEqual(fromMessage('Хван Валерия Алексеевна hvan@mail.ru'), ['Хван Валерия Алексеевна']);
  assert.deepStrictEqual(fromMessage('Привет) мы втроем: я - Воронцова Лилия Эдуардовна, подруга Хван Валерия и фотограф Прокопчук Юлия Станиславовна'),
    ['Воронцова Лилия Эдуардовна', 'Хван Валерия', 'Прокопчук Юлия Станиславовна']);
  assert.deepStrictEqual(fromMessage('Воронцова Лилия Эдуардовна.\nС уважением'), ['Воронцова Лилия Эдуардовна']);
  assert.deepStrictEqual(fromMessage('Добрый вечер! Будем на машине, номер А439ТУ 797, Воронцова Лилия Эдуардовна. Спасибо большое!'),
    ['Воронцова Лилия Эдуардовна · А439ТУ 797']);
});

test('вставка: опечатка в номере не пропадает молча', () => {
  const { prefillText } = require('../studio1826-passes.user.js');
  const { names, invalid } = parseNames(prefillText('Иванов Иван Е33ав34\nПетров Петр', ''));
  assert.deepStrictEqual(names, ['Петров Петр']);
  assert.strictEqual(invalid.length, 1);
});

test('падеж: отчество не в именительном отмечается', () => {
  const r = parseNames('Пропуск для Воронцовой Лилии Эдуардовны и Хван Валерии Алексеевны\nИванову Петру Сергеевичу\nПрокопчук Юлия Станиславовна');
  assert.deepStrictEqual(r.names, ['Воронцовой Лилии Эдуардовны', 'Хван Валерии Алексеевны', 'Иванову Петру Сергеевичу', 'Прокопчук Юлия Станиславовна']);
  assert.deepStrictEqual(r.oblique, ['Воронцовой Лилии Эдуардовны', 'Хван Валерии Алексеевны', 'Иванову Петру Сергеевичу']);
});
