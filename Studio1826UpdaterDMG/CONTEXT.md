# CONTEXT — Studio1826Updater (исходники DMG)

Рабочая память по Updater. Составлено 24.10.2026 только по `README.md` этой папки:
код (`*.swift`, `build.sh`, проект Xcode) не читался и не проверялся. Сейчас над Updater не работаем —
папка нужна на будущее, когда скриптов станет несколько (решение Ильи, 24.10.2026). Ничего здесь не менять без отдельной задачи.

## Что это

Menu bar приложение для macOS 13+ (SwiftUI). Два дела:
1. **Обновляет userscript для Safari** (расширение Userscripts), не для Chrome/Tampermonkey.
2. **Обновляет само себя** через GitHub Releases.

## Userscript (по README)

- Файл на диске: `~/Library/Containers/com.userscripts.macos.Userscripts-Extension/Data/Documents/scripts/studio1826.user.js`.
- Источник: `https://raw.githubusercontent.com/zinovievilia/studio-1826-installer/main/studio1826.user.js` — тот же адрес,
  что `@downloadURL` у Tampermonkey. Имя файла и путь в репозитории менять нельзя без правки Updater.
- График «2/2»: два дня проверяет, два пропускает (отсчёт от 01.01.2024); в рабочие дни — каждые 6 часов.
  Кнопка «Обновить скрипт сейчас» — вне графика.
- Если папки расширения нет — его нужно один раз открыть в Safari.

## Самообновление (по README)

- `https://api.github.com/repos/zinovievilia/studio-1826-installer/releases/latest`; тег `vX.Y.Z` или `X.Y.Z`.
- Нужен GitHub Release с `.dmg` в Assets (не просто файл в репозитории). Установка: скачать DMG → смонтировать →
  скопировать `.app` в `/Applications/Studio1826Updater.app` → отмонтировать → перезапуск.
- Выпуск: поднять `APP_VERSION` в `Studio1826Updater/UpdaterService.swift` → `./build.sh` → тег → Release с DMG.
- Сборка: Xcode, `./build.sh` собирает `.app` и `Studio1826Updater.dmg`. Без подписи Developer ID — первый запуск через «Открыть».

## Состав папки

`README.md`, `Studio1826Updater/` (App.swift, AppDelegate.swift, UpdaterService.swift, ContentView.swift, Info.plist, Assets),
`Studio1826Updater.xcodeproj/`, `Studio1826Updater.dmg`, `app.version`, `build.sh`, `build.log`.

## На будущее (несколько скриптов) — что проверить, когда начнём

- По README путь и URL скрипта заданы под один файл `studio1826.user.js` — вероятно, зашиты в `UpdaterService.swift` (проверить в коде).
- Как Updater относится к `studio1826.meta.js` и `app.version` в корне репозитория (README их не упоминает).
- График 2/2 и интервал 6 ч — точное поведение по коду.

## Связь с userscript

Userscript ведётся в корне репозитория (`studio1826.user.js`, контекст — `docs/userscript/CONTEXT.md`).
Его выкладка на `main` автоматически попадает и в Safari через Updater (по графику), и в Chrome через Tampermonkey.
