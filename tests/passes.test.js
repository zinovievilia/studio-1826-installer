const test = require('node:test');
const assert = require('node:assert');
const { parseNames, isoDate, addDays, humanDate, periodText, rowMatches, rowCoversPeriod, tableFresh, guestsRequestMatches,
  parsePlate, passLabel, splitLabel, rowHasPlate, tableTruncated } = require('../studio1826-passes.user.js');

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
  assert.deepStrictEqual(duplicates, ['федоров иван']);
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

test('уже оформлен: имя и дата в строке таблицы', () => {
  const row = 'КОШЕЛЕВ-ПРОЕКТ Хван Валерия Алексеевна — 25.10.2026 - 25.10.2026 Активен';
  assert.ok(rowMatches(row, 'хван валерия алексеевна', '2026-10-25'));
  assert.ok(!rowMatches(row, 'Хван Валерия Алексеевна', '2026-10-26'));
  assert.ok(!rowMatches(row, 'Воронцова Лилия', '2026-10-25'));
  assert.ok(rowMatches('Хван Валерия 25.10.26', 'Хван Валерия', '2026-10-25'));
});

test('версия одна и та же в @name, @version и VERSION', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'studio1826-passes.user.js'), 'utf8');
  const { VERSION } = require('../studio1826-passes.user.js');
  assert.strictEqual(/@version\s+(\S+)/.exec(src)[1], VERSION);
  assert.strictEqual(/@name\s+v(\S+)/.exec(src)[1], VERSION);
});

test('период в таблице покрывает дату — пропуск уже есть', () => {
  const row = 'Воронцова Лилия Эдуардовна 24.10.2026 - 31.10.2026 новый';
  assert.ok(rowMatches(row, 'Воронцова Лилия Эдуардовна', '2026-10-29'));
  assert.ok(rowMatches(row, 'воронцова лилия эдуардовна', '2026-10-29', '2026-10-29'));
  assert.ok(!rowMatches(row, 'Воронцова Лилия Эдуардовна', '2026-11-01'));
  assert.ok(!rowMatches(row, 'Воронцова Лилия Эдуардовна', '2026-10-29', '2026-11-02'), 'период шире существующего — не покрыт');
  assert.ok(!rowMatches(row, 'Хван Валерия Алексеевна', '2026-10-29'));
});

test('guestsRequestMatches: стартовый запрос за сегодня не считается ответом на фильтр', () => {
  const base = 'https://my.avanguard.pro/api/guests?';
  assert.ok(guestsRequestMatches(`${base}dateStart=2026-10-29T00:00:00&dateFinish=2026-10-29T23:59:59&search=`, '2026-10-29', '2026-10-29'));
  assert.ok(guestsRequestMatches(`${base}dateStart=2026-10-29T00%3A00%3A00&dateFinish=2026-10-29T23%3A59%3A59`, '2026-10-29', '2026-10-29'));
  assert.ok(!guestsRequestMatches(`${base}dateStart=2026-10-25T00:00:00&dateFinish=2026-10-25T23:59:59`, '2026-10-29', '2026-10-29'));
  assert.ok(!guestsRequestMatches(`${base}dateStart=2026-10-29T00:00:00&dateFinish=2026-10-31T23:59:59`, '2026-10-29', '2026-10-29'));
  assert.ok(!guestsRequestMatches('https://my.avanguard.pro/api/auth/security', '2026-10-29', '2026-10-29'));
  assert.ok(!guestsRequestMatches('', '2026-10-29', '2026-10-29'));
});

test('tableFresh: прежний список за сегодня не считается списком за нужную дату', () => {
  const stale = ['ФИО Даты Статус', 'Иванов Иван 25.10.2026 новый', 'Петров Пётр 21.10.2026 - 25.10.2026 новый'];
  assert.ok(!tableFresh(stale, '2026-10-29'));
  const fresh = ['ФИО Даты Статус', 'Воронцова Лилия Эдуардовна 24.10.2026 - 31.10.2026 новый', 'Хван Валерия Алексеевна 29.10.2026 новый'];
  assert.ok(tableFresh(fresh, '2026-10-29'));
  assert.ok(!tableFresh([...fresh, 'Иванов Иван 25.10.2026'], '2026-10-29'), 'хоть одна строка не за ту дату — ещё не обновилась');
  assert.ok(!tableFresh(['ФИО Даты Статус'], '2026-10-29'), 'пустая без «нет записей» — не знаем');
  assert.ok(tableFresh(['ФИО Даты Статус'], '2026-10-29', '2026-10-29', true));
  assert.ok(rowCoversPeriod('24.10.2026 - 31.10.2026', '2026-10-29'));
  assert.ok(!rowCoversPeriod('25.10.2026', '2026-10-29'));
});

test('parsePlate: номер как присылают клиенты', () => {
  assert.deepStrictEqual(parsePlate('Е334ав34'), { number: 'Е334АВ', region: '34' });
  assert.deepStrictEqual(parsePlate('a123bc 777 RUS'), { number: 'А123ВС', region: '777' });
  assert.deepStrictEqual(parsePlate('М 593 УХ 790'), { number: 'М593УХ', region: '790' });
  assert.strictEqual(parsePlate('Ж334ав34'), null);
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
  assert.deepStrictEqual(parseNames('Иванов Ж334ав34').invalid, ['Иванов Ж334ав34']);
  // Оставшиеся в поле подписи разбираются так же
  assert.deepStrictEqual(parseNames('Иванов Иван · Е334АВ 34').names, ['Иванов Иван · Е334АВ 34']);
});

test('splitLabel / rowHasPlate / tableTruncated', () => {
  assert.deepStrictEqual(splitLabel('Машина · Е334АВ 34'), { name: 'Машина', plate: { number: 'Е334АВ', region: '34' } });
  assert.deepStrictEqual(splitLabel('Хван Валерия'), { name: 'Хван Валерия', plate: null });
  assert.strictEqual(passLabel('Хван', null), 'Хван');
  const plate = { number: 'М593УХ', region: '79' };
  assert.ok(!rowHasPlate('Наргиза М593УХ 790 14.09.2026', plate), 'регион 79 ≠ 790');
  assert.ok(rowHasPlate('Наргиза М593УХ 790 14.09.2026', { number: 'М593УХ', region: '790' }));
  assert.ok(rowHasPlate('что угодно', null));
  assert.ok(tableTruncated('Показано 1-50 из 140'));
  assert.ok(!tableTruncated('Показано 1-23 из 23'));
  assert.ok(!tableTruncated(''));
});
