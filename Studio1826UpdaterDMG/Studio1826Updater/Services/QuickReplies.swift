import AppKit
import SwiftUI
import ApplicationServices

// Быстрые ответы: ⌃⌥Пробел в любом приложении (например, в открытых линиях Bitrix24) →
// поиск по скриптам ответов → Enter вставляет ответ туда, где стоит курсор.

enum QuickReplySettings {
    static let hotKeyTitle = "⌃⌥Пробел"

    /// Вставлять ответ сразу (нужно разрешение «Универсальный доступ»), иначе только копировать.
    static var autoPaste: Bool {
        get { UserDefaults.standard.object(forKey: "quickRepliesAutoPaste") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "quickRepliesAutoPaste") }
    }

    static var canPaste: Bool { AXIsProcessTrusted() }

    /// Показывает системный запрос и открывает нужный раздел настроек.
    static func requestPastePermission() {
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        _ = AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
    }

    /// ⌘V в активное приложение.
    static func pasteToFrontApp() {
        let source = CGEventSource(stateID: .combinedSessionState)
        let vKey: CGKeyCode = 9   // kVK_ANSI_V — работает и в русской раскладке
        let down = CGEvent(keyboardEventSource: source, virtualKey: vKey, keyDown: true)
        down?.flags = .maskCommand
        let up = CGEvent(keyboardEventSource: source, virtualKey: vKey, keyDown: false)
        up?.flags = .maskCommand
        down?.post(tap: .cghidEventTap)
        up?.post(tap: .cghidEventTap)
    }
}

/// Панель, которая принимает ввод, не активируя приложение: браузер остаётся активным,
/// и после выбора ответа курсор возвращается в поле чата.
final class QuickReplyPanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

@MainActor
final class QuickReplyModel: ObservableObject {
    @Published var query = ""
    @Published var selected = 0

    func results(in store: ReplyStore) -> [ReplyItem] {
        Array(store.library.search(query: query, category: nil).prefix(50))
    }
}

@MainActor
final class QuickReplyPanelController: NSObject, NSWindowDelegate {
    private let store: ReplyStore
    private let model = QuickReplyModel()
    private var panel: QuickReplyPanel?
    private var keyMonitor: Any?

    private let size = NSSize(width: 620, height: 460)

    init(store: ReplyStore) {
        self.store = store
    }

    func toggle() {
        if panel?.isVisible == true { hide() } else { show() }
    }

    func show() {
        model.query = ""
        model.selected = 0

        let panel = self.panel ?? makePanel()
        self.panel = panel
        // Новый hosting view при каждом показе — чтобы поле поиска сразу получало фокус
        panel.contentView = NSHostingView(
            rootView: QuickReplyView(model: model, onChoose: { [weak self] item in self?.choose(item) })
                .environmentObject(store)
        )

        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { NSMouseInRect(mouse, $0.frame, false) } ?? NSScreen.main
        if let visible = screen?.visibleFrame {
            let origin = NSPoint(x: visible.midX - size.width / 2,
                                 y: visible.maxY - visible.height * 0.18 - size.height)
            panel.setFrame(NSRect(origin: origin, size: size), display: true)
        }
        panel.makeKeyAndOrderFront(nil)
        installKeyMonitor()
    }

    func hide() {
        removeKeyMonitor()
        panel?.orderOut(nil)
    }

    func windowDidResignKey(_ notification: Notification) {
        hide()
    }

    private func makePanel() -> QuickReplyPanel {
        let p = QuickReplyPanel(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.nonactivatingPanel, .titled, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        p.titleVisibility = .hidden
        p.titlebarAppearsTransparent = true
        p.isMovableByWindowBackground = true
        p.level = .floating
        p.hidesOnDeactivate = false
        p.isReleasedWhenClosed = false
        p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        p.standardWindowButton(.closeButton)?.isHidden = true
        p.standardWindowButton(.miniaturizeButton)?.isHidden = true
        p.standardWindowButton(.zoomButton)?.isHidden = true
        p.delegate = self
        return p
    }

    private func choose(_ item: ReplyItem) {
        Clipboard.copy(item.script.text)
        hide()
        if QuickReplySettings.autoPaste && QuickReplySettings.canPaste {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                QuickReplySettings.pasteToFrontApp()
            }
        }
    }

    // ↑ ↓ Enter Esc — пока панель открыта
    private func installKeyMonitor() {
        removeKeyMonitor()
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, let panel = self.panel, event.window === panel else { return event }
            let results = self.model.results(in: self.store)
            switch event.keyCode {
            case 125: // ↓
                if !results.isEmpty { self.model.selected = min(self.model.selected + 1, results.count - 1) }
                return nil
            case 126: // ↑
                self.model.selected = max(self.model.selected - 1, 0)
                return nil
            case 36, 76: // Enter
                if results.indices.contains(self.model.selected) { self.choose(results[self.model.selected]) }
                return nil
            case 53: // Esc
                self.hide()
                return nil
            default:
                return event
            }
        }
    }

    private func removeKeyMonitor() {
        if let keyMonitor { NSEvent.removeMonitor(keyMonitor) }
        keyMonitor = nil
    }
}

struct QuickReplyView: View {
    @ObservedObject var model: QuickReplyModel
    @EnvironmentObject var store: ReplyStore
    let onChoose: (ReplyItem) -> Void
    @FocusState private var searchFocused: Bool

    init(model: QuickReplyModel, onChoose: @escaping (ReplyItem) -> Void) {
        self.model = model
        self.onChoose = onChoose
    }

    var body: some View {
        let results = model.results(in: store)
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 18))
                    .foregroundColor(.accentColor)
                TextField("Быстрый ответ: парковка, пропуск, счёт…", text: $model.query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 20))
                    .focused($searchFocused)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)

            Divider()

            if results.isEmpty {
                VStack(spacing: 6) {
                    Spacer()
                    Text("Ничего не нашлось").foregroundColor(.secondary)
                    Text("Попробуйте другое слово").font(.caption).foregroundColor(.secondary)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 2) {
                            ForEach(Array(results.enumerated()), id: \.element.id) { pair in
                                QuickReplyRow(item: pair.element, isSelected: pair.offset == model.selected)
                                    .id(pair.offset)
                                    .onTapGesture { onChoose(pair.element) }
                                    .onHover { inside in if inside { model.selected = pair.offset } }
                            }
                        }
                        .padding(6)
                    }
                    .onChange(of: model.selected) { index in
                        proxy.scrollTo(index)
                    }
                }
            }

            Divider()

            HStack(spacing: 14) {
                Text("↑↓ выбрать")
                Text(QuickReplySettings.autoPaste && QuickReplySettings.canPaste ? "↩ вставить в чат" : "↩ скопировать")
                Text("esc закрыть")
                Spacer()
                Text(QuickReplySettings.hotKeyTitle)
            }
            .font(.caption)
            .foregroundColor(.secondary)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.regularMaterial)
        .onAppear { searchFocused = true }
        .onChange(of: model.query) { _ in model.selected = 0 }
    }
}

private struct QuickReplyRow: View {
    let item: ReplyItem
    let isSelected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(item.script.title).font(.body.weight(.semibold))
                Spacer()
                Text(ReplyLibrary.categoryName(item.script.category))
                    .font(.caption)
                    .foregroundColor(isSelected ? .white.opacity(0.85) : .secondary)
            }
            Text(item.script.text.replacingOccurrences(of: "\n", with: " "))
                .font(.callout)
                .lineLimit(3)
                .foregroundColor(isSelected ? .white.opacity(0.9) : .secondary)
        }
        .foregroundColor(isSelected ? .white : .primary)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(isSelected ? Color.accentColor : Color.clear))
        .contentShape(Rectangle())
    }
}
