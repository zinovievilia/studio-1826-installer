import Cocoa
import SwiftUI

/// Значок в строке меню (быстрое меню) + главное окно приложения.
/// Пока окно открыто, приложение видно в Dock и в ⌘Tab; когда закрыто — живёт только в строке меню.
@MainActor
class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, NSMenuDelegate {
    var statusItem: NSStatusItem?
    var window: NSWindow?

    var browsers: BrowserService!
    var updater: UpdaterService!
    var replies: ReplyStore!
    var cashReport: CashReportModel!
    var navigation: Navigation!
    var toaster: Toaster!

    private var statusLine: NSMenuItem?
    private var updateItem: NSMenuItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory) // только menu bar, пока окно закрыто

        browsers = BrowserService()
        updater = UpdaterService(browsers: browsers)
        replies = ReplyStore()
        cashReport = CashReportModel()
        navigation = Navigation(defaultSection: browsers.selected == nil ? .setup : .replies)
        toaster = Toaster()

        // Логотип шире, чем высота строки меню, поэтому длина — переменная
        let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.image = menuBarImage()
            button.imagePosition = .imageOnly
            button.toolTip = "Studio 1826"
        }
        statusItem.menu = buildStatusMenu()
        self.statusItem = statusItem

        ensureEditMenu()
        updater.start()

        // Первый запуск: браузер ещё не выбран — сразу показываем окно с настройкой
        if browsers.selected == nil {
            showMainWindow(section: .setup)
        }
    }

    /// Клик по значку в Dock (пока окно открыто) или повторный запуск из Finder.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showMainWindow()
        return true
    }

    // MARK: - Главное окно

    @objc func openMainWindow() { showMainWindow() }

    func showMainWindow(section: AppSection? = nil) {
        if let section { navigation.section = section }

        if window == nil {
            let root = MainView()
                .environmentObject(browsers)
                .environmentObject(updater)
                .environmentObject(replies)
                .environmentObject(cashReport)
                .environmentObject(navigation)
                .environmentObject(toaster)
            let hosting = NSHostingController(rootView: root)
            hosting.sizingOptions = []

            let w = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 980, height: 660),
                styleMask: [.titled, .closable, .miniaturizable, .resizable],
                backing: .buffered,
                defer: false
            )
            w.title = "Studio 1826"
            w.contentViewController = hosting
            w.setContentSize(NSSize(width: 980, height: 660))
            w.contentMinSize = NSSize(width: 820, height: 560)
            w.isReleasedWhenClosed = false
            w.delegate = self
            w.center()
            w.setFrameAutosaveName("Studio1826MainWindow")
            window = w
        }

        NSApp.setActivationPolicy(.regular)
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func windowWillClose(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
    }

    // MARK: - Меню в строке меню

    private func buildStatusMenu() -> NSMenu {
        let menu = NSMenu()
        menu.delegate = self
        menu.autoenablesItems = false

        menu.addItem(item("Открыть Studio 1826", #selector(openMainWindow), key: "o"))
        menu.addItem(.separator())
        menu.addItem(item("Скрипты ответов…", #selector(openReplies), symbol: AppSection.replies.systemImage))
        menu.addItem(item("Отчёт по кассе…", #selector(openCashReport), symbol: AppSection.cashReport.systemImage))
        menu.addItem(.separator())

        for branch in StudioBranch.allCases {
            let parent = NSMenuItem(title: branch.title, action: nil, keyEquivalent: "")
            parent.image = NSImage(systemSymbolName: "building.2", accessibilityDescription: nil)
            let sub = NSMenu()
            for link in branch.links {
                let li = item(link.title, #selector(openLink(_:)), symbol: link.systemImage)
                li.representedObject = link.url
                sub.addItem(li)
            }
            parent.submenu = sub
            menu.addItem(parent)
        }
        let salary = item("Таблица зарплаты", #selector(openLink(_:)), symbol: "tablecells")
        salary.representedObject = StudioLinks.salarySheet
        menu.addItem(salary)

        menu.addItem(.separator())
        let status = NSMenuItem(title: "", action: nil, keyEquivalent: "")
        status.isEnabled = false
        menu.addItem(status)
        statusLine = status

        let update = item("Проверить обновления", #selector(checkUpdates))
        menu.addItem(update)
        updateItem = update

        menu.addItem(.separator())
        menu.addItem(item("Выйти", #selector(quit), key: "q"))
        return menu
    }

    private func item(_ title: String, _ action: Selector, key: String = "", symbol: String? = nil) -> NSMenuItem {
        let mi = NSMenuItem(title: title, action: action, keyEquivalent: key)
        mi.target = self
        if let symbol { mi.image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil) }
        return mi
    }

    /// Обновляем строку состояния каждый раз, когда меню открывается.
    func menuNeedsUpdate(_ menu: NSMenu) {
        guard menu === statusItem?.menu else { return }
        let main = updater.state(of: .main)
        var line = "Основной: " + (main.remoteVersion ?? main.localVersion ?? "версия неизвестна")
        if let latest = updater.appLatestVersion {
            line += " · есть приложение \(latest)"
            updateItem?.title = "Установить обновление \(latest)"
        } else {
            updateItem?.title = "Проверить обновления"
        }
        statusLine?.title = line
    }

    @objc private func openReplies() { showMainWindow(section: .replies) }
    @objc private func openCashReport() { showMainWindow(section: .cashReport) }

    @objc private func openLink(_ sender: NSMenuItem) {
        guard let url = sender.representedObject as? URL else { return }
        NSWorkspace.shared.open(url)
    }

    @objc private func checkUpdates() {
        if updater.appLatestVersion != nil {
            updater.installApp()
        } else {
            updater.checkForUpdates()
        }
        showMainWindow()
    }

    @objc private func quit() { NSApp.terminate(nil) }

    // MARK: - Помощники

    /// Логотип 1826 Studio (набор MenuIcon в Assets.xcassets).
    /// Template-изображение: macOS само красит его в чёрный/белый под тему строки меню.
    /// Если набор по какой-то причине не найден — запасная системная иконка, чтобы кнопка не была пустой.
    private func menuBarImage() -> NSImage? {
        if let logo = NSImage(named: "MenuIcon") {
            logo.isTemplate = true
            // Высота 18 pt, ширина по пропорциям картинки
            let ratio = logo.size.height > 0 ? logo.size.width / logo.size.height : 1
            logo.size = NSSize(width: 18 * ratio, height: 18)
            return logo
        }
        let fallback = NSImage(systemSymbolName: "arrow.triangle.2.circlepath",
                               accessibilityDescription: "Studio 1826")
        fallback?.isTemplate = true
        return fallback
    }

    /// Без меню «Правка» в полях ввода не работают ⌘C / ⌘V / ⌘X / ⌘A.
    /// SwiftUI обычно добавляет его сам; если нет — создаём.
    private func ensureEditMenu() {
        func hasPaste(_ menu: NSMenu?) -> Bool {
            guard let menu else { return false }
            return menu.items.contains { $0.action == #selector(NSText.paste(_:)) || hasPaste($0.submenu) }
        }
        if hasPaste(NSApp.mainMenu) { return }

        let main = NSApp.mainMenu ?? NSMenu()
        if main.items.isEmpty {
            let appItem = NSMenuItem()
            let appMenu = NSMenu()
            appMenu.addItem(NSMenuItem(title: "Закрыть окно", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w"))
            appMenu.addItem(NSMenuItem(title: "Выйти из Studio 1826", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
            appItem.submenu = appMenu
            main.addItem(appItem)
        }

        let editItem = NSMenuItem()
        let edit = NSMenu(title: "Правка")
        edit.addItem(NSMenuItem(title: "Отменить", action: Selector(("undo:")), keyEquivalent: "z"))
        let redo = NSMenuItem(title: "Повторить", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(redo)
        edit.addItem(.separator())
        edit.addItem(NSMenuItem(title: "Вырезать", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        edit.addItem(NSMenuItem(title: "Копировать", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        edit.addItem(NSMenuItem(title: "Вставить", action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        edit.addItem(NSMenuItem(title: "Выбрать все", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
        editItem.submenu = edit
        main.addItem(editItem)
        NSApp.mainMenu = main
    }
}
