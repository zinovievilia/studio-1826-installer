const test = require('node:test');
const assert = require('node:assert');
const { parseNames, isoDate, addDays, humanDate, periodText, parsePlate, passLabel, splitLabel } = require('../studio1826-passes.user.js');

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

test('splitLabel / passLabel', () => {
  assert.deepStrictEqual(splitLabel('Машина · Е334АВ 34'), { name: 'Машина', plate: { number: 'Е334АВ', region: '34' } });
  assert.deepStrictEqual(splitLabel('Хван Валерия'), { name: 'Хван Валерия', plate: null });
  assert.strictEqual(passLabel('Хван', null), 'Хван');
});
