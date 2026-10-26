# CONTEXT — Studio 1826 Userscript

Рабочая память основного скрипта. Читать первым; обновлять после каждой версии.
Подробности по старым версиям (4.1.5–5.6.6, причины решений) — в `HISTORY.md`, список изменений — таблица в `README.md`.

## Текущее состояние (26.10.2026)

- **Версия на main: 5.6.6** (`@version` в `studio1826.user.js` и `studio1826.meta.js`, `VERSION` в коде, `package.json` совпадают; тест `version-sync`).
  Бэкапы: ветки `backup-vX.Y.Z` (последняя `backup-v5.6.6`) и zip в `~/ClaudeCode/backups/` на Mac Ильи. Releases не создавать: их читает Updater.
- Файл `studio1826.user.js` — ~8400 строк, один IIFE, `@grant none`, без сборщика и библиотек.
- Проверки GitHub (`.github/workflows/test.yml`): задача `test` (`node --check`, `npm test`, 64 теста) и задача `browser`
  (Playwright 1.64.1 только в CI: smoke, ui-header, ui-notes, ui-equipment, ui-layout). Все зелёные на `c7e6b5a`.
- «Этап 10» из README закрыт полностью. Открыто только: кнопка «Выплата» у пользователей Яндекс Браузера (см. «Открытые задачи»).

## Правила (Илья)

- Studio1826Updater (`Studio1826UpdaterDMG/`, `app.version`, DMG) и скрипт пропусков (`studio1826-passes.user.js`) ведут другие треды — не трогать.
- `@match`, `@updateURL`, `@downloadURL`, имя и путь файла не менять: Tampermonkey и Updater (Safari) берут скрипт по одному raw-URL с main.
- `computePayout` не менять ради дизайна; изменения расчёта — только по прямой просьбе Ильи.
- В main — только после прямого «да» Ильи в треде. Не писать «тесты пройдены» без запуска.
- Настройки пользователей при обновлении не сбрасываются (ключи localStorage без версии скрипта).

## Архитектура

```
studio1826.user.js
├── STYLES (стр. ~93): booking, panel (в т.ч. заметки), widget, native (кнопка в шапке), v5 …
├── Данные: SERVICES (id light/bg/cleaning), BONUS_IDS, HOURS_BONUSES, EQUIPMENT (~1869)
├── Чистые функции (экспорт для тестов): computePayout (~2050), validateCollectorPayload,
│   sanitizeFeatures/exportSettings/parseSettingsImport, buildDayList/parseDayList, analyzeTomorrow,
│   computeTomorrowPlan, dealToRecord/summarizeEquipment/findDuplicateRows, findEquipment …
├── startCollector() (~3322) — iframe app.bitrix24.ru: разбор карточек, обводка, стрелки, плашки «ЗАВТРА»,
│   ⚙ у зала, заметки под «Помещениями», «пульс»; handleRequest() в try/catch
├── startMainUI() (~5379) — 1826studio.bitrix24.ru: кнопка «Выплата» в шапке (ensureChip) + окно,
│   расчёт, «Оборудование» через BX.rest (crm.deal.list + productrows, только чтение), Настройки, Диагностика
├── THEME (~7891) — основной цвет и «Скрывать лишнее»
└── запуск под IS_BROWSER + module.exports для node:test
```

- iframe → main: `postMessage` (`STUDIO1826_V3_DATA`, `…_PULSE`, `…_DIAG`) на `MAIN_ORIGIN`. main → iframe: **только строкой**
  `encodeRequest({ type: 'STUDIO1826_V3_REQUEST', … })` на `APP_ORIGIN` (BX24 в iframe падает на объектах). Поля запроса:
  `settings`, `mark`, `moves`, `tiles`, `tileLinks`, `off`, `diag`, `full`, `flashNotes`.
- localStorage: `studio1826.v3.settings` (админы по филиалам, `rateEnabled`, `coffeeEnabled`, `offBonuses`, `lightSetupEnabled` для совместимости),
  `studio1826.v32.features` (12 функций + цвета), `studio1826.v4.ui` (вкладка, оформление `skinV:2`, `settingsGroup`),
  `studio1826.notes` (текст заметок, в окне app.bitrix24.ru), `studio1826-theme-primary-color`, `studio1826-hide-ui-state`.

## Поведение, которое легко сломать

- **Расчёт** (`computePayout`): услуги делятся на админов, бонус часов и ставка — нет; 10% от оборудования делится; кофе 30% только на П
  (1–2 админа). `options.off` (BONUS_IDS) выключает составляющие; суммы для кнопок — `servicesPer[].value`, `hoursBonusValue`, `equipmentValue`.
  Ставка всегда `DEFAULT_RATE` 3000 (кнопка `[data-bonus="rate"]` = `rateEnabled`; сохранённая сумма не читается).
- **Окно «Бонусы»** (5.6.5): `#s3-bonuses` — 6 кнопок «название / N× / X ₽», выключенная бледнее и зачёркнута, не входит в выплату и «Копировать».
- **Кнопка в шапке** (`ensureChip`): позиция абсолютная после последнего `#air-header-menu .main-buttons-item`, справа ограничители
  `.air-header__personal-info > *` и `header.right − 152`. Размеры `slot.dataset.fit`: `full` → `short` (без слова «Выплата») → `min`
  (без переключателя, тогда он в заголовке окна). Не влезает или нет `#header.air-header` → `data-mode="float"` (плашка слева внизу).
  Пока `s26-overlay-open`, режим не трогать. Не вставлять кнопку внутрь меню или `.air-header__buttons` (Bitrix уводит пункты в «Еще»).
- **Заметки** (5.6.5, функция `notes`): лист с текстом «Помещения» → карточка (родитель ≥2 детей, высота > 2 заголовков) → `#studio1826-notes`
  после неё; тик 3 с возвращает узел после перерисовки. «?» в Настройках → «Календарь» сворачивает окно и шлёт `flashNotes`.
  Раздел «Календарь» последний, чтобы сохранённый `settingsGroup` не сдвигался. Проверено вживую 25.10.
- **Настройки по умолчанию** (5.6.3/5.6.4): новый пользователь — всё вкл., кроме `stripes`; `kEq`/`kFrame` #e32400, done #e0edd4; «Скрывать лишнее» вкл.
  `STAGES[].color` — исходный цвет Bitrix (по нему узнаётся стадия), `def` — цвет скрипта; сохранённый исходный цвет заменяется на `def`.
- **Плашки «ЗАВТРА»**: только оборудование к ПЕРВОЙ брони зала следующего дня; нужное позже днём — без плашки. Одна строка под последней бронью
  дня + клетка времени, ширина колонки − 6 px, до 3 строк `✓/↻/+`.
- **Формат копирования**: «Зал N» и строки «1 шт. | название» (` (утром N)`, ` *` у первой брони); `parseDayList` читает и старый формат.
- **Сборщик**: принимаются данные только от iframe прямо в документе; пока `cardsMissing`, опрос с `full`. Тишина > 12 с → «Календарь не отвечает».
- **Диагностика**: без имён и текстов броней. `main.chip {mode, fit, header, anyHeader, menuRight, blockers, menuItems, devicePixelRatio}`,
  `main.iframes` (для iframe без `src` — `form→` адрес формы), `main.overlay`, `main.collectorPulse`, журнал своих ошибок + счётчик чужих.

## Тесты

- `npm test` — node:test (`tests/*.test.js`: 64 своих + тесты пропусков другого треда, если они лежат в tests/).
- Браузерные (не в `npm test`, но в CI): `NODE_PATH=<каталог с playwright> CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node tests/<имя>.js`:
  `smoke.js` (основное окно + iframe-сборщик, настройки, пульс, тишина), `ui-header.js` (шапка, узкое место), `ui-notes.js` (заметки),
  `ui-equipment.js`, `ui-layout.js`. Готовый playwright на Mac был в scratchpad прежних сессий; если пропал — `npm install --no-save playwright` во временной папке.
- В заглушках страниц указывать `charset=utf-8`, иначе кириллица ломается и поиск по тексту («Помещения») не срабатывает.

## Как выкладывать и проверять

- Клон: `~/ClaudeCode/studio-1826-installer` (локальный HEAD отстаёт; рабочее дерево сверять с `origin/main` через `git diff origin/main -- <файл>`).
  `git push` с Mac не работает.
- Выкладка без Chrome: встроенный браузер Claude (вход в GitHub есть). `python3 -m http.server 8765` в папке scratchpad с файлами и `go.html`,
  которая кладёт файлы base64 во фрагмент и уходит на `github.com/…/upload/<ветка>/<папка>`; там JS: File → DataTransfer →
  `input#upload-manifest-files-input`, проверить список файлов и `commit-choice = direct`, заполнить `#commit-summary-input`, «Commit changes».
  Порядок: тесты → скрипт (+meta, package.json, README) → CONTEXT → workflow. Промежуточный коммит с одними тестами может быть красным.
  После каждой загрузки — `git fetch` и `cmp` с локальным файлом. Новое в CI — сначала в тестовой ветке.
- Бэкап: GitHub → Branches → New branch `backup-vX.Y.Z`; zip: `git archive origin/main … > ~/ClaudeCode/backups/studio1826-vX.Y.Z.zip`.
- Живая проверка: Chrome Ильи (Claude in Chrome), `https://1826studio.bitrix24.ru/marketplace/app/129/`; версия в подвале окна.
  raw.githubusercontent кэширует ~5 мин, Tampermonkey обновляется не сразу. Встроенный браузер: вход в Bitrix есть, Tampermonkey нет;
  iframe календаря изнутри не открыть (без BX24 пустой) — календарь проверяется только через Tampermonkey.

## Открытые задачи

1. **Кнопка «Выплата» в Яндекс Браузере** (две сотрудницы: Windows с масштабом 200%, окно 1440×772, и Mac): окно остаётся плашкой слева внизу.
   Ширины хватает (при 1440 на Mac запас ~300 px), значит, вероятно, у их учётных записей другая шапка Bitrix без `#header.air-header`.
   Не подтверждено. Ждём отчёт «Диагностики» из 5.6.5+ (`main.chip.anyHeader`); Илья пришлёт, когда сможет. Проверка: открыть календарь
   под их входом в Chrome — если плашка и там, дело в виде Bitrix, а не в браузере.
2. (по желанию Ильи) Проверка «использование до объявления» линтером только в CI — нужна договорённость о dev-инструменте.
3. Ветка `test-ci-5.6.6` осталась на GitHub, её можно удалить; `wip/overlay-robustness` — архив, не вливать.
