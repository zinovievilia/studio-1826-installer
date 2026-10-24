# CONTEXT — Studio 1826 Userscript

Рабочая память проекта. Обновлять после каждого существенного этапа.
Не история переписки — только то, что нужно для продолжения работы.

## Текущее состояние

- **Версия:** 4.4.0 (`@version` в `studio1826.user.js` / `studio1826.meta.js`
  и `VERSION` внутри кода синхронизированы).
- **Файл:** `studio1826.user.js`, ~5340 строк, единый IIFE, `@grant none`,
  без сборщика.
- Этапы 1–5 из `README.md` (критические исправления, вероятные ошибки,
  превентивные улучшения, Р-8) — **повторно проверены по коду** 22.10.2026,
  не только по статусу в документации. Регрессий не найдено.
- Добавлена тестовая инфраструктура (node:test, 37 тестов, все зелёные).
- UX-редизайн структуры выполнен в 4.4.0 (см. раздел «Информационная архитектура 4.4.0»).

## Архитектура (актуально на 4.2.0)

```
studio1826.user.js
├── IIFE, 'use strict', VERSION = '4.2.0'
├── Данные: SERVICES, EQUIPMENT (строки ~1000), HOURS_BONUSES
├── Утилиты: norm, parseNumber, containsKey, quantity, findEquipment
├── computePayout(records, options)   ← ЧИСТАЯ функция расчёта выплат,
│                                        вынесена из compute() в 4.1.5
├── validateCollectorPayload(data, version, type) ← ЧИСТАЯ функция,
│                                        Р-9 защита postMessage, вынесена в 4.1.5
├── sanitizeFeatures/loadFeatures/saveFeatures — localStorage (studio1826.v32.features)
├── buildDayList / parseDayList / analyzeTomorrow — день/перенос оборудования
├── startCollector()  — iframe (app.bitrix24.ru), строки ~1950–3400
│   ├── parseCard/parseCardUncached — разбор карточек, кэш по WeakMap
│   ├── getTimeAxis() — шкала времени по DOM-подписям (не тестируется в node)
│   ├── computeReuse/renderArrows/renderMoves — SVG-слои поверх карточек
│   └── send()/postMessage → MAIN_ORIGIN, слушает REQUEST_TYPE от main
├── startMainUI()      — главное окно (1826studio.bitrix24.ru), строки ~3400–4830
│   ├── compute() = тонкая обёртка над computePayout(records, {...})
│   ├── setupSettings/setupDayTools — UI настроек и панели «оборудование за день»
│   └── слушает MESSAGE_TYPE от iframe через validateCollectorPayload()
├── THEME (IIFE)        — цвет темы Bitrix + скрытие элементов интерфейса
└── ЗАПУСК — обёрнуто в `if (IS_BROWSER)` (см. ниже), + module.exports для тестов
```

### Каналы данных (без изменений, см. также README)
- iframe → main: `window.top.postMessage(payload, MAIN_ORIGIN)`, тип `STUDIO1826_V3_DATA`
- main → iframe: `frame.contentWindow.postMessage(..., APP_ORIGIN)`, тип `STUDIO1826_V3_REQUEST`
- localStorage: `studio1826.v3.settings`, `studio1826.v32.features`,
  `studio1826-theme-primary-color`, `studio1826-hide-ui-state`

## Что изменено в 4.1.5 (рефакторинг тестируемости, НЕ бизнес-логики)

1. **`computePayout(records, options)`** — чистая функция верхнего уровня
   (рядом с `HALL_INDEX`/`COFFEE_KEY`, до блока настроек функций). `compute()`
   внутри `startMainUI()` теперь — тонкая обёртка, передающая текущее
   состояние (`records`, `category`, `admins`, ...). Арифметика идентична
   оригиналу построчно.
2. **`validateCollectorPayload(data, currentVersion, messageType)`** — чистая
   функция структурной защиты postMessage (Р-9 + фильтрация повреждённых
   `records`), вызывается из обработчика `message` в `startMainUI()`.
   Обработчик был `const data = event.data`, теперь использует
   `event.data.selectedDate` / `event.data.category` напрямую в двух местах
   ниже по коду (не забыть при будущих правках — `data` больше не объявлена
   в этой области видимости).
3. **Guard `IS_BROWSER`** вокруг блока «ЗАПУСК» (`THEME.init()` + `launch()`):
   `typeof window/document/location !== 'undefined'`. В Tampermonkey/Safari
   UserScripts эти объекты всегда есть — поведение не меняется. Позволяет
   `require()`-ить файл в node:test.
4. **`module.exports`** в самом низу файла, под guard
   `typeof module !== 'undefined' && module.exports` — отдаёт чистые функции
   для тестов. В браузере `module` не существует — код не выполняется.
5. **`tests/pure-functions.test.js`** — 37 тестов node:test. Запуск:
   `npm test` или `node --test tests/*.test.js`
   (⚠️ `node --test tests/` без маски файла падает с `MODULE_NOT_FOUND` в
   текущем окружении Node 22 — использовать именно glob `tests/*.test.js`).

## Информационная архитектура 4.2.0

Одна панель `#studio1826-widget-v3` (сворачивается в заголовок), внутри:
- Вкладка **Обзор** (по умолчанию, `#s-panel-overview`): статус `#s-branch-status`
  (филиал, число броней, дата) и `#s-actions` — кнопки «Скопировать оборудование
  за день» и «Не разбирать на завтра…» (строятся в `setupDayTools`).
- Вкладка **Выплаты** (`#s-panel-payout`): прежний расчёт, админы, ставка.
- Вкладка **Настройки** (`#studio1826-settings-v32`, `.s-panel`): 5 сворачиваемых
  `<details>`-групп, строятся в `setupSettings`; контролы синхронизируются в
  `activateTab('settings')` через `fillSettingsControls`.
- Постоянный итог `.s-summary` (`#s3-payout`, `#s3-rate-note`, «Копировать»).
- Окно «Что не разбирать на завтра» (`DAY_DIALOG_ID`) остаётся отдельным модальным
  окном, якорь — сама панель.
Удалено как дубли: шестерёнка и всплывающие настройки, плавающая панель кнопок,
кнопки-дублёры стрелок (переключатели остались в Настройках), `placeBar`.
Новые вкладки подбираются в `TABS` внутри `create()`.

## Подтверждённые проверкой кода дефекты (НЕ со слов документации)

Все проверены прямым чтением исходника 22.10.2026, подтверждены тестами где применимо:

| ID | Статус | Где в коде (4.1.5, актуальные номера строк могут сдвинуться) |
|----|--------|------|
| Б-1 | ✅ подтверждено | `computePayout()`: `coffee += quantity(item)` |
| Б-2 | ✅ подтверждено | `analyzeTomorrow()`: `if (need.left <= 0) return;` перед `lasts.forEach` |
| В-3 | ✅ подтверждено | `getTimeAxis()`: проверка `(value % 1440) === (previous % 1440)` перед fallback-циклом |
| В-4 | ✅ подтверждено | `parseCard()`: ключ кэша включает `hallText` (`.reserve-title-label`) |
| В-5 | ✅ подтверждено | `update()`: ветка `else if (categorySource === 'default')` → `inferCategoryFromRecords()` |
| Р-6 | ✅ подтверждено | `document.addEventListener('visibilitychange', ...)` → `requestData()` |
| Р-7 | ✅ подтверждено | `buildDayList()`: `first = (allTimed && timed.length > 0) ? Math.min(...) : null` |
| Р-8 | ✅ не является активным дефектом | см. README, Этап 5 — обосновано: единая регистрация листенера на window, защищена флагом `__studio1826CollectorV3` |
| Р-9 | ✅ подтверждено, вынесено в `validateCollectorPayload()` | origin + type + source + version + структурная фильтрация records |

**Новых критических уязвимостей аудит не выявил.** Проверено отдельно:
- Нет `innerHTML`/`outerHTML`/`eval`/`new Function`/`insertAdjacentHTML` во
  всём файле — весь DOM строится через `el()` (createElement + setAttribute +
  createTextNode) или `DOMParser` для статичного SVG-литерала иконки копирования.
- `postMessage`: `event.origin` проверяется на обеих сторонах
  (`MAIN_ORIGIN`/`APP_ORIGIN`) до чтения `event.data`.
- Все 3 обращения к `JSON.parse(localStorage.getItem(...))` обёрнуты в
  try/catch с безопасным дефолтом, а не просто `try{}catch{}` без валидации —
  дальше идёт структурная проверка (`sanitizeFeatures`, `[1,2,3].includes(...)`,
  `Number.isFinite(...)`).
- Цвет темы (`THEME.setColor`) валидируется regex `^#[0-9a-f]{6}$` перед
  использованием в CSS — нет инъекции произвольного CSS через localStorage.

## Известные ограничения тестирования

- `getTimeAxis()`, `getCategoryFromBranch()`, `computeReuse()`,
  `renderArrows()`, `renderMoves()`, `parseCard()` и весь UI (`setupSettings`,
  `setupDayTools`, `create()/update()` виджета) **не покрыты автотестами** —
  завязаны на реальный DOM Bitrix24 (`getBoundingClientRect`, MutationObserver
  над живой страницей). Браузерное тестирование в этой сессии недоступно
  (нет headless-доступа к реальному Bitrix24-аккаунту с тестовыми данными).
  Эти участки проверены только статическим чтением кода.
- Новая панель проверена только в headless Chromium на заглушке страницы
  (переключение вкладок, видимость панелей, отсутствие ошибок JS); живой Bitrix24
  и оверлей календаря (бейджи/стрелки) не проверялись. Скриншоты вебархива
  (статический рендер без JS) ненадёжны — выводы по UX сделаны по DOM и CSS.
- Регрессионный чек-лист из README («Этап 4») требует ручной проверки в
  живом Bitrix24 — не выполнялся в этой сессии по той же причине.

## Незавершённые задачи / следующий шаг

**Следующий шаг: ручная проверка 4.2.0 в живом Bitrix24 (чек-лист README, этап 4).**

Не начат в этой сессии. Материалы для анализа:
- Вебархив интерфейса: `91896586-4_PMS____________________________________.webarchive`
  (23.3 МБ, загружен пользователем — лежит в uploads текущей сессии, нужно
  переоткрыть/запросить заново в новой сессии, т.к. путь привязан к сессии).
- Текущий код интерфейса: `setupSettings()`, `setupDayTools()`, `create()`,
  `update()` в `startMainUI()` — вся разметка строится через `el()`, стили —
  в объекте `STYLES` (`booking`, `panel`, `widget`) в начале файла.

План по мастер-инструкции (п. 8):
1. Разобрать вебархив (скриншоты/DOM-снимок) — отделить элементы Bitrix24 от
   элементов userscript.
2. Описать реальные сценарии работы администратора (открыт список функций в
   README — расчёт, бронирование, оборудование, настройки).
3. Спроектировать информационную архитектуру (гипотеза из мастер-инструкции:
   обзор/оборудование/выплаты/настройки — не обязательна, проверить по
   сценариям).
4. Реализовать в `studio1826.user.js`, сохранив все `FEATURE_KEYS`,
   localStorage-ключи и бизнес-правила расчёта (`computePayout` не менять
   ради дизайна).
5. Повторно прогнать `npm test` — редизайн не должен задевать протестированные
   чистые функции (они не завязаны на DOM-разметку виджета).

## Внешние зависимости (граница с Studio1826Updater)

Не менять в рамках userscript-задач. Для справки (контекст Updater — в
claude.ai-проекте "1826Studio", документ `Studio1826Updater.md`):
- Updater скачивает `studio1826.user.js` с
  `raw.githubusercontent.com/zinovievilia/studio-1826-installer/main/studio1826.user.js`
  — путь и формат файла менять нельзя без согласования.
- `studio1826.meta.js` используется Tampermonkey (`@updateURL`) для лёгкой
  проверки версии без скачивания всего скрипта — это **не** Updater; Updater
  его не читает (он сравнивает `app.version`, отдельный файл для самого
  приложения, не для userscript).
- `@match`, `@updateURL`, `@downloadURL` не менялись в 4.1.5.

## Что сделано в 4.3.0

Наблюдатель вместо опроса 250 мс; `requestData(full)` + `send(force)` только при первом запросе/изменениях; лимиты `MAX_RECORDS/MAX_ITEMS/MAX_TEXT` в `validateCollectorPayload`; `healthNote` в «Обзоре»; сумма и копирование в свёрнутом заголовке; ключ `studio1826.v4.ui` (последняя вкладка); `tests/version-sync.test.js`, `tests/smoke.js` (запуск: `NODE_PATH=$(npm root -g) node tests/smoke.js`), `.github/workflows/test.yml`.
Новый localStorage-ключ: `studio1826.v4.ui`.

## План улучшений и оптимизации

Аудит кода 24.10.2026 — полный список с приоритетами P1–P3 в `README.md`, «Этап 9».
Осталось: кэш шкалы времени и пересчёт `processCards()` только при изменении данных,
батчинг чтения/записи раскладки, единый `SELECTORS`, миграции настроек (номер схемы уже в экспорте, `SETTINGS_SCHEMA`), вынос
разбора карточки и `computeReuse` в чистые функции. Пункты с пометкой «нужен DOM» требуют `outerHTML` календаря Bitrix.
