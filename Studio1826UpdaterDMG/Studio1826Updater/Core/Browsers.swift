import Foundation

/// Браузеры, с которыми работает студия, и всё, что про них нужно знать для установки.
enum BrowserKind: String, CaseIterable, Identifiable, Codable {
    case safari, chrome, yandex, opera

    var id: String { rawValue }

    var title: String {
        switch self {
        case .safari: return "Safari"
        case .chrome: return "Google Chrome"
        case .yandex: return "Яндекс Браузер"
        case .opera: return "Opera"
        }
    }

    var shortTitle: String {
        switch self {
        case .safari: return "Safari"
        case .chrome: return "Chrome"
        case .yandex: return "Яндекс"
        case .opera: return "Opera"
        }
    }

    var isChromium: Bool { self != .safari }

    var bundleIdentifiers: [String] {
        switch self {
        case .safari: return ["com.apple.Safari"]
        case .chrome: return ["com.google.Chrome"]
        case .yandex: return ["ru.yandex.desktop.yandex-browser"]
        case .opera: return ["com.operasoftware.Opera", "com.operasoftware.OperaGX"]
        }
    }

    var downloadPage: URL? {
        switch self {
        case .safari: return nil   // встроен в macOS
        case .chrome: return URL(string: "https://www.google.com/chrome/")
        case .yandex: return URL(string: "https://browser.yandex.ru/")
        case .opera: return URL(string: "https://www.opera.com/ru")
        }
    }

    /// Расширение, через которое работают скрипты студии.
    var extensionName: String { self == .safari ? "Userscripts" : "Tampermonkey" }

    /// Страница расширения в магазине. Установить расширение за пользователя macOS не даёт —
    /// приложение открывает эту страницу в нужном браузере, остаётся нажать «Установить».
    var extensionStoreURL: URL {
        switch self {
        case .safari:
            return URL(string: "macappstore://apps.apple.com/app/id1463298887")!
        case .chrome, .yandex:
            return URL(string: "https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo")!
        case .opera:
            return URL(string: "https://addons.opera.com/ru/extensions/details/tampermonkey-beta/")!
        }
    }

    /// Адрес страницы расширений. Такие адреса нельзя открыть извне — только вставить в адресную строку.
    var extensionsPageAddress: String? {
        switch self {
        case .safari: return nil
        case .chrome: return "chrome://extensions"
        case .yandex: return "browser://tune"
        case .opera: return "opera://extensions"
        }
    }

    /// Папки профилей относительно ~/Library/Application Support.
    var profileRoots: [String] {
        switch self {
        case .safari: return []
        case .chrome: return ["Google/Chrome"]
        case .yandex: return ["Yandex/YandexBrowser"]
        case .opera: return ["com.operasoftware.Opera", "com.operasoftware.OperaGX"]
        }
    }
}

/// Ищет Tampermonkey в папках расширений Chromium-браузера (во всех профилях).
enum TampermonkeyDetector {
    /// Tampermonkey и Tampermonkey BETA в Chrome Web Store.
    static let knownIDs: Set<String> = ["dhdgffkkebhmkfjojejmpbldmpobfkfo", "gcalenpjmijncebpfijmoaglllgpjagf"]

    static func isInstalled(_ browser: BrowserKind, applicationSupport: URL, fileManager fm: FileManager = .default) -> Bool {
        for relative in browser.profileRoots {
            let root = applicationSupport.appendingPathComponent(relative, isDirectory: true)
            for dir in extensionDirectories(root: root, fileManager: fm) where containsTampermonkey(dir, fileManager: fm) {
                return true
            }
        }
        return false
    }

    /// `<root>/Extensions` (Opera) и `<root>/<профиль>/Extensions` (Chrome, Яндекс: Default, Profile 1…).
    static func extensionDirectories(root: URL, fileManager fm: FileManager) -> [URL] {
        var result: [URL] = []
        let direct = root.appendingPathComponent("Extensions", isDirectory: true)
        if fm.fileExists(atPath: direct.path) { result.append(direct) }
        let children = (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        for child in children {
            let dir = child.appendingPathComponent("Extensions", isDirectory: true)
            if fm.fileExists(atPath: dir.path) { result.append(dir) }
        }
        return result
    }

    static func containsTampermonkey(_ extensionsDir: URL, fileManager fm: FileManager) -> Bool {
        let ids = (try? fm.contentsOfDirectory(atPath: extensionsDir.path)) ?? []
        for id in ids {
            if knownIDs.contains(id) { return true }
            // Другие ID (например, каталог Opera) — смотрим имя в manifest.json
            let idDir = extensionsDir.appendingPathComponent(id, isDirectory: true)
            let versions = (try? fm.contentsOfDirectory(atPath: idDir.path)) ?? []
            for version in versions {
                let manifest = idDir.appendingPathComponent(version).appendingPathComponent("manifest.json")
                guard let data = try? Data(contentsOf: manifest),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let name = json["name"] as? String else { continue }
                if name.lowercased().contains("tampermonkey") { return true }
            }
        }
        return false
    }
}
