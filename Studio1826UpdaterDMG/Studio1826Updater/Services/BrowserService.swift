import AppKit
import Combine

/// Выбранный браузер, что установлено на этом Mac, и отметки шагов, которые проверить нельзя.
@MainActor
final class BrowserService: ObservableObject {
    static let userscriptsBundleID = "com.userscripts.macos"

    /// Папка, из которой расширение Userscripts берёт скрипты.
    static var userscriptsFolder: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Containers/com.userscripts.macos.Userscripts-Extension/Data/Documents/scripts",
                                    isDirectory: true)
    }

    @Published var selected: BrowserKind? {
        didSet {
            UserDefaults.standard.set(selected?.rawValue, forKey: "selectedBrowser")
            refresh()
        }
    }

    @Published private(set) var appURLs: [BrowserKind: URL] = [:]
    @Published private(set) var tampermonkeyFound: Set<BrowserKind> = []
    @Published private(set) var userscriptsAppURL: URL?
    @Published private(set) var userscriptsFolderExists = false
    /// Отметки «сделано» для шагов, которые приложение проверить не может (включить расширение и т.п.)
    @Published private(set) var confirmations: Set<String>

    init() {
        selected = UserDefaults.standard.string(forKey: "selectedBrowser").flatMap(BrowserKind.init(rawValue:))
        confirmations = Set(UserDefaults.standard.stringArray(forKey: "setupConfirmations") ?? [])
        refresh()
    }

    func refresh() {
        var apps: [BrowserKind: URL] = [:]
        for browser in BrowserKind.allCases {
            for id in browser.bundleIdentifiers {
                if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: id) {
                    apps[browser] = url
                    break
                }
            }
        }
        appURLs = apps

        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        var found: Set<BrowserKind> = []
        for browser in BrowserKind.allCases where browser.isChromium {
            if TampermonkeyDetector.isInstalled(browser, applicationSupport: support) { found.insert(browser) }
        }
        tampermonkeyFound = found

        userscriptsAppURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: Self.userscriptsBundleID)
        userscriptsFolderExists = FileManager.default.fileExists(atPath: Self.userscriptsFolder.path)
    }

    // MARK: Состояние

    func isInstalled(_ browser: BrowserKind) -> Bool { appURLs[browser] != nil }

    /// Расширение для скриптов есть (или сотрудник отметил вручную, что оно стоит).
    func hasExtension(_ browser: BrowserKind) -> Bool {
        if browser == .safari { return userscriptsAppURL != nil }
        return tampermonkeyFound.contains(browser) || isConfirmed("\(browser.rawValue).extension")
    }

    func icon(for browser: BrowserKind) -> NSImage? {
        guard let url = appURLs[browser] else { return nil }
        return NSWorkspace.shared.icon(forFile: url.path)
    }

    func isConfirmed(_ key: String) -> Bool { confirmations.contains(key) }

    func setConfirmed(_ key: String, _ value: Bool) {
        if value { confirmations.insert(key) } else { confirmations.remove(key) }
        UserDefaults.standard.set(Array(confirmations).sorted(), forKey: "setupConfirmations")
    }

    // MARK: Действия

    /// Открыть адрес в выбранном браузере (если он не найден — в браузере по умолчанию).
    func open(_ url: URL, in browser: BrowserKind? = nil) {
        guard let target = browser ?? selected, let app = appURLs[target] else {
            NSWorkspace.shared.open(url)
            return
        }
        let config = NSWorkspace.OpenConfiguration()
        config.activates = true
        NSWorkspace.shared.open([url], withApplicationAt: app, configuration: config) { _, error in
            if error != nil {
                DispatchQueue.main.async { NSWorkspace.shared.open(url) }
            }
        }
    }

    func openExtensionStore(for browser: BrowserKind) {
        if browser == .safari {
            NSWorkspace.shared.open(browser.extensionStoreURL)   // откроется App Store
        } else {
            open(browser.extensionStoreURL, in: browser)
        }
    }

    func launchUserscriptsApp() {
        guard let url = userscriptsAppURL else { return }
        NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration()) { _, _ in }
    }

    func launch(_ browser: BrowserKind) {
        guard let url = appURLs[browser] else { return }
        NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration()) { _, _ in }
    }
}
