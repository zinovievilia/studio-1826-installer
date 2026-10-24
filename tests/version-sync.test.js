'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const header = text => (/\/\/ @version\s+(\S+)/.exec(text) || [])[1];

test('@version в user.js и meta.js, VERSION и package.json совпадают', () => {
    const userscript = read('studio1826.user.js');
    const meta = read('studio1826.meta.js');
    const code = (/const VERSION = '([^']+)'/.exec(userscript) || [])[1];
    const pkg = JSON.parse(read('package.json')).version;

    assert.ok(code, 'VERSION не найдена');
    assert.strictEqual(header(userscript), code, '@version в user.js ≠ VERSION');
    assert.strictEqual(header(meta), code, '@version в meta.js ≠ VERSION');
    assert.strictEqual(pkg, code, 'package.json ≠ VERSION');
});

test('meta.js содержит только заголовок и те же @match/@updateURL/@downloadURL', () => {
    const userscript = read('studio1826.user.js');
    const meta = read('studio1826.meta.js');
    const lines = (text, tag) => text.split('\n').filter(l => l.includes(`// @${tag} `)).map(l => l.trim());

    assert.ok(meta.includes('// ==UserScript=='));
    assert.ok(meta.includes('// ==/UserScript=='));
    assert.ok(!meta.includes('function'), 'в meta.js не должно быть кода');

    ['match', 'updateURL', 'downloadURL'].forEach(tag => {
        assert.deepStrictEqual(lines(meta, tag), lines(userscript, tag), `@${tag} расходится`);
    });
});
