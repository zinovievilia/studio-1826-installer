import SwiftUI
import AppKit

/// «Ссылки»: телефоны, страницы филиалов и рабочие ссылки. Список настраивается под себя:
/// «Изменить» — свои строки, кнопка «Скопировать» у каждой, перетаскивание строк и разделов.
struct LinksView: View {
    @EnvironmentObject var links: LinksStore
    @EnvironmentObject var toaster: Toaster

    private struct EditorTarget: Equatable {
        var item: LinkEntry
        var groupID: String
        var isNew: Bool
    }

    @State private var editing = false
    @State private var editor: EditorTarget?
    @State private var confirmReset = false
    @State private var groupToDelete: LinkGroup?

    var body: some View {
        if let editor {
            LinkEditorView(item: editor.item, groupID: editor.groupID, isNew: editor.isNew,
                           groups: links.layout.groups,
                           onCancel: { self.editor = nil },
                           onSave: { item, groupID in
                               links.update { $0.save(item, in: groupID) }
                               self.editor = nil
                               toaster.show("Сохранено")
                           })
        } else {
            list
        }
    }

    private var list: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    Hint(text: editing
                         ? "Перетаскивайте за ⠿ строки и разделы. Значок копирования — есть ли у строки кнопка «Скопировать»."
                         : "Открыть страницу или скопировать, чтобы отправить клиенту.")
                    Spacer(minLength: 8)
                    Button(editing ? "Готово" : "Изменить") {
                        withAnimation(.easeInOut(duration: 0.15)) { editing.toggle() }
                        confirmReset = false
                    }
                    .controlSize(.small)
                    .buttonStyle(.borderedProminent)
                    .tint(editing ? .accentColor : .gray)
                }

                ForEach(links.layout.groups) { group in
                    LinkGroupCard(group: group, editing: editing,
                                  onAdd: { editor = EditorTarget(item: .newMine(), groupID: group.id, isNew: true) },
                                  onEdit: { item in editor = EditorTarget(item: item, groupID: group.id, isNew: false) },
                                  onDelete: { groupToDelete = group })
                }

                if editing { editingFooter }
            }
            .padding(14)
        }
        .alert("Удалить раздел «\(groupToDelete?.title ?? "")»?",
               isPresented: Binding(get: { groupToDelete != nil }, set: { if !$0 { groupToDelete = nil } })) {
            Button("Удалить", role: .destructive) {
                if let id = groupToDelete?.id { links.update { $0.deleteGroup(id: id) } }
                groupToDelete = nil
            }
            Button("Отмена", role: .cancel) { groupToDelete = nil }
        } message: {
            Text("Вместе со всеми строками в нём.")
        }
    }

    private var editingFooter: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                let group = LinkGroup.newMine()
                links.update { $0.groups.append(group) }
            } label: {
                Label("Новый раздел", systemImage: "plus.rectangle.on.rectangle")
            }

            if confirmReset {
                HStack {
                    Text("Свои строки и порядок пропадут.").font(.caption)
                    Spacer()
                    Button("Отмена") { confirmReset = false }.controlSize(.small)
                    Button("Вернуть") {
                        links.resetToStudio()
                        confirmReset = false
                        toaster.show("Ссылки как у студии")
                    }
                    .controlSize(.small)
                    .tint(.red)
                    .buttonStyle(.borderedProminent)
                }
            } else {
                Button {
                    confirmReset = true
                } label: {
                    Label("Вернуть как у студии", systemImage: "arrow.uturn.backward")
                }
                .disabled(!links.isCustomized)
            }
        }
        .buttonStyle(.borderless)
        .padding(.horizontal, 4)
    }
}

// MARK: - Раздел

private enum DragPayload {
    static func group(_ id: String) -> String { "group:" + id }
    static func item(_ id: String) -> String { "item:" + id }

    static func parse(_ payload: String) -> (isGroup: Bool, id: String)? {
        if payload.hasPrefix("group:") { return (true, String(payload.dropFirst(6))) }
        if payload.hasPrefix("item:") { return (false, String(payload.dropFirst(5))) }
        return nil
    }
}

private struct LinkGroupCard: View {
    let group: LinkGroup
    let editing: Bool
    let onAdd: () -> Void
    let onEdit: (LinkEntry) -> Void
    let onDelete: () -> Void

    @EnvironmentObject var links: LinksStore
    @EnvironmentObject var toaster: Toaster
    @State private var isTargeted = false

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                header
                ForEach(Array(group.items.enumerated()), id: \.element.id) { pair in
                    if pair.offset > 0 { Divider() }
                    LinkEntryRow(item: pair.element, editing: editing, onEdit: { onEdit(pair.element) })
                }
                if group.items.isEmpty && editing {
                    Text("Перетащите сюда строку или добавьте новую").font(.caption).foregroundColor(.secondary)
                }
                if editing {
                    Button(action: onAdd) {
                        Label("Добавить ссылку, телефон или текст", systemImage: "plus.circle")
                    }
                    .buttonStyle(.borderless)
                }
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
            .strokeBorder(Color.accentColor, lineWidth: 2)
            .opacity(isTargeted ? 1 : 0))
        // Раздел — на место другого раздела; строка — в конец раздела
        .dropDestination(for: String.self) { payloads, _ in
            guard editing, let payload = payloads.first, let parsed = DragPayload.parse(payload) else { return false }
            links.update {
                if parsed.isGroup { $0.moveGroup(id: parsed.id, onto: group.id) } else { $0.moveItem(id: parsed.id, toGroup: group.id) }
            }
            return true
        } isTargeted: { isTargeted = editing && $0 }
    }

    @ViewBuilder
    private var header: some View {
        if editing {
            HStack(spacing: 8) {
                Grip()
                    .draggable(DragPayload.group(group.id)) { DragPreview(title: group.title, systemImage: group.systemImage) }
                TextField("Название раздела", text: Binding(
                    get: { group.title },
                    set: { title in links.update { layout in
                        if let i = layout.groups.firstIndex(where: { $0.id == group.id }) { layout.groups[i].title = title }
                    } }))
                    .textFieldStyle(.roundedBorder)
                    .font(.headline)
                Menu {
                    Toggle("Кнопка «Все ссылки»", isOn: Binding(
                        get: { group.copyAll },
                        set: { on in links.update { layout in
                            if let i = layout.groups.firstIndex(where: { $0.id == group.id }) { layout.groups[i].copyAll = on }
                        } }))
                    Button("Выше") { links.update { $0.moveGroup(id: group.id, by: -1) } }
                    Button("Ниже") { links.update { $0.moveGroup(id: group.id, by: 1) } }
                    Divider()
                    Button("Удалить раздел…", role: .destructive, action: onDelete)
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
            }
        } else {
            HStack {
                Label(group.title, systemImage: group.systemImage).font(.headline)
                Spacer()
                if group.copyAll && !group.items.isEmpty {
                    Button {
                        Clipboard.copy(group.allText)
                        toaster.show("«\(group.title)» скопировано")
                    } label: {
                        Label("Все ссылки", systemImage: "doc.on.doc")
                    }
                    .controlSize(.small)
                    .help("Скопировать весь раздел одним сообщением")
                }
            }
        }
    }
}

// MARK: - Строка

private struct LinkEntryRow: View {
    let item: LinkEntry
    let editing: Bool
    let onEdit: () -> Void

    @EnvironmentObject var links: LinksStore
    @EnvironmentObject var toaster: Toaster
    @State private var isTargeted = false

    var body: some View {
        HStack(spacing: 10) {
            if editing {
                Grip()
                    .draggable(DragPayload.item(item.id)) { DragPreview(title: item.title, systemImage: item.systemImage) }
            }
            Image(systemName: item.systemImage)
                .frame(width: 22)
                .foregroundColor(.accentColor)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.title).font(.body.weight(.medium))
                Text(item.subtitle)
                    .font(item.kind == .phone ? .caption.monospacedDigit() : .caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Spacer(minLength: 6)
            if editing { editButtons } else { buttons }
        }
        .contentShape(Rectangle())
        .padding(.vertical, 2)
        .background(RoundedRectangle(cornerRadius: 6).fill(Color.accentColor.opacity(isTargeted ? 0.18 : 0)))
        .dropDestination(for: String.self) { payloads, _ in
            guard editing, let payload = payloads.first, let parsed = DragPayload.parse(payload), !parsed.isGroup else { return false }
            links.update { $0.moveItem(id: parsed.id, onto: item.id) }
            return true
        } isTargeted: { isTargeted = editing && $0 }
        .contextMenu {
            if let url = item.url, item.kind == .link {
                Button("Открыть") { NSWorkspace.shared.open(url) }
            }
            Button("Скопировать") { copy() }
            Divider()
            Button("Изменить…", action: onEdit)
            Button("Выше") { links.update { $0.moveItem(id: item.id, by: -1) } }
            Button("Ниже") { links.update { $0.moveItem(id: item.id, by: 1) } }
            Button("Удалить", role: .destructive) { links.update { $0.deleteItem(id: item.id) } }
        }
    }

    @ViewBuilder
    private var buttons: some View {
        if item.copyable {
            Button(action: copy) {
                if item.kind == .link { Image(systemName: "doc.on.doc") } else { Label("Скопировать", systemImage: "doc.on.doc") }
            }
            .help("Скопировать: \(item.value)")
        }
        if let url = item.url, item.kind == .link {
            Button {
                NSWorkspace.shared.open(url)
            } label: {
                Image(systemName: "arrow.up.right.square")
            }
            .help(item.value)
        }
    }

    private var editButtons: some View {
        HStack(spacing: 4) {
            Button {
                links.update { layout in
                    guard let (g, i) = layout.location(of: item.id) else { return }
                    layout.groups[g].items[i].copyable.toggle()
                }
            } label: {
                Image(systemName: item.copyable ? "doc.on.doc.fill" : "doc.on.doc")
                    .foregroundColor(item.copyable ? .accentColor : .secondary)
            }
            .help(item.copyable ? "Кнопка «Скопировать» есть — нажмите, чтобы убрать" : "Кнопки «Скопировать» нет — нажмите, чтобы добавить")
            Button(action: onEdit) { Image(systemName: "pencil") }
                .help("Изменить")
            Button {
                links.update { $0.deleteItem(id: item.id) }
            } label: {
                Image(systemName: "trash").foregroundColor(.red)
            }
            .help("Удалить")
        }
        .buttonStyle(.borderless)
    }

    private func copy() {
        Clipboard.copy(item.value.trimmingCharacters(in: .whitespacesAndNewlines))
        toaster.show("«\(item.title)» скопировано")
    }
}

private struct Grip: View {
    var body: some View {
        Image(systemName: "line.3.horizontal")
            .foregroundColor(.secondary)
            .frame(width: 18, height: 22)
            .contentShape(Rectangle())
            .help("Перетащите, чтобы переставить")
    }
}

private struct DragPreview: View {
    let title: String
    let systemImage: String

    var body: some View {
        Label(title, systemImage: systemImage)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color(nsColor: .controlBackgroundColor)))
    }
}

// MARK: - Редактор строки

private struct LinkEditorView: View {
    private let original: LinkEntry
    private let isNew: Bool
    private let groups: [LinkGroup]
    private let onCancel: () -> Void
    private let onSave: (LinkEntry, String) -> Void

    @State private var title: String
    @State private var detail: String
    @State private var value: String
    @State private var systemImage: String
    @State private var copyable: Bool
    @State private var groupID: String

    private static let icons = [
        "link", "globe", "phone", "envelope", "map", "mappin.and.ellipse", "building.2", "camera",
        "square.grid.2x2", "calendar.badge.plus", "creditcard", "tablecells", "doc.text", "briefcase",
        "person.2", "key", "wifi", "car", "star", "info.circle",
    ]

    init(item: LinkEntry, groupID: String, isNew: Bool, groups: [LinkGroup],
         onCancel: @escaping () -> Void, onSave: @escaping (LinkEntry, String) -> Void) {
        original = item
        self.isNew = isNew
        self.groups = groups
        self.onCancel = onCancel
        self.onSave = onSave
        _title = State(initialValue: item.title)
        _detail = State(initialValue: item.detail)
        _value = State(initialValue: item.value)
        _systemImage = State(initialValue: item.systemImage)
        _copyable = State(initialValue: item.copyable)
        _groupID = State(initialValue: groupID)
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var kindHint: String {
        guard !value.trimmingCharacters(in: .whitespaces).isEmpty else { return "Ссылка, телефон или любой текст" }
        switch LinkKind.detect(value) {
        case .link: return "Ссылка — будет кнопка «Открыть»"
        case .phone: return "Телефон: \(PhoneFormat.pretty(value))"
        case .text: return "Текст — его можно копировать"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(isNew ? "Новая строка" : "Изменить строку").font(.headline)
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    labeled("Название") {
                        TextField("Например: Wi-Fi в зале", text: $title).textFieldStyle(.roundedBorder)
                    }
                    labeled(kindHint) {
                        TextField("https://… или +7… или текст", text: $value).textFieldStyle(.roundedBorder)
                    }
                    labeled("Подпись под названием — необязательно") {
                        TextField("Пусто — покажется сама ссылка или номер", text: $detail).textFieldStyle(.roundedBorder)
                    }
                    labeled("Раздел") {
                        Picker("", selection: $groupID) {
                            ForEach(groups) { g in Text(g.title).tag(g.id) }
                        }
                        .labelsHidden()
                    }
                    labeled("Значок") {
                        LazyVGrid(columns: Array(repeating: GridItem(.fixed(30), spacing: 6), count: 10), spacing: 6) {
                            ForEach(Self.icons, id: \.self) { icon in
                                Button {
                                    systemImage = icon
                                } label: {
                                    Image(systemName: icon)
                                        .frame(width: 28, height: 28)
                                        .background(RoundedRectangle(cornerRadius: 6)
                                            .fill(systemImage == icon ? Color.accentColor.opacity(0.25) : Color.clear))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    Toggle("Кнопка «Скопировать»", isOn: $copyable)
                }
                .padding(14)
            }

            Divider()

            HStack {
                Button("Отмена", action: onCancel).keyboardShortcut(.cancelAction)
                Spacer()
                Button("Сохранить") {
                    var result = original
                    result.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
                    result.detail = detail.trimmingCharacters(in: .whitespacesAndNewlines)
                    result.value = value.trimmingCharacters(in: .whitespacesAndNewlines)
                    result.systemImage = systemImage
                    result.copyable = copyable
                    onSave(result, groupID)
                }
                .keyboardShortcut("s", modifiers: .command)
                .buttonStyle(.borderedProminent)
                .disabled(!canSave)
            }
            .padding(12)
        }
    }

    private func labeled<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundColor(.secondary)
            content()
        }
    }
}
