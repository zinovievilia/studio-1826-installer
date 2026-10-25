#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  build.sh — Studio 1826 Updater
#  Собирает .app, упаковывает в .dmg и пишет app.version из APP_VERSION.
#  Запуск (из папки проекта): chmod +x build.sh && ./build.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")"

APP_NAME="Studio1826Updater"
DMG_NAME="Studio1826Updater"
SCHEME="Studio1826Updater"
BUNDLE_ID="studio1826.updater"

BUILD_DIR="$(pwd)/build"
APP_PATH="$BUILD_DIR/$APP_NAME.app"
DMG_PATH="$(pwd)/$DMG_NAME.dmg"
STAGING="$BUILD_DIR/dmg-staging"
LOG_PATH="$(pwd)/build.log"

# Версия берётся из кода — единственный источник правды
VERSION="$(sed -nE 's/^let APP_VERSION = "([^"]+)".*/\1/p' "$APP_NAME/UpdaterService.swift" | head -1)"
if [ -z "$VERSION" ]; then
    echo "❌  Не нашёл APP_VERSION в $APP_NAME/UpdaterService.swift"
    exit 1
fi

echo "════════════════════════════════════════"
echo "  Studio 1826 Updater v$VERSION — сборка"
echo "════════════════════════════════════════"

# ── 0. Проверки ──────────────────────────────────────────────────────────────
if ! command -v xcodebuild &>/dev/null; then
    echo "❌  xcodebuild не найден. Установите Xcode из App Store."
    exit 1
fi

# ── 1. Компиляция ────────────────────────────────────────────────────────────
echo ""
echo "▶  Компилирую (Release)…"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Полный вывод — в build.log. Если сборка упала, скрипт останавливается
# и показывает строки с ошибками (раньше он молча упаковывал пустое приложение).
if ! xcodebuild \
    -project "$APP_NAME.xcodeproj" \
    -scheme "$SCHEME" \
    -configuration Release \
    -derivedDataPath "$BUILD_DIR/DerivedData" \
    CONFIGURATION_BUILD_DIR="$BUILD_DIR" \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO \
    PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
    build > "$LOG_PATH" 2>&1; then
    echo ""
    echo "❌  Сборка провалилась. Ошибки компилятора:"
    grep -E "error:" "$LOG_PATH" | sort -u || true
    echo ""
    echo "    Полный лог: $LOG_PATH"
    exit 1
fi

# .app без исполняемого файла = сломанная сборка, в DMG такое не кладём
if [ ! -x "$APP_PATH/Contents/MacOS/$APP_NAME" ]; then
    echo ""
    echo "❌  В $APP_PATH нет исполняемого файла $APP_NAME. Лог: $LOG_PATH"
    exit 1
fi

# Иконка приложения должна попасть в бандл
if [ ! -f "$APP_PATH/Contents/Resources/AppIcon.icns" ]; then
    echo ""
    echo "⚠  В бандле нет AppIcon.icns — иконка в Finder не появится."
    echo "   Проверьте Assets.xcassets/AppIcon.appiconset. Лог: $LOG_PATH"
fi

echo "✓  Приложение собрано: $APP_PATH"

# Версия в Info.plist = APP_VERSION
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$APP_PATH/Contents/Info.plist" || true

# Ключ для отправки дебага — только в собранное приложение, в git его нет.
# Ключ должен уметь писать только в приватный репозиторий дебага (studio-1826-debug).
DEBUG_TOKEN_FILE="$HOME/.studio1826/debug-token"
if [ -s "$DEBUG_TOKEN_FILE" ]; then
    DEBUG_TOKEN="$(tr -d '[:space:]' < "$DEBUG_TOKEN_FILE")"
    /usr/libexec/PlistBuddy -c "Delete :S1826DebugToken" "$APP_PATH/Contents/Info.plist" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Add :S1826DebugToken string $DEBUG_TOKEN" "$APP_PATH/Contents/Info.plist"
    echo "✓  Отправка дебага включена"
else
    echo "⚠  Нет $DEBUG_TOKEN_FILE — дебаг будет только сохраняться на Mac"
fi

# ── 2. Подписываем ad-hoc ────────────────────────────────────────────────────
echo ""
echo "▶  Подписываю ad-hoc (без Developer ID)…"
xattr -cr "$APP_PATH" 2>/dev/null || true
codesign --force --deep --sign - "$APP_PATH" 2>/dev/null && echo "✓  Подписано" || echo "⚠  Пропущено (не критично)"

# ── 3. Staging для DMG ───────────────────────────────────────────────────────
echo ""
echo "▶  Формирую образ…"

rm -rf "$STAGING"
mkdir -p "$STAGING"
cp -R "$APP_PATH" "$STAGING/"
ln -s /Applications "$STAGING/Applications"   # ярлык для drag-n-drop

# ── 4. Создаём DMG ───────────────────────────────────────────────────────────
rm -f "$DMG_PATH"

hdiutil create \
    -volname "Studio 1826 Updater" \
    -srcfolder "$STAGING" \
    -ov \
    -format UDZO \
    -imagekey zlib-level=9 \
    "$DMG_PATH"

echo "✓  DMG создан: $DMG_PATH"

# app.version — рядом с DMG, чтобы версии не разошлись при выкладке на GitHub
printf '%s\n' "$VERSION" > "$(pwd)/app.version"
echo "✓  app.version = $VERSION"

# ── 5. Очистка ───────────────────────────────────────────────────────────────
rm -rf "$BUILD_DIR"

echo ""
echo "════════════════════════════════════════"
echo "  Готово! Версия $VERSION"
echo ""
echo "  Выложить на GitHub (оба файла вместе):"
echo "  cp Studio1826Updater.dmg app.version <папка репозитория>/"
echo "  cd <папка репозитория> && git add Studio1826Updater.dmg app.version"
echo "  git commit -m \"приложение v$VERSION\" && git push"
echo ""
echo "  Установка с нуля:"
echo "  1. Откройте $DMG_NAME.dmg"
echo "  2. Перетащите Studio1826Updater.app в Applications"
echo "  3. При первом запуске: правый клик → Открыть"
echo "════════════════════════════════════════"
