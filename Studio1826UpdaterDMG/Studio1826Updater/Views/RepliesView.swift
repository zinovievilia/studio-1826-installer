import SwiftUI
import AppKit
import UniformTypeIdentifiers

/// «Скрипты ответов»: поиск на всю ширину, у каждой строки — кнопка «Скопировать».
/// Клик по строке открывает скрипт целиком; там же правка, дублирование, экспорт, удаление.
struct RepliesView: View {
    @EnvironmentObject var store: ReplyStore
    @EnvironmentObject var toaster: Toaster

    private enum Screen: Equatable {
        case list
        case detail(String)
        case edit(ReplyScript)
    }

    @State private var screen: Screen = .list
    @EnvironmentObject var search: ReplySearchState
    @State private var category: String?            // nil — все категории
    @State private var alertMessage: String?

    var body: some View {
        Group {
            switch screen {
            case .list:
                listScreen
            case .detail(let id):
                if let item = store.library.item(id: id) {
                    ReplyDetailView(item: item,
                                    back: { screen = .list },
                                    edit: { screen = .edit(item.script) },
                                    duplicate: { duplicate(item) },
                                    export: { export([item.script], name: item.script.title) })
                } else {
                    listScreen.onAppear { screen = .list }
                }
            case .edit(let script):
                ReplyEditorView(script: script,
                                isNew: store.library.item(id: script.id) == nil,
                                categories: store.library.categories,
                                onCancel: {
                                    screen = store.library.item(id: script.id) == nil ? .list : .detail(script.id)
                                },
                                onSave: { saved in
                                    store.update { $0.save(saved) }
                                    screen = .detail(saved.id)
                                    toaster.show("Сохранено")
                                })
            }
        }
        // Начали печатать, пока открыт скрипт целиком, — возвращаемся к поиску
        .onChange(of: search.focusToken) { _ in
            if case .detail = screen { screen = .list }
        }
        .alert(alertMessage ?? "", isPresented: Binding(get: { alertMessage != nil }, set: { if !$0 { alertMessage = nil } })) {
            Button("OK", role: .cancel) { alertMessage = nil }
        }
    }

    // MARK: Список

    private var results: [ReplyItem] {
        store.library.search(query: search.query, category: category)
    }

    private var listScreen: some View {
        VStack(spacing: 0) {
            VStack(spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    QuickSearchField(text: $search.query, placeholder: "Поиск: парковка, пропуск, счёт…",
                                     fontSize: 15, focusToken: search.focusToken)
                        .frame(height: 20)
                    if !search.query.isEmpty {
                        Button {
                            search.query = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill").foregroundColor(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color(nsColor: .textBackgroundColor)))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color(nsColor: .separatorColor).opacity(0.7)))

                HStack(spacing: 8) {
                    Picker("", selection: $category) {
                        Text("Все категории").tag(String?.none)
                        ForEach(store.library.categories, id: \.self) { c in
                            Text(c).tag(String?.some(c))
                        }
                    }
                    .labelsHidden()
                    .frame(maxWidth: 200)

                    Spacer()

                    Button {
                        screen = .edit(ReplyScript.newMine(category: category ?? ""))
                    } label: {
                        Label("Новый", systemImage: "plus")
                    }
                    .controlSize(.small)

                    moreMenu
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            Divider()

            if results.isEmpty {
                VStack(spacing: 8) {
                    Spacer()
                    Image(systemName: "text.magnifyingglass").font(.system(size: 26)).foregroundColor(.secondary)
                    Text(search.query.isEmpty ? "В этой категории пока пусто" : "Ничего не нашлось")
                        .foregroundColor(.secondary)
                    Button("Создать скрипт") {
                        screen = .edit(ReplyScript.newMine(category: category ?? ""))
                    }
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                        if search.query.isEmpty && category == nil {
                            ForEach(groupedResults) { group in
                                Section {
                                    ForEach(group.items) { item in row(item) }
                                } header: {
                                    Text(group.name.uppercased())
                                        .font(.caption2.weight(.semibold))
                                        .foregroundColor(.secondary)
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 4)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .background(Color(nsColor: .windowBackgroundColor))
                                }
                            }
                        } else {
                            ForEach(results) { item in row(item) }
                        }
                    }
                    .padding(.bottom, 8)
                }
            }

            if let warning = store.loadWarning {
                Divider()
                Text(warning).font(.caption).foregroundColor(.orange).padding(8)
            }
        }
        .onAppear { search.focus() }
    }

    private struct ReplyGroup: Identifiable {
        let name: String
        let items: [ReplyItem]
        var id: String { name }
    }

    /// Без поиска — группы по категориям в порядке категорий.
    private var groupedResults: [ReplyGroup] {
        let all = results
        var groups: [ReplyGroup] = []
        for c in store.library.categories {
            let inCategory = all.filter { ReplyLibrary.categoryName($0.script.category) == c }
            if !inCategory.isEmpty { groups.append(ReplyGroup(name: c, items: inCategory)) }
        }
        return groups
    }

    private func row(_ item: ReplyItem) -> some View {
        ReplyRow(item: item,
                 open: { screen = .detail(item.id) },
                 copy: { copy(item) })
    }

    private var moreMenu: some View {
        Menu {
            Button("Импортировать из файла…") { importFile() }
            Button("Экспортировать все…") {
                export(store.library.items.map(\.script), name: "Скрипты Studio 1826")
            }
            if let category {
                Button("Экспортировать «\(category)»…") {
                    export(results.map(\.script), name: category)
                }
            }
            if store.library.hiddenCount > 0 {
                Divider()
                Button("Вернуть удалённые скрипты студии (\(store.library.hiddenCount))") {
                    store.update { $0.restoreHidden() }
                    toaster.show("Скрипты студии возвращены")
                }
            }
        } label: {
            Image(systemName: "ellipsis.circle")
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
        .help("Импорт, экспорт, удалённые скрипты")
    }

    // MARK: Действия

    private func copy(_ item: ReplyItem) {
        Clipboard.copy(item.script.text)
        toaster.show("Скопировано — вставьте клиенту (⌘V)")
    }

    private func duplicate(_ item: ReplyItem) {
        var copy: ReplyScript?
        store.update { copy = $0.duplicate(id: item.id) }
        if let copy { screen = .edit(copy) }
    }

    private func export(_ scripts: [ReplyScript], name: String) {
        guard !scripts.isEmpty else { return }
        let panel = NSSavePanel()
        panel.title = "Экспорт скриптов"
        panel.message = "Файл можно отправить коллеге — он добавит его через «…» → «Импортировать из файла»"
        panel.allowedContentTypes = [.json]
        panel.nameFieldStringValue = (name.isEmpty ? "Скрипты" : name) + ".json"
        let response = PopoverPin.shared.whilePinned { panel.runModal() }
        guard response == .OK, let url = panel.url else { return }
        do {
            try ReplyStore.exportData(scripts).write(to: url, options: .atomic)
            toaster.show("Экспортировано: \(scripts.count)")
        } catch {
            alertMessage = "Не удалось сохранить файл: \(error.localizedDescription)"
        }
    }

    private func importFile() {
        let panel = NSOpenPanel()
        panel.title = "Импорт скриптов"
        panel.allowedContentTypes = [.json]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        let response = PopoverPin.shared.whilePinned { panel.runModal() }
        guard response == .OK, let url = panel.url else { return }
        do {
            let added = try store.importFile(at: url)
            toaster.show(added == 0 ? "Новых скриптов нет — все уже есть" : "Добавлено скриптов: \(added)")
        } catch {
            alertMessage = "Это не файл скриптов Studio 1826 (\(error.localizedDescription))"
        }
    }
}

// MARK: - Строка списка

private struct ReplyRow: View {
    let item: ReplyItem
    let open: () -> Void
    let copy: () -> Void
    @State private var hovering = false

    init(item: ReplyItem, open: @escaping () -> Void, copy: @escaping () -> Void) {
        self.item = item
        self.open = open
        self.copy = copy
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    Text(item.script.title.isEmpty ? "Без названия" : item.script.title)
                        .font(.body.weight(.medium))
                        .lineLimit(1)
                    OriginMark(origin: item.origin)
                }
                // При наведении — весь текст, чтобы понять, что именно отправится
                Text(hovering ? item.script.text : item.script.text.replacingOccurrences(of: "\n", with: " "))
                    .font(.caption)
                    .foregroundColor(hovering ? .primary : .secondary)
                    .lineLimit(hovering ? nil : 2)
                    .fixedSize(horizontal: false, vertical: hovering)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .onTapGesture(perform: open)

            Button(action: copy) {
                Image(systemName: "doc.on.doc")
            }
            .help("Скопировать текст")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(hovering ? Color.accentColor.opacity(0.07) : Color.clear)
        .onHover { inside in
            withAnimation(.easeInOut(duration: 0.15)) { hovering = inside }
        }
        .contextMenu {
            Button("Скопировать текст", action: copy)
            Button("Открыть", action: open)
        }
    }
}

private struct OriginMark: View {
    let origin: ReplyOrigin

    var body: some View {
        switch origin {
        case .studio:
            EmptyView()
        case .studioEdited(let changed):
            Image(systemName: changed ? "exclamationmark.circle.fill" : "pencil.circle")
                .font(.caption)
                .foregroundColor(changed ? .orange : .secondary)
                .help(changed ? "Студия обновила этот скрипт" : "Изменён на этом Mac")
        case .mine:
            Image(systemName: "person.crop.circle")
                .font(.caption)
                .foregroundColor(.secondary)
                .help("Ваш скрипт")
        }
    }
}

// MARK: - Скрипт целиком

private struct ReplyDetailView: View {
    let item: ReplyItem
    let back: () -> Void
    let edit: () -> Void
    let duplicate: () -> Void
    let export: () -> Void

    @EnvironmentObject var store: ReplyStore
    @EnvironmentObject var toaster: Toaster
    @State private var confirmDelete = false

    init(item: ReplyItem, back: @escaping () -> Void, edit: @escaping () -> Void,
         duplicate: @escaping () -> Void, export: @escaping () -> Void) {
        self.item = item
        self.back = back
        self.edit = edit
        self.duplicate = duplicate
        self.export = export
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: back) {
                    Label("Все скрипты", systemImage: "chevron.left")
                }
                .buttonStyle(.borderless)
                .keyboardShortcut(.cancelAction)
                Spacer()
                Menu {
                    Button("Изменить…", action: edit)
                    Button("Дублировать", action: duplicate)
                    Button("Экспортировать…", action: export)
                    if case .studioEdited = item.origin {
                        Button("Вернуть версию студии") {
                            store.update { $0.resetToStudio(id: item.id) }
                        }
                    }
                    Divider()
                    Button("Удалить…") { confirmDelete = true }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(item.script.title.isEmpty ? "Без названия" : item.script.title)
                        .font(.title3.weight(.semibold))
                        .textSelection(.enabled)
                    HStack(spacing: 6) {
                        Badge(text: ReplyLibrary.categoryName(item.script.category))
                        Badge(text: originText, style: item.origin == .mine ? .ok : .neutral)
                    }

                    if case .studioEdited(studioChanged: true) = item.origin,
                       let studio = store.library.studioVersion(of: item.id) {
                        StudioUpdateNotice(studio: studio) {
                            store.update { $0.resetToStudio(id: item.id) }
                            toaster.show("Взята версия студии")
                        } keepMine: {
                            store.update { $0.keepMine(id: item.id) }
                        }
                    }

                    if confirmDelete {
                        deleteConfirmation
                    }

                    Text(item.script.text)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color(nsColor: .textBackgroundColor)))
                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color(nsColor: .separatorColor).opacity(0.6)))

                    if !item.script.keywords.isEmpty {
                        Text(item.script.keywords.map { "#\($0)" }.joined(separator: " "))
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .padding(14)
            }

            Divider()

            HStack(spacing: 8) {
                Button {
                    Clipboard.copy(item.script.text)
                    toaster.show("Скопировано — вставьте клиенту (⌘V)")
                } label: {
                    Label("Скопировать", systemImage: "doc.on.doc").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .keyboardShortcut(.return, modifiers: .command)

                Button("Изменить", action: edit)
                    .controlSize(.large)
            }
            .padding(12)
        }
    }

    private var originText: String {
        switch item.origin {
        case .studio: return "Скрипт студии"
        case .studioEdited: return "Студии, изменён вами"
        case .mine: return "Ваш скрипт"
        }
    }

    private var deleteConfirmation: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(item.origin == .mine
                 ? "Удалить скрипт с этого Mac?"
                 : "Скрыть скрипт студии на этом Mac? Вернуть можно через «…» → «Вернуть удалённые скрипты студии».")
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
            HStack {
                Button("Удалить", role: .destructive) {
                    let id = item.id
                    back()
                    store.update { $0.delete(id: id) }
                    toaster.show("Удалено")
                }
                Button("Отмена") { confirmDelete = false }
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.red.opacity(0.5)))
    }
}

/// Отметка «студия обновила скрипт, который вы правили».
private struct StudioUpdateNotice: View {
    let studio: ReplyScript
    let takeStudio: () -> Void
    let keepMine: () -> Void
    @State private var showStudio = false

    init(studio: ReplyScript, takeStudio: @escaping () -> Void, keepMine: @escaping () -> Void) {
        self.studio = studio
        self.takeStudio = takeStudio
        self.keepMine = keepMine
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Студия обновила этот скрипт, а у вас — своя версия.", systemImage: "exclamationmark.circle.fill")
                .foregroundColor(.orange)
                .font(.callout.weight(.medium))
                .fixedSize(horizontal: false, vertical: true)
            HStack {
                Button(showStudio ? "Скрыть" : "Версия студии") { showStudio.toggle() }
                Button("Взять её", action: takeStudio)
                Button("Оставить мою", action: keepMine)
            }
            .controlSize(.small)
            if showStudio {
                Text(studio.text)
                    .font(.callout)
                    .textSelection(.enabled)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Color.orange.opacity(0.08)))
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.orange.opacity(0.5)))
    }
}
