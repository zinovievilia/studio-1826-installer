# Studio 1826 Updater

Menu bar приложение для macOS. Автоматически обновляет userscript студии 1826
и умеет обновлять само себя через GitHub Releases.

---

## Требования

- macOS 13 Ventura или новее
- Xcode (из App Store, бесплатно)
- [Userscripts для Safari](https://apps.apple.com/app/userscripts/id1463298887) — само расширение

---

## Сборка и установка

### 1. Установить Xcode

Если ещё не установлен:

```bash
open "https://apps.apple.com/app/xcode/id497799835"
```

После установки переключить активный инструмент:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

Проверить:

```bash
xcodebuild -version
# Xcode 15.x ...
```

### 2. Собрать приложение

```bash
cd Studio1826Updater
chmod +x build.sh
./build.sh
```

Скрипт скомпилирует `.app` и упакует в `Studio1826Updater.dmg` в той же папке.

### 3. Установить

1. Открыть `Studio1826Updater.dmg`
2. Перетащить `Studio1826Updater.app` в папку `Applications`
3. При первом запуске macOS покажет предупреждение — это нормально без подписи Developer ID:

```
Правый клик на .app → Открыть → Открыть
```

Предупреждение появится только один раз.

### 4. Добавить в автозапуск

**Системные настройки → Основные → Объекты входа в систему** →
нажать `+` → выбрать `Studio1826Updater.app`.

---

## Что делает приложение

Сидит в строке меню (логотип 1826 Studio). При клике открывается панель с двумя секциями.

### Секция «Userscript»

Следит за файлом:
```
~/Library/Containers/com.userscripts.macos.Userscripts-Extension/
  Data/Documents/scripts/studio1826.user.js
```

Обновляет его с:
```
https://raw.githubusercontent.com/zinovievilia/studio-1826-installer/main/studio1826.user.js
```

**График 2/2** — два дня проверяет, два дня пропускает (отсчёт от 1 января 2024).
В рабочие дни проверка каждые 6 часов. В выходные — тихо пропускает.

Кнопка **«Обновить скрипт сейчас»** — принудительная проверка вне графика.

### Секция «Приложение»

Проверяет наличие новых версий самого приложения через GitHub Releases API:
```
https://api.github.com/repos/zinovievilia/studio-1826-installer/releases/latest
```

Если доступна новая версия — появляется кнопка **«Установить обновление»**:
1. Скачивает `.dmg` из assets релиза
2. Монтирует образ
3. Копирует `.app` в `/Applications/Studio1826Updater.app`
4. Отмонтирует образ
5. Перезапускает себя

Кнопка **🧭** (сафари) открывает страницу релиза на GitHub в браузере.

---

## Как выпускать обновления приложения

Чтобы приложение нашло обновление, нужен GitHub Release с `.dmg` в assets.

### 1. Обновить версию в коде

В файле `Studio1826Updater/UpdaterService.swift` изменить строку:

```swift
let APP_VERSION = "1.0.0"  // → новая версия, например "1.1.0"
```

### 2. Собрать новый DMG

```bash
./build.sh
```

Получится `Studio1826Updater.dmg`.

### 3. Создать релиз на GitHub

```bash
# Создать и запушить тег
git tag v1.1.0
git push origin v1.1.0
```

Затем на GitHub:

1. Перейти в репозиторий → **Releases** → **Draft a new release**
2. Выбрать тег `v1.1.0`
3. Заголовок: `v1.1.0`
4. Прикрепить `Studio1826Updater.dmg` в секцию **Assets**
5. Нажать **Publish release**

Приложение при следующей проверке (или сразу через кнопку) найдёт новую версию
и предложит установить.

### Формат тега

Тег должен быть `vX.Y.Z` или `X.Y.Z` — приложение отрезает ведущую `v` при сравнении.

---

## Структура проекта

```
Studio1826Updater/
├── build.sh                          ← скрипт сборки
├── README.md                         ← этот файл
├── Studio1826Updater.xcodeproj/
│   └── project.pbxproj
└── Studio1826Updater/
    ├── App.swift                     ← точка входа @main
    ├── AppDelegate.swift             ← menu bar, popover
    ├── UpdaterService.swift          ← вся логика: скрипт + self-update
    ├── ContentView.swift             ← SwiftUI панель
    ├── Info.plist
    └── Assets.xcassets/
```

---

## Устранение проблем

**«xcode-select: error: tool requires Xcode»**
```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

**«Не удалось открыть, так как Apple не может проверить»**
```
Правый клик на .app → Открыть → Открыть
```
Или снять карантин:
```bash
xattr -cr /Applications/Studio1826Updater.app
```

**Скрипт не обновляется — папка не существует**

Расширение Userscripts нужно открыть хотя бы раз в Safari, чтобы она создала
свою папку Documents. После этого обновление заработает.

**Приложение не видит обновление**

Проверить что в репозитории есть релиз с тегом и файл `.dmg` прикреплён к нему
как asset (не просто файл в репозитории, а именно в секции Assets релиза).
