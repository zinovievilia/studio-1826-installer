'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const m = require(path.join('..', 'studio1826.user.js'));
const fixture = require('./fixtures/day-2026-10-25.json');

/* Брони дня из снимка Bitrix24 (24.10.2026): так же, как в fetchDayRecords — без отменённых (семантика F). */
function recordsFromFixture(fx) {
    return fx.deals
        .filter(deal => deal.sem !== 'F')
        .map(deal => m.dealToRecord({
            ID: deal.id,
            STAGE_ID: 'NEW',
            UF_CRM_DATETIME_START: `${fx.day}T${deal.start}:00+03:00`,
            UF_CRM_DATETIME_END: `${fx.day}T${deal.end}:00+03:00`
        }, deal.rows.map(([name, qty]) => ({ PRODUCT_NAME: name, QUANTITY: qty }))));
}

test('moscowDay: сутки по Москве, а не по часовому поясу компьютера', () => {
    /* 22:30 UTC 24.10 — это уже 01:30 25.10 в Москве */
    const now = new Date('2026-10-24T22:30:00Z');

    assert.equal(m.moscowDay(0, now), '2026-10-25');
    assert.equal(m.moscowDay(1, now), '2026-10-26');
    assert.equal(m.moscowDay(1, new Date('2026-10-24T20:30:00Z')), '2026-10-25');
});

test('moscowDay: переход через конец месяца и года', () => {
    assert.equal(m.moscowDay(1, new Date('2026-10-31T10:00:00Z')), '2026-11-01');
    assert.equal(m.moscowDay(1, new Date('2026-12-31T10:00:00Z')), '2027-01-01');
});

test('dayBounds: [00:00 дня, 00:00 следующего дня) по Москве', () => {
    assert.deepEqual(m.dayBounds('2026-10-31'), { from: '2026-10-31T00:00:00+03:00', to: '2026-11-01T00:00:00+03:00' });
    assert.deepEqual(m.dayBounds('2026-12-31'), { from: '2026-12-31T00:00:00+03:00', to: '2027-01-01T00:00:00+03:00' });
});

test('moscowParts: минуты и дата по Москве из строки CRM с любым поясом', () => {
    assert.deepEqual(m.moscowParts('2026-10-25T23:30:00+03:00'), { day: '2026-10-25', minutes: 1410 });
    assert.deepEqual(m.moscowParts('2026-10-25T20:30:00Z'), { day: '2026-10-25', minutes: 1410 });
    assert.deepEqual(m.moscowParts('2026-10-25T00:00:00+03:00'), { day: '2026-10-25', minutes: 0 });
    assert.equal(m.moscowParts('не дата'), null);
    assert.equal(m.moscowParts(null), null);
});

test('dealToRecord: зал, время и позиции в формате карточки календаря', () => {
    const record = m.dealToRecord(
        { ID: 7, STAGE_ID: 'NEW', UF_CRM_DATETIME_START: '2026-10-25T17:00:00+03:00', UF_CRM_DATETIME_END: '2026-10-25T19:00:00+03:00' },
        [
            { PRODUCT_NAME: 'Фон холщовый короткий Тёмный', QUANTITY: 1 },
            { PRODUCT_NAME: 'Зал 75 (С)', QUANTITY: 2 },
            { PRODUCT_NAME: 'Уборка', QUANTITY: '0.4' }
        ]
    );

    assert.equal(record.id, '7');
    assert.equal(record.hall, 'Зал 75 (С)');
    assert.equal(record.start, 1020);
    assert.equal(record.end, 1140);
    assert.deepEqual(record.items, ['Фон холщовый короткий Тёмный - 1 шт.', 'Зал 75 (С) - 2 шт.', 'Уборка - 0,4 шт.']);
});

test('dealToRecord: без строки зала брони нет (null), пустые и битые данные не падают', () => {
    assert.equal(m.dealToRecord({ ID: 1 }, [{ PRODUCT_NAME: 'Доплата за час', QUANTITY: 1 }]), null);
    assert.equal(m.dealToRecord({ ID: 1 }, null), null);
    assert.equal(m.dealToRecord({ ID: 1 }, []), null);

    const record = m.dealToRecord({ ID: 2 }, [{ PRODUCT_NAME: 'Гримерное место 1 (П)', QUANTITY: 1 }]);

    assert.equal(record.hall, 'Гримерное место 1 (П)');
    assert.equal(record.start, null);
    assert.equal(record.end, null);
});

test('снимок завтрашнего дня: 72 действующие брони, отменённая не попала', () => {
    const records = recordsFromFixture(fixture);

    assert.equal(records.length, 72);
    assert.ok(!records.some(record => record.items.some(item => /Profoto Zoom 2 - 9 шт/.test(item))));
});

test('оборудование на завтра, Павелецкая: как в реальном списке (Зал 100, фон Песочный, 1 шт., без звёздочки)', () => {
    const records = m.recordsOfCategory(recordsFromFixture(fixture), 'P');
    const summary = m.summarizeEquipment(records);

    assert.equal(summary.text, 'Зал 100\nФон холщовый короткий Желто-коричневый - Песочный — 1 шт.');
    assert.equal(summary.starCount, 0);
    assert.deepEqual(summary.totals, [{ name: 'Фон холщовый короткий Желто-коричневый - Песочный', qty: 1, halls: 1 }]);
    assert.equal(summary.halls[0].items[0].sources.length, 1);
    assert.equal(summary.halls[0].items[0].sources[0].start, 17 * 60);
});

test('оборудование на завтра, Серпуховская: два зала, источники и итог по студии', () => {
    const summary = m.summarizeEquipment(m.recordsOfCategory(recordsFromFixture(fixture), 'C'));

    assert.equal(summary.text, 'Зал 75\nФон холщовый короткий Тёмный — 1 шт.\n\nЗал 105\nProfoto Zoom 2 — 2 шт.');
    assert.deepEqual(summary.totals.map(total => [total.name, total.qty]), [
        ['Фон холщовый короткий Тёмный', 1],
        ['Profoto Zoom 2', 2]
    ]);
    assert.deepEqual(summary.halls.map(hall => hall.label), ['Зал 75', 'Зал 105']);
});

test('итог по студии: между залами суммируется, внутри зала — максимум', () => {
    const rec = (id, hall, start, end, item) => ({ id, hall, start, end, items: [`${hall} - 1 шт.`, item] });
    const summary = m.summarizeEquipment([
        rec('1', 'Зал 70 (С)', 600, 660, 'Profoto Zoom 2 - 2 шт.'),
        rec('2', 'Зал 70 (С)', 720, 780, 'Profoto Zoom 2 - 3 шт.'),
        rec('3', 'Зал 75 (С)', 600, 660, 'Profoto Zoom 2 - 1 шт.')
    ]);

    const total = summary.totals.find(item => item.name === 'Profoto Zoom 2');

    /* Зал 70: максимум из 2 и 3 = 3; Зал 75: 1; всего 4 (а не 6 и не 3) */
    assert.equal(total.qty, 4);
    assert.equal(total.halls, 2);
    assert.equal(summary.halls.find(hall => hall.label === 'Зал 70').items[0].sources.length, 2);
});

test('одна бронь не считается дважды, повторы внутри брони суммируются', () => {
    const summary = m.summarizeEquipment([
        { id: '1', hall: 'Зал 70 (С)', start: 600, end: 660, items: ['Зал 70 (С) - 1 шт.', 'Profoto Zoom 2 - 1 шт.', 'Profoto Zoom 2 - 1 шт.'] }
    ]);

    assert.equal(summary.totals[0].qty, 2);
    assert.equal(summary.halls[0].items[0].sources.length, 1);
});

test('пустые и некорректные данные: сводка не падает', () => {
    assert.deepEqual(m.summarizeEquipment([]).halls, []);
    assert.deepEqual(m.summarizeEquipment(null).halls, []);
    assert.equal(m.recordsOfCategory(null, 'P').length, 0);
    assert.equal(m.recordsOfCategory([{ hall: 'Зал без филиала' }], 'P').length, 0);
});

test('сводка из данных REST совпадает с buildDayList по тексту для всех залов дня', () => {
    const records = recordsFromFixture(fixture);

    ['C', 'P'].forEach(category => {
        const filtered = m.recordsOfCategory(records, category);

        assert.equal(m.summarizeEquipment(filtered).text, m.buildDayList(filtered).text);
    });
});

test('findDuplicateRows: двойной ввод позиции в одной брони, «Доплата за час» не считается', () => {
    const issues = m.findDuplicateRows([
        { id: '1', hall: 'Зал 75 (П)', start: 600, items: ['Парковка (1 час) (П) - 8 шт.', 'Парковка (1 час) (П) - 8 шт.', 'Зал 75 (П) - 8 шт.'] },
        { id: '2', hall: 'Зал 70 (С)', start: 660, items: ['Доплата за час - 1 шт.', 'Доплата за час - 1 шт.', 'Зал 70 (С) - 2 шт.'] },
        { id: '3', hall: 'Зал 50 (С)', start: 700, items: ['Зал 50 (С) - 1 шт.'] }
    ]);

    assert.deepEqual(issues, [{ id: '1', hall: 'Зал 75 (П)', start: 600, names: ['Парковка (1 час) (П) ×2'] }]);
    assert.deepEqual(m.findDuplicateRows(null), []);
});

test('planTomorrowTiles: плашка на зал утра — оставить, принести и откуда, собрать; стрелки от последних броней', () => {
    const today = [
        { hall: 'Зал 70 (С)', start: 600, end: 1260, items: ['Зал 70 (С) - 11 шт.', 'Profoto Zoom 2 - 2 шт.'] },
        { hall: 'Зал 75 (С)', start: 900, end: 1200, items: ['Зал 75 (С) - 5 шт.', 'Фон холщовый короткий Тёмный - 1 шт.'] }
    ];
    const tomorrowRecords = [
        { hall: 'Зал 75 (С)', start: 600, end: 720, items: ['Зал 75 (С) - 2 шт.', 'Фон холщовый короткий Тёмный - 1 шт.', 'Profoto Zoom 2 - 3 шт.'] },
        { hall: 'Зал 75 (С)', start: 780, end: 840, items: ['Зал 75 (С) - 1 шт.'] }
    ];
    const tomorrow = m.parseDayList(m.buildDayList(tomorrowRecords).text);
    const plan = m.planTomorrowTiles(m.analyzeTomorrow(today, tomorrow), tomorrowRecords);

    assert.equal(plan.tiles.length, 1);
    assert.equal(plan.tiles[0].hall, 'Зал 75');
    assert.equal(plan.tiles[0].start, 600);
    assert.deepEqual(plan.tiles[0].items.map(item => [item.kind, item.name, item.qty, item.from]), [
        ['keep', 'Фон холщовый короткий Тёмный', 1, 'Зал 75'],
        ['move', 'Profoto Zoom 2', 2, 'Зал 70'],
        ['missing', 'Profoto Zoom 2', 1, '']
    ]);
    assert.deepEqual(plan.links.map(link => [link.from, link.to, link.kind]).sort(), [
        ['Зал 70 (С)|600', 'Зал 75', 'move'],
        ['Зал 75 (С)|900', 'Зал 75', 'keep']
    ]);
});

test('planTomorrowTiles: нет анализа — пустой план', () => {
    assert.deepEqual(m.planTomorrowTiles(null, null), { tiles: [], links: [] });
});
