'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const m = require(path.join('..', 'studio1826.user.js'));

/* =========================================================
 * quantity() / parseNumber() — Б-1
 * ========================================================= */

test('quantity: число с единицей "шт."', () => {
    assert.equal(m.quantity('Кофейня — 1 шт.'), 1);
    assert.equal(m.quantity('Кофейня — 2 шт.'), 2);
    assert.equal(m.quantity('Aputure 600d Pro - 12 шт.'), 12);
    assert.equal(m.quantity('Aputure 600d Pro - 20 шт'), 20);
});

test('quantity: строка без явного числа — подразумевается 1 (Б-1)', () => {
    assert.equal(m.quantity('Кофейня'), 1);
    assert.equal(m.quantity('Использование фона'), 1);
});

test('quantity: неразрывный пробел и запятая как десятичный разделитель', () => {
    assert.equal(m.quantity('Текстиль Silk 12x12 - 1,5 шт.'), 1.5);
    assert.equal(m.quantity('Текстиль Silk 12x12 - 1 5 шт.'), 1); // некорректный ввод — не должно падать
});

test('parseNumber: пробелы, неразрывный пробел, рубли, запятая', () => {
    assert.equal(m.parseNumber('1 000'), 1000);
    assert.equal(m.parseNumber('1 000'), 1000);
    assert.equal(m.parseNumber('1000 ₽'), 1000);
    assert.equal(m.parseNumber('12,5'), 12.5);
    assert.equal(m.parseNumber(''), 0);
    assert.equal(m.parseNumber(null), 0);
    assert.equal(m.parseNumber(undefined), 0);
    assert.equal(m.parseNumber('не число'), 0);
    assert.equal(m.parseNumber(NaN), 0);
});

/* =========================================================
 * computePayout() — расчёт выплат, С/П, 1-3 администратора
 * ========================================================= */

test('computePayout: ветка С, базовый расчёт без бонусов/кофе/ставки', () => {
    const records = [{ items: ['Зал 100 (С) - 2 шт.'] }];
    const r = m.computePayout(records, { category: 'C', admins: 2 });

    assert.equal(r.hours, 2);
    assert.equal(r.hoursBonus, 0); // порог бонуса в С начинается с 54ч
    assert.equal(r.coffeePer, 0); // кофе не считается на С
    assert.equal(r.rate, 0);
});

test('computePayout: ветка П — кофе учитывается (30%), на С — нет', () => {
    const records = [{ items: ['Кофейня — 10 шт.'] }];

    const p = m.computePayout(records, { category: 'P', admins: 1, coffeeEnabled: true });
    assert.equal(p.coffee, 10);
    assert.equal(p.coffeePercent, 10 * 0.30);
    assert.equal(p.coffeePer, 3);

    const c = m.computePayout(records, { category: 'C', admins: 1, coffeeEnabled: true });
    assert.equal(c.coffeePer, 0, 'на филиале С кофе не делится между администраторами');
});

test('computePayout: coffeeEnabled=false отключает надбавку за кофе на П', () => {
    const records = [{ items: ['Кофейня — 10 шт.'] }];
    const r = m.computePayout(records, { category: 'P', admins: 1, coffeeEnabled: false });

    assert.equal(r.coffeePer, 0);
});

test('computePayout: оборудование — 10% от суммы, делится между администраторами', () => {
    // Aputure 600d Pro = 3500
    const records = [{ items: ['Aputure 600d Pro - 2 шт.'] }];

    const r1 = m.computePayout(records, { category: 'C', admins: 1 });
    assert.equal(r1.eq, 7000);
    assert.equal(r1.eqPercent, 700);
    assert.equal(r1.equipmentPer, 700);

    const r2 = m.computePayout(records, { category: 'C', admins: 2 });
    assert.equal(r2.equipmentPer, 350);

    const r3 = m.computePayout(records, { category: 'C', admins: 3 });
    assert.equal(r3.equipmentPer, 7000 * 0.10 / 3);
});

test('computePayout: бонус за часы по порогам (С: 54/72/90ч)', () => {
    const hallName = 'Зал 100 (С)';

    const below = m.computePayout([{ items: [`${hallName} - 53 шт.`] }], { category: 'C', admins: 1 });
    assert.equal(below.hoursBonus, 0);

    const t1 = m.computePayout([{ items: [`${hallName} - 54 шт.`] }], { category: 'C', admins: 1 });
    assert.equal(t1.hoursBonus, 500);

    const t2 = m.computePayout([{ items: [`${hallName} - 72 шт.`] }], { category: 'C', admins: 1 });
    assert.equal(t2.hoursBonus, 1000);

    const t3 = m.computePayout([{ items: [`${hallName} - 90 шт.`] }], { category: 'C', admins: 1 });
    assert.equal(t3.hoursBonus, 1500);
});

test('computePayout: бонус за часы на П (пороги 20/25/30ч)', () => {
    const hallName = 'Зал 100 (П)';
    const t1 = m.computePayout([{ items: [`${hallName} - 20 шт.`] }], { category: 'P', admins: 1 });
    assert.equal(t1.hoursBonus, 500);
});

test('computePayout: ставка не делится между администраторами', () => {
    const r1 = m.computePayout([], { category: 'C', admins: 1, rateEnabled: true, rateValue: 3000 });
    const r3 = m.computePayout([], { category: 'C', admins: 3, rateEnabled: true, rateValue: 3000 });

    assert.equal(r1.rate, 3000);
    assert.equal(r3.rate, 3000, 'ставка одинакова независимо от числа администраторов (добавляется каждому)');
});

test('computePayout: услуга "Установка схемы света" исключается при lightSetupEnabled=false', () => {
    const records = [{ items: ['Установка схемы света - 1 шт.'] }];

    const on = m.computePayout(records, { category: 'C', admins: 1, lightSetupEnabled: true });
    const off = m.computePayout(records, { category: 'C', admins: 1, lightSetupEnabled: false });

    const svcOn = on.servicesPer.find(s => s.name === 'Установка схемы света');
    const svcOff = off.servicesPer.find(s => s.name === 'Установка схемы света');

    assert.equal(svcOn.excluded, false);
    assert.ok(svcOn.perAdmin > 0);
    assert.equal(svcOff.excluded, true);
    assert.equal(svcOff.perAdmin, 0);
});

test('computePayout: пустые records не ломают расчёт', () => {
    const r = m.computePayout([], { category: 'C', admins: 2 });
    assert.equal(r.payout, 0);
});

test('computePayout: некорректные admins нормализуются к 1 (защита от мусора)', () => {
    const r = m.computePayout([], { category: 'C', admins: 99 });
    assert.equal(r.items.length, 0);
    assert.doesNotThrow(() => m.computePayout([], { category: 'C', admins: NaN }));
    assert.doesNotThrow(() => m.computePayout([], { category: 'X', admins: 2 }));
});

/* =========================================================
 * buildDayList() — оборудование за день, Р-7 (Infinity)
 * ========================================================= */

test('buildDayList: Р-7 — зал без единой записи времени не должен ломать расчёт (Infinity guard)', () => {
    const records = [
        { hall: 'Зал 100 (С)', items: ['Aputure 600d Pro - 1 шт.'], start: null, end: null }
    ];

    assert.doesNotThrow(() => m.buildDayList(records));

    const result = m.buildDayList(records);
    const block = result.blocks.find(b => b.label.includes('100'));

    assert.ok(block);
    // Без единого start у всех записей звёздочка не должна ставиться никому
    assert.ok(block.items.every(item => item.star === false));
});

test('buildDayList: первая по времени бронь получает звёздочку', () => {
    const records = [
        { hall: 'Зал 100 (С)', items: ['Aputure 600d Pro - 1 шт.'], start: 600, end: 700 },
        { hall: 'Зал 100 (С)', items: ['Aputure 600d Pro - 2 шт.'], start: 800, end: 900 }
    ];

    const result = m.buildDayList(records);
    const block = result.blocks.find(b => b.label.includes('100'));
    const entry = block.items[0];

    assert.equal(entry.star, true);
    assert.equal(entry.starQty, 1);
    assert.equal(entry.qty, 2, 'общее количество за день — максимум среди броней');
});

test('buildDayList: пустой список записей', () => {
    const result = m.buildDayList([]);
    assert.deepEqual(result.blocks, []);
    assert.equal(result.starCount, 0);
});

/* =========================================================
 * parseDayList() — разбор скопированного текста
 * ========================================================= */

test('parseDayList: разбирает заголовок зала и позиции со звёздочкой', () => {
    const text = 'Зал 100 (С)\nAputure 600d Pro — 2 шт. *\nAputure 300d II — 1 шт.';
    const halls = m.parseDayList(text);

    assert.equal(halls.length, 1);
    assert.equal(halls[0].items.length, 2);
    assert.equal(halls[0].items[0].star, true);
    assert.equal(halls[0].items[1].star, false);
});

test('parseDayList: "(утром N)" задаёт отдельное значение needQty', () => {
    const text = 'Зал 100 (С)\nAputure 600d Pro — 2 шт. (утром 1) *';
    const halls = m.parseDayList(text);

    assert.equal(halls[0].items[0].needQty, 1);
    assert.equal(halls[0].items[0].qty, 2);
});

test('parseDayList: пустой и мусорный текст не падает', () => {
    assert.doesNotThrow(() => m.parseDayList(''));
    assert.doesNotThrow(() => m.parseDayList(null));
    assert.doesNotThrow(() => m.parseDayList('случайный текст без структуры'));
    assert.deepEqual(m.parseDayList(''), []);
});

/* =========================================================
 * analyzeTomorrow() — Б-2 (нулевые move), keep/move/missing
 * ========================================================= */

test('analyzeTomorrow: Б-2 — полностью закрытая потребность не создаёт move с qty:0', () => {
    const records = [
        { hall: 'Зал 100 (С)', items: ['Aputure 600d Pro - 2 шт.'], start: 600, end: 700 }
    ];
    const tomorrow = [
        { label: 'Зал 100', items: [
            { key: m.norm('Aputure 600d Pro'), name: 'Aputure 600d Pro', star: true, qty: 2, needQty: 2 }
        ] }
    ];

    const result = m.analyzeTomorrow(records, tomorrow);

    assert.equal(result.keep.length, 1, 'потребность полностью покрыта тем же залом (keep)');
    assert.equal(result.move.length, 0, 'move не должен содержать записей с qty:0 после полного keep-покрытия');
    assert.equal(result.missing.length, 0);
});

test('analyzeTomorrow: частичное покрытие — остаток переносится ровно на нужную величину', () => {
    const records = [
        { hall: 'Зал 100 (С)', items: ['Aputure 600d Pro - 1 шт.'], start: 600, end: 700 },
        { hall: 'Зал 110 (С)', items: ['Aputure 600d Pro - 5 шт.'], start: 600, end: 650 }
    ];
    const tomorrow = [
        { label: 'Зал 100', items: [
            { key: m.norm('Aputure 600d Pro'), name: 'Aputure 600d Pro', star: true, qty: 3, needQty: 3 }
        ] }
    ];

    const result = m.analyzeTomorrow(records, tomorrow);

    assert.equal(result.keep.length, 1);
    assert.equal(result.keep[0].qty, 1);
    assert.equal(result.move.length, 1);
    assert.equal(result.move[0].qty, 2, 'перенесено ровно недостающее количество (3 - 1 = 2)');
    assert.equal(result.missing.length, 0);
});

test('analyzeTomorrow: отсутствие оборудования в любом зале — missing', () => {
    const records = [
        { hall: 'Зал 100 (С)', items: ['Aputure 300d II - 1 шт.'], start: 600, end: 700 }
    ];
    const tomorrow = [
        { label: 'Зал 110', items: [
            { key: m.norm('Aputure 600d Pro'), name: 'Aputure 600d Pro', star: true, qty: 1, needQty: 1 }
        ] }
    ];

    const result = m.analyzeTomorrow(records, tomorrow);

    assert.equal(result.keep.length, 0);
    assert.equal(result.move.length, 0);
    assert.equal(result.missing.length, 1);
    assert.equal(result.missing[0].qty, 1);
});

test('analyzeTomorrow: две независимые потребности обрабатываются по отдельности', () => {
    const records = [
        { hall: 'Зал 100 (С)', items: ['Aputure 600d Pro - 1 шт.'], start: 600, end: 700 },
        { hall: 'Зал 110 (С)', items: ['Aputure 300d II - 1 шт.'], start: 600, end: 700 }
    ];
    const tomorrow = [
        { label: 'Зал 100', items: [
            { key: m.norm('Aputure 600d Pro'), name: 'Aputure 600d Pro', star: true, qty: 1, needQty: 1 }
        ] },
        { label: 'Зал 110', items: [
            { key: m.norm('Aputure 300d II'), name: 'Aputure 300d II', star: true, qty: 1, needQty: 1 }
        ] }
    ];

    const result = m.analyzeTomorrow(records, tomorrow);

    assert.equal(result.keep.length, 2);
    assert.equal(result.move.length, 0);
    assert.equal(result.missing.length, 0);
});

test('analyzeTomorrow: пустые входные данные не падают', () => {
    assert.doesNotThrow(() => m.analyzeTomorrow([], []));
    assert.doesNotThrow(() => m.analyzeTomorrow(null, null));
});

/* =========================================================
 * sanitizeFeatures() — устойчивость к повреждённым localStorage-данным
 * ========================================================= */

test('sanitizeFeatures: заполняет дефолты при пустом/битом объекте', () => {
    const r = m.sanitizeFeatures({});
    m.FEATURE_KEYS.forEach(key => assert.equal(typeof r[key], 'boolean'));
    m.COLOR_ITEMS.forEach(item => assert.match(r.colors[item.id], /^#[0-9a-f]{6}$/));
});

test('sanitizeFeatures: отбрасывает некорректные значения цветов и флагов', () => {
    const r = m.sanitizeFeatures({
        compactCards: 'yes', // не boolean — должен стать false (5.6.0: по умолчанию всё выключено)
        colors: { kEq: 'не-цвет', handoff: '#ZZZZZZ', last: '#123abc' }
    });

    assert.equal(r.compactCards, false);
    assert.notEqual(r.colors.kEq, 'не-цвет');
    assert.notEqual(r.colors.handoff, '#zzzzzz');
    assert.equal(r.colors.last, '#123abc');
});

test('sanitizeFeatures: не падает на null/примитивах вместо объекта', () => {
    assert.doesNotThrow(() => m.sanitizeFeatures(null));
    assert.doesNotThrow(() => m.sanitizeFeatures('строка'));
    assert.doesNotThrow(() => m.sanitizeFeatures(42));
    assert.doesNotThrow(() => m.sanitizeFeatures(undefined));
});

/* =========================================================
 * validateCollectorPayload() — Р-9, структурная защита postMessage
 * ========================================================= */

test('validateCollectorPayload: совпадающая версия и корректная структура — принимается', () => {
    const data = {
        type: 'STUDIO1826_V3_DATA',
        version: m.VERSION,
        source: 'studio1826-collector',
        records: [{ hall: 'Зал 100 (С)', items: ['a'], start: 1, end: 2 }]
    };

    const r = m.validateCollectorPayload(data, m.VERSION);
    assert.ok(r);
    assert.equal(r.records.length, 1);
});

test('validateCollectorPayload: несовпадающая версия — versionMismatch, без выброса записей', () => {
    const data = {
        type: 'STUDIO1826_V3_DATA',
        version: '0.0.1-stale',
        source: 'studio1826-collector',
        records: [{ hall: 'X', items: [], start: null, end: null }]
    };

    const r = m.validateCollectorPayload(data, m.VERSION);
    assert.ok(r);
    assert.equal(r.versionMismatch, true);
    assert.equal(r.version, '0.0.1-stale');
    assert.equal(r.records, undefined);
});

test('validateCollectorPayload: чужое сообщение (другой type/source) игнорируется молча', () => {
    assert.equal(m.validateCollectorPayload({ type: 'OTHER', source: 'x' }, m.VERSION), null);
    assert.equal(m.validateCollectorPayload({ type: 'STUDIO1826_V3_DATA', source: 'не-наш' }, m.VERSION), null);
    assert.equal(m.validateCollectorPayload(null, m.VERSION), null);
    assert.equal(m.validateCollectorPayload(undefined, m.VERSION), null);
    assert.equal(m.validateCollectorPayload('строка', m.VERSION), null);
});

test('validateCollectorPayload: повреждённые records фильтруются, не выбрасывая исключение', () => {
    const data = {
        type: 'STUDIO1826_V3_DATA',
        version: m.VERSION,
        source: 'studio1826-collector',
        records: [
            null,
            42,
            { hall: 123, items: ['ok'] }, // hall не строка и не null — отбрасывается
            { hall: null, items: 'не массив' }, // items не массив — отбрасывается
            { hall: 'Зал 1', items: ['a', 5, null, 'b'], start: 'не число', end: NaN } // частично мусорные items/числа
        ]
    };

    const r = m.validateCollectorPayload(data, m.VERSION);

    assert.ok(r);
    assert.equal(r.records.length, 1);
    assert.deepEqual(r.records[0].items, ['a', 'b']);
    assert.equal(r.records[0].start, null);
    assert.equal(r.records[0].end, null);
});

test('validateCollectorPayload: records отсутствует или не массив — null', () => {
    const base = { type: 'STUDIO1826_V3_DATA', version: m.VERSION, source: 'studio1826-collector' };

    assert.equal(m.validateCollectorPayload({ ...base }, m.VERSION), null);
    assert.equal(m.validateCollectorPayload({ ...base, records: 'не массив' }, m.VERSION), null);
});

test('validateCollectorPayload: лимиты на число записей, позиций и длину текста', () => {
    const { validateCollectorPayload, VERSION } = require('../studio1826.user.js');
    const make = records => ({ type: 'STUDIO1826_V3_DATA', source: 'studio1826-collector', version: VERSION, records });

    const many = Array.from({ length: 500 }, () => ({ hall: 'Зал 1', items: ['a'], start: 0, end: 60 }));
    assert.strictEqual(validateCollectorPayload(make(many), VERSION).records.length, 300);

    const longText = 'x'.repeat(501);
    const result = validateCollectorPayload(make([
        { hall: longText, items: ['ok'] },
        { hall: 'Зал 1', items: ['ok', longText] }
    ]), VERSION);

    assert.strictEqual(result.records.length, 1);
    assert.deepStrictEqual(result.records[0].items, ['ok']);

    const items = Array.from({ length: 300 }, () => 'a');
    assert.strictEqual(validateCollectorPayload(make([{ hall: 'Зал 1', items }]), VERSION).records[0].items.length, 200);
});

test('exportSettings/parseSettingsImport: круговой обмен и отказ на чужом тексте', () => {
    const { exportSettings, parseSettingsImport, sanitizeFeatures } = require('../studio1826.user.js');
    const features = sanitizeFeatures({ arrows: false, colors: { kEq: '#112233' } });

    assert.deepStrictEqual(parseSettingsImport(exportSettings(features)), features);
    assert.strictEqual(parseSettingsImport('не json'), null);
    assert.strictEqual(parseSettingsImport('{"app":"other","features":{}}'), null);
    assert.strictEqual(parseSettingsImport('{"app":"studio1826","schema":99,"features":{}}'), null);
    assert.strictEqual(parseSettingsImport('x'.repeat(20001)), null);

    const dirty = parseSettingsImport('{"app":"studio1826","schema":1,"features":{"arrows":"yes","colors":{"kEq":"red"}}}');
    assert.strictEqual(dirty.arrows, false);
    assert.strictEqual(dirty.colors.kEq, '#2563eb');
});


/* =========================================================
 * encodeRequest() / decodeRequest() — запросы main → iframe строкой (4.5.2)
 * ========================================================= */

test('encodeRequest: строка, которую обработчик BX24 не примет за команду', () => {
    const text = m.encodeRequest({ type: 'STUDIO1826_V3_REQUEST', full: true });
    assert.equal(typeof text, 'string');
    assert.equal(text.charAt(0), '{');
    /* BX24: util.split(e.data, ':') → имя команды до первого двоеточия */
    assert.equal(text.split(':')[0], '{"type"');
});

test('decodeRequest: строка и объект (совместимость), чужие сообщения — null', () => {
    const req = { type: 'STUDIO1826_V3_REQUEST', settings: { arrows: false }, mark: ['a|1'], moves: [], full: true };
    assert.deepEqual(m.decodeRequest(m.encodeRequest(req)), req);
    assert.deepEqual(m.decodeRequest(req), req);
    assert.equal(m.decodeRequest('setTitle:["x"]'), null);
    assert.equal(m.decodeRequest('{broken'), null);
    assert.equal(m.decodeRequest('{"type":"OTHER"}'), null);
    assert.equal(m.decodeRequest(null), null);
    assert.equal(m.decodeRequest(42), null);
    assert.equal(m.decodeRequest('{"type":"STUDIO1826_V3_REQUEST","x":"' + 'a'.repeat(600 * 1024) + '"}'), null);
});
