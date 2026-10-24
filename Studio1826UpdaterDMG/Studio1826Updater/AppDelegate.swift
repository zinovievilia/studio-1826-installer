import Cocoa
import SwiftUI

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem?
    var popover: NSPopover?
    var updater: UpdaterService?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory) // только menu bar, без Dock

        updater = UpdaterService()

        let popover = NSPopover()
        popover.contentSize = NSSize(width: 320, height: 260)
        popover.behavior = .transient
        popover.contentViewController = NSHostingController(
            rootView: ContentView(updater: updater!)
        )
        self.popover = popover

        // Логотип шире, чем высота строки меню, поэтому длина — переменная
        let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.image = menuBarImage()
            button.imagePosition = .imageOnly
            button.toolTip = "Studio 1826 Updater"
            button.action = #selector(togglePopover)
            button.target = self
        }
        self.statusItem = statusItem

        updater?.start()
    }

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
                               accessibilityDescription: "Studio 1826 Updater")
        fallback?.isTemplate = true
        return fallback
    }

    @objc func togglePopover() {
        guard let button = statusItem?.button else { return }
        if let popover = popover {
            if popover.isShown {
                popover.performClose(nil)
            } else {
                popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
                NSApp.activate(ignoringOtherApps: true)
            }
        }
    }
}
