import Cocoa
import SwiftUI

/// Значок в строке меню. Левый клик — окно приложения под значком (поповер с вкладками),
/// правый клик — короткое меню. ⌃⌥Пробел из любого приложения — быстрые ответы.
@MainActor
class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    var statusItem: NSStatusItem?
    var popover: NSPopover?

    var browsers: BrowserService!
    var updater: UpdaterService!
    var replies: ReplyStore!
    var cashReport: CashReportModel!
    var navigation: Navigation!
    var toaster: Toaster!
    var replySearch: ReplySearchState!
    private var popoverKeyMonitor: Any?

    private var quickReplies: QuickReplyPanelController?
    private var hotKey: HotKey?
    private var statusMenu: NSMenu?
    private var statusLine: NSMenuItem?
    private var updateItem: NSMenuItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory) // только menu bar, без Dock

        browsers = BrowserService()
        updater = UpdaterService(browsers: browsers)
        replies = ReplyStore()
        cashReport = CashReportModel()
        navigation = Navigation(defaultSection: browsers.selected == nil ? .setup : .replies)
        toaster = Toaster()
        replySearch = ReplySearchState()

        let popover = NSPopover()
        popover.contentSize = NSSize(width: PopoverLayout.width, height: PopoverLayout.height)
        popover.behavior = .transient
        popover.animates = true
        popover.contentViewController = NSHostingController(
            rootView: PopoverView()
                .environmentObject(browsers)
                .environmentObject(updater)
                .environmentObject(replies)
                .environmentObject(cashReport)
                .environmentObject(navigation)
                .environmentObject(toaster)
                .environmentObject(replySearch)
        )
        self.popover = popover
        installPopoverTypingMonitor()

        // Служба «Сохранить как скрипт 1826» в меню правой кнопки для выделенного текста
        NSApp.servicesProvider = self
        NSUpdateDynamicServices()

        // Пока открыто окно сохранения/открытия файла, поповер не должен закрываться
        PopoverPin.shared.setPinned = { [weak popover] pinned in
            popover?.behavior = pinned ? .applicationDefined : .transient
        }
        PopoverPin.shared.close = { [weak popover] in
            popover?.performClose(nil)
        }
        PasteBack.closePopover = { [weak popover] in
            popover?.performClose(nil)
        }

        // Логотип шире, чем высота строки меню, поэтому длина — переменная
        let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.image = menuBarImage()
            button.imagePosition = .imageOnly
            button.toolTip = "Studio 1826 — правый клик: меню"
            button.action = #selector(statusItemClicked(_:))
            button.target = self
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
        self.statusItem = statusItem
        statusMenu = buildStatusMenu()

        ensureEditMenu()
        updater.start()

        quickReplies = QuickReplyPanelController(store: replies)
        hotKey = HotKey(keyCode: HotKey.spaceKeyCode, modifiers: HotKey.controlOption) { [weak self] in
            self?.quickReplies?.toggle()
        }

        // Первый запуск: браузер ещё не выбран — сразу показываем окно с настройкой
        if browsers.selected == nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                self?.showPopover(section: .setup)
            }
        }
    }

    /// Повторный запуск из Finder / Launchpad — показываем окно под значком.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showPopover()
        return true
    }

    // MARK: - Поповер

    @objc private func statusItemClicked(_ sender: NSStatusBarButton) {
        if NSApp.currentEvent?.type == .rightMouseUp {
            popover?.performClose(nil)
            if let menu = statusMenu, let item = statusItem {
                // Временное меню: показали и сразу убрали, чтобы левый клик снова открывал поповер
                item.menu = menu
                item.button?.performClick(nil)
                item.menu = nil
            }
            return
        }
        if popover?.isShown == true {
            popover?.performClose(nil)
        } else {
            showPopover()
        }
    }

    func showPopover(section: AppSection? = nil) {
        if let section { navigation.section = section }
        guard let popover, let button = statusItem?.button else { return }
        if !popover.isShown {
            PasteBack.rememberFrontApp()
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        }
        NSApp.activate(ignoringOtherApps: true)
        popover.contentViewController?.view.window?.makeKey()
        if navigation.section == .replies { replySearch.focus() }
    }

    /// Служба macOS: выделенный текст из любой программы → редактор нового скрипта.
    /// Имя метода совпадает с NSMessage в Info.plist.
    @objc func saveScript(_ pboard: NSPasteboard, userData: String?, error: AutoreleasingUnsafeMutablePointer<NSString?>) {
        let text = (pboard.string(forType: .string) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            error.pointee = "Не выделен текст" as NSString
            return
        }
        replySearch.draftText = text
        showPopover(section: .replies)
    }

    /// Окно открыто и курсор не в поле ввода — начали печатать: переходим в «Скрипты» и ищем набранное.
    private func installPopoverTypingMonitor() {
        popoverKeyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self,
                  let window = self.popover?.contentViewController?.view.window,
                  event.window === window,
                  !(window.firstResponder is NSTextView),          // уже печатают в каком-то поле
                  event.modifierFlags.intersection([.command, .control, .option]).isEmpty,
                  let chars = event.characters, !chars.isEmpty,
                  chars.unicodeScalars.allSatisfy({ CharacterSet.alphanumerics.contains($0) }) else {
                return event
            }
            self.navigation.section = .replies
            self.replySearch.query = chars
            self.replySearch.focus()
            return nil
        }
    }

    // MARK: - Меню по правому клику

    private func buildStatusMenu() -> NSMenu {
        let menu = NSMenu()
        menu.delegate = self
        menu.autoenablesItems = false

        menu.addItem(item("Скрипты ответов", #selector(openReplies), symbol: AppSection.replies.systemImage))
        menu.addItem(item("Быстрые ответы  ⌃⌥Пробел", #selector(openQuickReplies), symbol: "bolt"))
        menu.addItem(item("Отчёт по кассе", #selector(openCashReport), symbol: AppSection.cashReport.systemImage))
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
        let phones = NSMenuItem(title: "Скопировать телефон", action: nil, keyEquivalent: "")
        phones.image = NSImage(systemSymbolName: "phone", accessibilityDescription: nil)
        let phoneMenu = NSMenu()
        for phone in StudioPhone.all {
            let pi = item("\(phone.title)  \(phone.formatted)", #selector(copyPhone(_:)))
            pi.representedObject = phone.number
            phoneMenu.addItem(pi)
        }
        phones.submenu = phoneMenu
        menu.addItem(phones)

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
        guard menu === statusMenu else { return }
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

    @objc private func openReplies() { showPopover(section: .replies) }
    @objc private func openCashReport() { showPopover(section: .cashReport) }
    @objc private func openQuickReplies() { quickReplies?.show() }

    @objc private func openLink(_ sender: NSMenuItem) {
        guard let url = sender.representedObject as? URL else { return }
        NSWorkspace.shared.open(url)
    }

    @objc private func copyPhone(_ sender: NSMenuItem) {
        guard let number = sender.representedObject as? String else { return }
        Clipboard.copy(number)
    }

    @objc private func checkUpdates() {
        if updater.appLatestVersion != nil {
            updater.installApp()
        } else {
            updater.checkForUpdates()
        }
        showPopover()
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

/// Размер окна под значком.
enum PopoverLayout {
    static let width: CGFloat = 460
    static let height: CGFloat = 660
}

/// Даёт экранам приложения закрепить поповер (на время диалога сохранения файла) или закрыть его.
@MainActor
final class PopoverPin {
    static let shared = PopoverPin()
    var setPinned: (Bool) -> Void = { _ in }
    var close: () -> Void = {}

    /// Выполнить действие с модальным окном (NSSavePanel и т.п.), не теряя поповер.
    func whilePinned<T>(_ body: () -> T) -> T {
        setPinned(true)
        defer { setPinned(false) }
        return body()
    }
}
