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
    /// Сообщение клиента из буфера обмена (если его только что скопировали)
    @Published var clientText: String?

    /// Подсказки по сообщению клиента — пока ничего не набрано в поиске.
    func suggestions(in store: ReplyStore) -> [ReplyItem] {
        guard query.isEmpty, let clientText else { return [] }
        return ReplySuggest.rank(clientText: clientText, items: store.library.items)
    }

    func results(in store: ReplyStore) -> [ReplyItem] {
        let suggested = suggestions(in: store)
        if !suggested.isEmpty { return suggested }
        return Array(store.library.search(query: query, category: nil).prefix(50))
    }
}

@MainActor
final class QuickReplyPanelController: NSObject, NSWindowDelegate {
    private let store: ReplyStore
    private let model = QuickReplyModel()
    private var panel: QuickReplyPanel?
    private var keyMonitor: Any?

    private let size = NSSize(width: 820, height: 500)

    init(store: ReplyStore) {
        self.store = store
    }

    func toggle() {
        if panel?.isVisible == true { hide() } else { show() }
    }

    func show() {
        model.query = ""
        model.selected = 0
        model.clientText = Self.clientTextFromClipboard(store: store)

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
        // Курсор сразу в поле поиска — можно печатать без клика
        DispatchQueue.main.async { [weak panel] in
            guard let panel, let field = Self.findSearchField(in: panel.contentView) else { return }
            panel.makeFirstResponder(field)
        }
    }

    /// Текст из буфера, если его скопировал человек (не мы) и это не один из скриптов.
    private static func clientTextFromClipboard(store: ReplyStore) -> String? {
        let pb = NSPasteboard.general
        guard pb.changeCount != Clipboard.ownChangeCount,
              let raw = pb.string(forType: .string) else { return nil }
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.count <= 2000,
              !store.library.items.contains(where: { $0.script.text == text }) else { return nil }
        return text
    }

    private static func findSearchField(in view: NSView?) -> NSView? {
        guard let view else { return nil }
        if view is QuickSearchField.FieldView { return view }
        for sub in view.subviews {
            if let found = findSearchField(in: sub) { return found }
        }
        return nil
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
            styleMask: [.nonactivatingPanel, .borderless],
            backing: .buffered,
            defer: false
        )
        // Без заголовка: никакой пустой полосы сверху, скругление и фон рисует SwiftUI
        p.isOpaque = false
        p.backgroundColor = .clear
        p.hasShadow = true
        p.isMovableByWindowBackground = true
        p.level = .floating
        p.hidesOnDeactivate = false
        p.isReleasedWhenClosed = false
        p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
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

    init(model: QuickReplyModel, onChoose: @escaping (ReplyItem) -> Void) {
        self.model = model
        self.onChoose = onChoose
    }

    var body: some View {
        let results = model.results(in: store)
        let suggesting = !model.suggestions(in: store).isEmpty
        let current = results.indices.contains(model.selected) ? results[model.selected] : nil

        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 18))
                    .foregroundColor(.accentColor)
                QuickSearchField(text: $model.query, placeholder: "Быстрый ответ: парковка, пропуск, счёт…")
                    .frame(height: 28)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)

            if suggesting, let client = model.clientText {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "text.bubble").foregroundColor(.accentColor)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Подходит к сообщению клиента").font(.caption.weight(.semibold))
                        Text("«\(client.replacingOccurrences(of: "\n", with: " "))»")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                    Spacer()
                    Button {
                        model.clientText = nil
                        model.selected = 0
                    } label: {
                        Image(systemName: "xmark.circle.fill").foregroundColor(.secondary)
                    }
                    .buttonStyle(.plain)
                    .help("Показать все скрипты")
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color.accentColor.opacity(0.08))
            }

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
                HStack(spacing: 0) {
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
                    .frame(width: 340)

                    Divider()

                    // Полный текст выбранного скрипта
                    ScrollView {
                        if let current {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(current.script.title).font(.headline)
                                Text(current.script.text)
                                    .font(.callout)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .padding(14)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            }

            Divider()

            HStack(spacing: 14) {
                Text("↑↓ выбрать")
                Text(QuickReplySettings.autoPaste && QuickReplySettings.canPaste ? "↩ вставить в чат" : "↩ скопировать")
                Text("esc закрыть")
                Spacer()
                Text("Скопируйте сообщение клиента — подскажу ответ")
            }
            .font(.caption)
            .foregroundColor(.secondary)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
            .strokeBorder(Color(nsColor: .separatorColor).opacity(0.6)))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
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
                    .foregroundColor(.secondary)
            }
            Text(item.script.text.replacingOccurrences(of: "\n", with: " "))
                .font(.callout)
                .lineLimit(2)
                .foregroundColor(.secondary)
        }
        .foregroundColor(.primary)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(isSelected ? Color.accentColor.opacity(0.22) : Color.clear))
        .contentShape(Rectangle())
    }
}

/// Поле поиска на AppKit: в панели без активации приложения SwiftUI-фокус ненадёжен,
/// а NSTextField можно сделать первым респондером напрямую.
struct QuickSearchField: NSViewRepresentable {
    final class FieldView: NSTextField {}

    @Binding var text: String
    let placeholder: String

    func makeNSView(context: Context) -> FieldView {
        let field = FieldView()
        field.isBordered = false
        field.drawsBackground = false
        field.focusRingType = .none
        field.font = .systemFont(ofSize: 20)
        field.placeholderString = placeholder
        field.delegate = context.coordinator
        field.cell?.isScrollable = true
        field.cell?.wraps = false
        return field
    }

    func updateNSView(_ field: FieldView, context: Context) {
        if field.stringValue != text { field.stringValue = text }
    }

    func makeCoordinator() -> Coordinator { Coordinator(text: $text) }

    final class Coordinator: NSObject, NSTextFieldDelegate {
        var text: Binding<String>
        init(text: Binding<String>) { self.text = text }

        func controlTextDidChange(_ note: Notification) {
            guard let field = note.object as? NSTextField else { return }
            text.wrappedValue = field.stringValue
        }
    }
}
