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

    /// Системный запрос macOS появляется только один раз на сборку и может спрятаться за панелью,
    /// поэтому сразу открываем Системные настройки → Универсальный доступ, а панель убираем с дороги.
    static func requestPastePermission() {
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        _ = AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
        NSApp.windows.filter { $0 is QuickReplyPanel }.forEach { $0.orderOut(nil) }
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
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

/// Вставка из окна под значком: запоминаем программу, где печатали, до открытия окна,
/// а по клику на скрипт закрываем окно, возвращаемся туда и вставляем.
@MainActor
enum PasteBack {
    /// Программа, которая была активной до открытия окна под значком
    static var previousApp: NSRunningApplication?
    static var closePopover: (() -> Void)?

    static var isAvailable: Bool {
        QuickReplySettings.autoPaste && QuickReplySettings.canPaste && previousApp != nil
    }

    static func rememberFrontApp() {
        let front = NSWorkspace.shared.frontmostApplication
        if front?.processIdentifier != ProcessInfo.processInfo.processIdentifier { previousApp = front }
    }

    /// Текст уже в буфере обмена. true — вставили, false — только скопировано.
    @discardableResult
    static func pasteCopiedText() -> Bool {
        guard isAvailable, let app = previousApp, !app.isTerminated else { return false }
        closePopover?()
        app.activate(options: [])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            QuickReplySettings.pasteToFrontApp()
        }
        return true
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
    /// Выделенный мышкой кусок текста справа — тогда берём только его
    @Published var fragment = ""

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
        model.fragment = ""
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
        choose(text: model.fragment.isEmpty ? item.script.text : model.fragment)
    }

    private func choose(text: String) {
        Clipboard.copy(text)
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
            let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            // ⌘C при выделенном куске справа — копируем только его
            if event.keyCode == 8, flags == .command, !self.model.fragment.isEmpty,
               panel.firstResponder is PreviewTextView {
                self.choose(text: self.model.fragment)
                return nil
            }
            // Начали печатать, стоя в тексте справа, — возвращаемся в поиск
            if panel.firstResponder is PreviewTextView, flags.isDisjoint(with: [.command, .control]),
               let chars = event.characters, chars.unicodeScalars.contains(where: { CharacterSet.alphanumerics.contains($0) }),
               let field = Self.findSearchField(in: panel.contentView) {
                panel.makeFirstResponder(field)
                return event
            }
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
                StudioLogo(height: 20)
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
                            // Обычный VStack и один id на строку: в LazyVStack с двумя id
                            // подсветка залипала на старой строке.
                            VStack(spacing: 2) {
                                ForEach(Array(results.enumerated()), id: \.element.id) { pair in
                                    QuickReplyRow(item: pair.element, isSelected: pair.offset == model.selected)
                                        .onTapGesture { onChoose(pair.element) }
                                        .onHover { inside in if inside { model.selected = pair.offset } }
                                }
                            }
                            .padding(6)
                        }
                        .onChange(of: model.selected) { index in
                            if results.indices.contains(index) { proxy.scrollTo(results[index].id) }
                        }
                    }
                    .frame(width: 340)

                    Divider()

                    // Полный текст выбранного скрипта; кусок можно выделить мышкой
                    VStack(alignment: .leading, spacing: 6) {
                        if let current {
                            Text(current.script.title).font(.headline)
                                .padding(.horizontal, 14)
                                .padding(.top, 14)
                            PreviewText(text: current.script.text, selection: $model.fragment)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
            }

            if QuickReplySettings.autoPaste && !QuickReplySettings.canPaste {
                Divider()
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundColor(.orange)
                    Text("Сейчас скрипт только копируется. Чтобы он сразу вставлялся в чат, разрешите «Универсальный доступ».")
                        .font(.caption)
                    Spacer()
                    Button("Разрешить") { QuickReplySettings.requestPastePermission() }
                        .controlSize(.small)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
            }

            Divider()

            HStack(spacing: 14) {
                Text("↑↓ выбрать")
                Text((QuickReplySettings.autoPaste && QuickReplySettings.canPaste ? "↩ вставить" : "↩ скопировать")
                     + (model.fragment.isEmpty ? "" : " выделенное"))
                Text("esc закрыть")
                Spacer()
                Text(model.fragment.isEmpty ? "Кусок текста справа можно выделить мышкой" : "⌘C — только выделенное")
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

/// Текст справа в панели: только чтение, выделяется мышкой. Выделенное уходит в `selection`.
final class PreviewTextView: NSTextView {}

struct PreviewText: NSViewRepresentable {
    let text: String
    @Binding var selection: String

    func makeCoordinator() -> Coordinator { Coordinator(selection: $selection) }

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false
        scroll.borderType = .noBorder

        let textView = PreviewTextView()
        textView.isEditable = false
        textView.isSelectable = true
        textView.drawsBackground = false
        textView.isRichText = false
        textView.font = .preferredFont(forTextStyle: .callout)
        textView.textColor = .labelColor
        textView.textContainerInset = NSSize(width: 9, height: 4)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.textContainer?.widthTracksTextView = true
        textView.delegate = context.coordinator
        scroll.documentView = textView
        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
        context.coordinator.selection = $selection
        guard let textView = scroll.documentView as? NSTextView, textView.string != text else { return }
        // Смена текста сама сбрасывает выделение — не трогаем состояние посреди обновления вида
        context.coordinator.isUpdating = true
        textView.string = text
        textView.setSelectedRange(NSRange(location: 0, length: 0))
        textView.scrollToBeginningOfDocument(nil)
        context.coordinator.isUpdating = false
        DispatchQueue.main.async { selection = "" }
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var selection: Binding<String>
        var isUpdating = false
        init(selection: Binding<String>) { self.selection = selection }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard !isUpdating, let textView = notification.object as? NSTextView else { return }
            let range = textView.selectedRange()
            let picked = range.length > 0 ? (textView.string as NSString).substring(with: range) : ""
            let trimmed = picked.trimmingCharacters(in: .whitespacesAndNewlines)
            if selection.wrappedValue != trimmed { selection.wrappedValue = trimmed }
        }
    }
}

struct QuickReplyRow: View {
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
    var fontSize: CGFloat = 20
    /// Меняется — поле забирает фокус, курсор в конец текста
    var focusToken: Int = 0
    /// ↑ ↓ Enter в поле; вернуть true, если обработано
    var onCommand: ((Command) -> Bool)? = nil

    enum Command { case up, down, enter }

    func makeNSView(context: Context) -> FieldView {
        let field = FieldView()
        field.isBordered = false
        field.drawsBackground = false
        field.focusRingType = .none
        field.font = .systemFont(ofSize: fontSize)
        field.placeholderString = placeholder
        field.delegate = context.coordinator
        field.cell?.isScrollable = true
        field.cell?.wraps = false
        return field
    }

    func updateNSView(_ field: FieldView, context: Context) {
        context.coordinator.text = $text
        context.coordinator.onCommand = onCommand
        if field.stringValue != text { field.stringValue = text }
        if context.coordinator.lastFocusToken != focusToken {
            context.coordinator.lastFocusToken = focusToken
            DispatchQueue.main.async {
                guard let window = field.window else { return }
                window.makeFirstResponder(field)
                let end = (field.stringValue as NSString).length
                field.currentEditor()?.selectedRange = NSRange(location: end, length: 0)
            }
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(text: $text) }

    final class Coordinator: NSObject, NSTextFieldDelegate {
        var text: Binding<String>
        var lastFocusToken = Int.min
        var onCommand: ((Command) -> Bool)?
        init(text: Binding<String>) { self.text = text }

        func control(_ control: NSControl, textView: NSTextView, doCommandBy selector: Selector) -> Bool {
            guard let onCommand else { return false }
            switch selector {
            case #selector(NSResponder.moveUp(_:)): return onCommand(.up)
            case #selector(NSResponder.moveDown(_:)): return onCommand(.down)
            case #selector(NSResponder.insertNewline(_:)): return onCommand(.enter)
            default: return false
            }
        }

        func controlTextDidChange(_ note: Notification) {
            guard let field = note.object as? NSTextField else { return }
            text.wrappedValue = field.stringValue
        }
    }
}

/// Логотип 1826 (MenuIcon) в цвете текста; если картинки нет — надпись.
struct StudioLogo: View {
    var height: CGFloat

    var body: some View {
        if let logo = NSImage(named: "MenuIcon") {
            Image(nsImage: logo)
                .renderingMode(.template)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(height: height)
        } else {
            Text("1826").font(.system(size: height * 0.8, weight: .bold))
        }
    }
}
