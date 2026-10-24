import SwiftUI
import AppKit
import UniformTypeIdentifiers

/// «Скрипты ответов»: поиск, категории, копирование, свои скрипты, обмен файлами.
struct RepliesView: View {
    @EnvironmentObject var store: ReplyStore
    @EnvironmentObject var toaster: Toaster

    @State private var query = ""
    @State private var category: String?            // nil — все категории
    @State private var selectedID: String?
    @State private var editing: ReplyScript?
    @State private var deleting: ReplyItem?
    @State private var newCategoryName = ""
    @State private var askNewCategory = false
    @State private var alertMessage: String?

    private var results: [ReplyItem] {
        store.library.search(query: query, category: category)
    }

    private var selected: ReplyItem? {
        selectedID.flatMap { store.library.item(id: $0) }
    }

    var body: some View {
        HStack(spacing: 0) {
            listColumn
                .frame(width: 320)
            Divider()
            detailColumn
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .sheet(item: $editing) { script in
            ReplyEditorView(script: script,
                            isNew: store.library.item(id: script.id) == nil,
                            categories: store.library.categories) { saved in
                store.update { $0.save(saved) }
                selectedID = saved.id
                toaster.show("Сохранено")
            }
        }
        .alert("Удалить скрипт?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
            Button("Удалить", role: .destructive) {
                if let item = deleting {
                    store.update { $0.delete(id: item.id) }
                    if selectedID == item.id { selectedID = nil }
                }
                deleting = nil
            }
            Button("Отмена", role: .cancel) { deleting = nil }
        } message: {
            if let item = deleting {
                Text(item.origin == .mine
                     ? "«\(item.script.title)» будет удалён с этого Mac."
                     : "«\(item.script.title)» — скрипт студии. Он скроется на этом Mac; вернуть можно через меню «Ещё» → «Вернуть удалённые скрипты студии».")
            }
        }
        .alert("Новая категория", isPresented: $askNewCategory) {
            TextField("Название", text: $newCategoryName)
            Button("Добавить") {
                let name = newCategoryName
                store.update { $0.addCategory(name) }
                category = ReplyLibrary.categoryName(name)
                newCategoryName = ""
            }
            Button("Отмена", role: .cancel) { newCategoryName = "" }
        }
        .alert(alertMessage ?? "", isPresented: Binding(get: { alertMessage != nil }, set: { if !$0 { alertMessage = nil } })) {
            Button("OK", role: .cancel) { alertMessage = nil }
        }
        .onAppear {
            if selectedID == nil { selectedID = results.first?.id }
        }
    }

    // MARK: Левая колонка — поиск и список

    private var listColumn: some View {
        VStack(spacing: 0) {
            VStack(spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Поиск по словам: бронь, адрес, свет…", text: $query)
                        .textFieldStyle(.plain)
                    if !query.isEmpty {
                        Button {
                            query = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill").foregroundColor(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(7)
                .background(RoundedRectangle(cornerRadius: 7).fill(Color(nsColor: .textBackgroundColor)))
                .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(Color(nsColor: .separatorColor).opacity(0.6)))

                HStack(spacing: 6) {
                    Picker("", selection: $category) {
                        Text("Все категории").tag(String?.none)
                        ForEach(store.library.categories, id: \.self) { c in
                            Text(c).tag(String?.some(c))
                        }
                    }
                    .labelsHidden()

                    Button {
                        editing = ReplyScript.newMine(category: category ?? "")
                    } label: {
                        Image(systemName: "plus")
                    }
                    .help("Новый скрипт")

                    moreMenu
                }
            }
            .padding(12)

            Divider()

            if results.isEmpty {
                VStack(spacing: 8) {
                    Spacer()
                    Image(systemName: "text.magnifyingglass").font(.system(size: 28)).foregroundColor(.secondary)
                    Text(query.isEmpty ? "В этой категории пока пусто" : "Ничего не нашлось")
                        .foregroundColor(.secondary)
                    Button("Создать скрипт") {
                        editing = ReplyScript.newMine(category: category ?? "")
                    }
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else {
                List(selection: $selectedID) {
                    if query.isEmpty && category == nil {
                        ForEach(groupedResults) { group in
                            Section(group.name) {
                                ForEach(group.items) { item in row(item) }
                            }
                        }
                    } else {
                        ForEach(results) { item in row(item) }
                    }
                }
                .listStyle(.inset)
            }

            if let warning = store.loadWarning {
                Divider()
                Text(warning).font(.caption).foregroundColor(.orange).padding(8)
            }
        }
    }

    /// Без поиска — группы по категориям в порядке категорий.
    private struct ReplyGroup: Identifiable {
        let name: String
        let items: [ReplyItem]
        var id: String { name }
    }

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
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Text(item.script.title.isEmpty ? "Без названия" : item.script.title)
                    .font(.body.weight(.medium))
                    .lineLimit(1)
                Spacer(minLength: 4)
                originMark(item.origin)
            }
            Text(item.script.text.replacingOccurrences(of: "\n", with: " "))
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(2)
        }
        .padding(.vertical, 3)
        .tag(item.id)
        .contextMenu { actions(for: item) }
    }

    @ViewBuilder
    private func originMark(_ origin: ReplyOrigin) -> some View {
        switch origin {
        case .studio:
            EmptyView()
        case .studioEdited(let changed):
            Image(systemName: changed ? "exclamationmark.circle.fill" : "pencil.circle")
                .foregroundColor(changed ? .orange : .secondary)
                .help(changed ? "Студия обновила этот скрипт" : "Изменён на этом Mac")
        case .mine:
            Image(systemName: "person.crop.circle")
                .foregroundColor(.secondary)
                .help("Ваш скрипт")
        }
    }

    @ViewBuilder
    private func actions(for item: ReplyItem) -> some View {
        Button("Скопировать текст") { copy(item) }
        Button("Изменить…") { editing = item.script }
        Button("Дублировать") { duplicate(item) }
        Button("Экспортировать…") { export([item.script], name: item.script.title) }
        Divider()
        Button("Удалить…", role: .destructive) { deleting = item }
    }

    private var moreMenu: some View {
        Menu {
            Button("Новая категория…") { askNewCategory = true }
            Divider()
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
        .frame(width: 28)
        .help("Ещё: категории, импорт и экспорт")
    }

    // MARK: Правая колонка — выбранный скрипт

    @ViewBuilder
    private var detailColumn: some View {
        if let item = selected {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(item.script.title.isEmpty ? "Без названия" : item.script.title)
                            .font(.title2.weight(.semibold))
                            .textSelection(.enabled)
                        Spacer()
                    }
                    HStack(spacing: 6) {
                        Badge(text: ReplyLibrary.categoryName(item.script.category))
                        Badge(text: originText(item.origin),
                              style: item.origin == .mine ? .ok : .neutral)
                        ForEach(item.script.keywords, id: \.self) { k in
                            Text("#\(k)").font(.caption).foregroundColor(.secondary)
                        }
                    }

                    if case .studioEdited(studioChanged: true) = item.origin, let studio = store.library.studioVersion(of: item.id) {
                        StudioUpdateNotice(studio: studio) {
                            store.update { $0.resetToStudio(id: item.id) }
                            toaster.show("Взята версия студии")
                        } keepMine: {
                            store.update { $0.keepMine(id: item.id) }
                        }
                    }

                    Card {
                        Text(item.script.text)
                            .font(.body)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    HStack(spacing: 10) {
                        Button {
                            copy(item)
                        } label: {
                            Label("Скопировать", systemImage: "doc.on.doc")
                                .frame(minWidth: 140)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .keyboardShortcut(.return, modifiers: .command)

                        Button("Изменить…") { editing = item.script }
                            .controlSize(.large)

                        Menu {
                            actions(for: item)
                            if case .studioEdited = item.origin {
                                Divider()
                                Button("Вернуть версию студии") {
                                    store.update { $0.resetToStudio(id: item.id) }
                                }
                            }
                        } label: {
                            Image(systemName: "ellipsis")
                        }
                        .menuStyle(.borderlessButton)
                        .frame(width: 30)
                        Spacer()
                    }
                    Text("⌘↩ — скопировать").font(.caption).foregroundColor(.secondary)
                }
                .padding(24)
                .frame(maxWidth: 720, alignment: .leading)
            }
        } else {
            VStack(spacing: 10) {
                Image(systemName: "text.bubble").font(.system(size: 34)).foregroundColor(.secondary)
                Text("Выберите скрипт слева").foregroundColor(.secondary)
                Text("Найти нужный — поиском по ключевым словам.\nСвой скрипт — кнопкой «+».")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private func originText(_ origin: ReplyOrigin) -> String {
        switch origin {
        case .studio: return "Скрипт студии"
        case .studioEdited: return "Скрипт студии, изменён вами"
        case .mine: return "Ваш скрипт"
        }
    }

    // MARK: Действия

    private func copy(_ item: ReplyItem) {
        Clipboard.copy(item.script.text)
        toaster.show("Скопировано — вставьте клиенту (⌘V)")
    }

    private func duplicate(_ item: ReplyItem) {
        var copy: ReplyScript?
        store.update { copy = $0.duplicate(id: item.id) }
        if let copy {
            selectedID = copy.id
            editing = copy
        }
    }

    private func export(_ scripts: [ReplyScript], name: String) {
        guard !scripts.isEmpty else { return }
        let panel = NSSavePanel()
        panel.title = "Экспорт скриптов"
        panel.message = "Файл можно отправить коллеге — он импортирует его через «Ещё» → «Импортировать из файла…»"
        panel.allowedContentTypes = [.json]
        panel.nameFieldStringValue = (name.isEmpty ? "Скрипты" : name) + ".json"
        guard panel.runModal() == .OK, let url = panel.url else { return }
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
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            let added = try store.importFile(at: url)
            toaster.show(added == 0 ? "Новых скриптов нет — все уже есть" : "Добавлено скриптов: \(added)")
        } catch {
            alertMessage = "Это не файл скриптов Studio 1826 (\(error.localizedDescription))"
        }
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
            HStack {
                Button(showStudio ? "Скрыть версию студии" : "Показать версию студии") { showStudio.toggle() }
                Button("Взять версию студии", action: takeStudio)
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
