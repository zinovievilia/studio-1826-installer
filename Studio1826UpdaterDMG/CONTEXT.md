# CONTEXT — Studio1826Updater (исходники DMG)

Рабочая память по приложению. Обновлено 24.10.2026 (версия 4.1.0, ветка `claude/project-thread-070e3g`).
Пользовательское описание — `README.md` этой папки. Userscript (`studio1826.user.js`) здесь не меняем.

## Что это

macOS 13+ (SwiftUI + AppKit), бандл `Studio1826Updater.app`, id `studio1826.updater`. С 4.0.0 — не только
обновлятор: клик по значку — поповер 460×660 с вкладками Скрипты · Касса · Ссылки · Настройка, выбор браузера
в шапке, «Проверить обновления» внизу; правый клик — NSMenu; ⌃⌥Пробел — панель быстрых ответов поверх любого окна.

## Решения 4.0.0 (почему так)

- **Всё под значком (4.1)**: в 4.0 было отдельное окно — Илье больше нравится поповер «как раньше», окно убрано.
  Редактор скрипта и подтверждения — внутри поповера (без sheet/alert, они конфликтуют с transient-поповером);
  на время NSSavePanel/NSOpenPanel поповер закрепляется (`PopoverPin`).
- **Быстрые ответы**: Carbon `RegisterEventHotKey` (без разрешений) + `NSPanel` `.nonactivatingPanel` — браузер остаётся
  активным, после Enter курсор там же. Вставка — CGEvent ⌘V, требует Accessibility (`AXIsProcessTrusted`); без него — только копирование.
  Подсказки по тексту клиента автоматически (без хоткея) возможны только в userscript — он видит чат; это задача того направления.
- **Меню «Правка»** (`ensureEditMenu`) — без него в полях не работают ⌘C/⌘V у LSUIElement-приложения.
- **Браузер выбирается первым** (`BrowserService.selected`, UserDefaults `selectedBrowser`); шаги настройки зависят от него.
- **Tampermonkey**: скрипт ставится открытием raw-URL в браузере (Tampermonkey перехватывает `.user.js`), дальше обновляет
  по `@updateURL` сам. Старая логика записи файла в папку расширения Chrome удалена — Tampermonkey хранит скрипты не файлами.
  Наличие ищется по ID `dhdgffkkebhmkfjojejmpbldmpobfkfo` / `gcalenpjmijncebpfijmoaglllgpjagf` или `manifest.json` с именем Tampermonkey
  во всех профилях (`Google/Chrome`, `Yandex/YandexBrowser`, `com.operasoftware.Opera[GX]`). Есть ручная галочка на случай, если не нашёл.
- **Safari**: как раньше — файл в контейнер Userscripts, по графику. Добавлено: пишем, только если скачан настоящий userscript
  (`==UserScript==`) и HTTP 200.
- **Самообновление**: `app.version` сравнивается семантически (`AppVersion.isNewer`), не «!=» — иначе 4.0.0 до выкладки
  DMG предлагала бы «обновиться» на 3.0.0. Перед заменой проверяется, что в DMG не пустой `.app`.
- **Скрипты ответов**: базовая библиотека `Resources/ReplyLibrary.json` (id `studio.*`) + слой пользователя
  `~/Library/Application Support/Studio1826/replies.json` (свои `my.*`, правки базовых со снимком версии студии, скрытые базовые).
  Служба «Сохранить как скрипт 1826» (`AppDelegate.saveScript`, `NSServices`) кладёт текст в `ReplySearchState.draftText` → редактор.
  Повреждённый файл не затирается, а откладывается рядом. Обмен — JSON `{format, version, scripts}`; импорт берёт любой JSON с `scripts`.
- **Автозапуск**: `Services/LaunchAtLogin.swift` (`SMAppService.mainApp`), один раз включается при первом запуске не из `/Volumes` и не из AppTranslocation (`launchAtLoginAsked`); переключатель в «Настройке» и в правом клике. На Mac не проверялся — проверить при следующей сборке.
- **Ссылки**: `Core/LinksLayout.swift` (разделы/строки, перестановки, `merge(studio:)` по `knownStudioIDs`) + `LinksStore` (`links.json`).
  Перетаскивание — `.draggable`/`.dropDestination` со строками `group:`/`item:`. Правый клик собирает разделы в `menuNeedsUpdate`.
- **Отчёт по кассе**: `Calculator` на `Decimal`; «2.000» = тысячи (точка + ровно 3 цифры, первая группа не с 0), «1,5»/«1.5» — дробь;
  формат вывода «102.690», дробь через запятую. Копирование заблокировано, пока хоть одно поле пустое или с ошибкой.

## Проверка

- `Tests/CoreTests/main.swift` — тесты `Core/` через `swiftc` (без XCTest).
- `.github/workflows/updater.yml` (macos-15): тесты + `xcodebuild` Release без подписи, только при изменениях в этой папке.
- Ручная проверка на Mac (не делалась из облака): установка Userscripts/Tampermonkey, обнаружение расширений, запись в
  контейнер Userscripts, внешний вид окна, тексты инструкций для Яндекс/Opera (названия пунктов в их настройках не сверены).

## Внешние зависимости

- `studio1826.user.js` в корне `main` — имя файла и raw-URL зашиты в `StudioUserscript.main` и `@downloadURL`.
- `app.version` + `Studio1826Updater.dmg` в корне `main` — читаются приложением; выкладывать вместе.
- Bitrix24: `https://1826studio.bitrix24.ru/` (`StudioLinks.bitrix`).

## Идеи на потом

- Список скриптов студии с сервера (manifest), а не в коде — когда скриптов станет несколько.
- Подстановки в скриптах ответов (`{имя}`, `{дата}`).

## Скрипт «Пропуска списком» (`studio1826-passes.user.js` в корне репо)
Отдельный userscript (не «Основной»), ставится приложением из `StudioUserscript.all`. `@match` Bitrix24 + my.avanguard.pro.
Bitrix: значок 🎫 в ряду значков окна ввода открытых линий (`.bx-imol-textarea-buttons`, MutationObserver), окно над полем ввода → ФИО списком + дата (по умолчанию завтра) → задание в GM-хранилище (`job`) →
`GM.openInTab(<guestsUrl>#s1826-job=<id>)`. Авангард: задание берёт только вкладка с этим id; по каждому имени «Новый посетитель» →
ФИО и обе даты через нативный setter + input/change → «Сохранить» → ждём закрытия окна; результат в `result:<id>`.
На первой ошибке останавливается. Уже оформленные (имя + дата в строке таблицы) пропускаются — best-effort по тексту.
На странице посетителей Авангарда своя панель «Пропуска списком» (с/по). Чистые функции — `tests/passes.test.js`.
Поля формы Авангарда (24.10.2026): даты «с/по» input[type=date], «ФИО *» одной строкой, телефон и номер авто необязательны;
API api.avanguard.pro/api (`/account/<id>/guests`), напрямую не вызываем — только через интерфейс.
API Авангарда (из бандла, 24.10.2026, без проверки запросом): база `https://api.avanguard.pro/api/`; создание — `POST guests`, тело формы
(`accountId, name, phone?, carNumber, carRegion, dateStart, dateFinish`), ошибки приходят 200 с `error/errorDescription`;
список — `GET guests?accountId&dateStart&dateFinish&search&…`. Авторизация не изучена: прямые запросы из Bitrix потребуют токен сессии
Авангарда — решение за Ильёй (безопасность). Пока — фоновая вкладка `GM_openInTab({active:false})` + подмена `requestAnimationFrame` таймером.
