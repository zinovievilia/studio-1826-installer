import Foundation

// Библиотека скриптов ответов клиентам.
//
// Два слоя:
//  • базовая библиотека студии — Resources/ReplyLibrary.json, приходит с обновлением приложения;
//  • пользовательский слой на этом Mac — свои скрипты, правки базовых, удалённые базовые.
// Обновление приложения меняет только базовый слой: свои скрипты и правки сотрудника не затираются,
// а если студия поменяла скрипт, который сотрудник правил, он увидит отметку и выберет версию.

struct ReplyScript: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var category: String
    var text: String
    var keywords: [String]

    init(id: String, title: String, category: String, text: String, keywords: [String] = []) {
        self.id = id
        self.title = title
        self.category = category
        self.text = text
        self.keywords = keywords
    }

    static func newMine(category: String = "") -> ReplyScript {
        ReplyScript(id: "my." + UUID().uuidString, title: "", category: category, text: "")
    }
}

extension ReplyScript {
    private enum CodingKeys: String, CodingKey { case id, title, category, text, keywords }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        self.init(
            id: try c.decodeIfPresent(String.self, forKey: .id) ?? "my." + UUID().uuidString,
            title: title,
            category: try c.decodeIfPresent(String.self, forKey: .category) ?? "",
            text: try c.decodeIfPresent(String.self, forKey: .text) ?? "",
            keywords: try c.decodeIfPresent([String].self, forKey: .keywords) ?? []
        )
    }
}

struct BaseReplyLibrary: Codable {
    var version: Int
    var categories: [String]
    var scripts: [ReplyScript]

    static let empty = BaseReplyLibrary(version: 0, categories: [], scripts: [])
}

/// Правка базового скрипта на этом Mac.
struct ReplyOverride: Codable, Hashable {
    var script: ReplyScript
    /// Каким был скрипт студии, когда его поправили. Если базовый изменился — показываем отметку.
    var studioSnapshot: ReplyScript
}

struct ReplyUserState: Codable {
    var custom: [ReplyScript]
    var overrides: [String: ReplyOverride]
    var hiddenBaseIDs: [String]
    var extraCategories: [String]

    init(custom: [ReplyScript] = [], overrides: [String: ReplyOverride] = [:],
         hiddenBaseIDs: [String] = [], extraCategories: [String] = []) {
        self.custom = custom
        self.overrides = overrides
        self.hiddenBaseIDs = hiddenBaseIDs
        self.extraCategories = extraCategories
    }
}

extension ReplyUserState {
    private enum CodingKeys: String, CodingKey { case custom, overrides, hiddenBaseIDs, extraCategories }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            custom: try c.decodeIfPresent([ReplyScript].self, forKey: .custom) ?? [],
            overrides: try c.decodeIfPresent([String: ReplyOverride].self, forKey: .overrides) ?? [:],
            hiddenBaseIDs: try c.decodeIfPresent([String].self, forKey: .hiddenBaseIDs) ?? [],
            extraCategories: try c.decodeIfPresent([String].self, forKey: .extraCategories) ?? []
        )
    }
}

enum ReplyOrigin: Hashable {
    /// Скрипт студии без изменений
    case studio
    /// Скрипт студии, изменённый на этом Mac; studioChanged — студия с тех пор выпустила новую версию
    case studioEdited(studioChanged: Bool)
    /// Свой скрипт сотрудника (создан или импортирован)
    case mine

    var label: String {
        switch self {
        case .studio: return "Студии"
        case .studioEdited: return "Изменён"
        case .mine: return "Мой"
        }
    }
}

struct ReplyItem: Identifiable, Hashable {
    var script: ReplyScript
    var origin: ReplyOrigin
    var id: String { script.id }
}

/// Файл обмена скриптами между сотрудниками.
struct ReplyExportFile: Codable {
    var format: String
    var version: Int
    var scripts: [ReplyScript]

    init(scripts: [ReplyScript]) {
        self.format = "studio1826-replies"
        self.version = 1
        self.scripts = scripts
    }
}

/// Для импорта подходит любой JSON с массивом `scripts` (в том числе ReplyLibrary.json студии).
struct ReplyImportPayload: Decodable {
    var scripts: [ReplyScript]
}

struct ReplyLibrary {
    static let uncategorized = "Без категории"

    var base: BaseReplyLibrary
    var state: ReplyUserState

    // MARK: Чтение

    var items: [ReplyItem] {
        let hidden = Set(state.hiddenBaseIDs)
        var result: [ReplyItem] = []
        for studio in base.scripts where !hidden.contains(studio.id) {
            if let edit = state.overrides[studio.id] {
                result.append(ReplyItem(script: edit.script,
                                        origin: .studioEdited(studioChanged: edit.studioSnapshot != studio)))
            } else {
                result.append(ReplyItem(script: studio, origin: .studio))
            }
        }
        for mine in state.custom {
            result.append(ReplyItem(script: mine, origin: .mine))
        }
        return result
    }

    func item(id: String) -> ReplyItem? {
        items.first { $0.id == id }
    }

    func studioVersion(of id: String) -> ReplyScript? {
        base.scripts.first { $0.id == id }
    }

    var hiddenCount: Int {
        let ids = Set(base.scripts.map(\.id))
        return Set(state.hiddenBaseIDs).intersection(ids).count
    }

    /// Порядок: категории студии, затем категории из скриптов, затем добавленные вручную.
    var categories: [String] {
        var seen = Set<String>()
        var list: [String] = []
        let candidates = base.categories + items.map { Self.categoryName($0.script.category) } + state.extraCategories
        for raw in candidates {
            let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if !name.isEmpty && seen.insert(name).inserted { list.append(name) }
        }
        return list
    }

    static func categoryName(_ raw: String) -> String {
        let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? uncategorized : name
    }

    /// Поиск по словам (все слова должны встретиться; «ё» = «е»). Выше — совпадения в названии.
    func search(query: String, category: String?) -> [ReplyItem] {
        var list = items
        if let category {
            list = list.filter { Self.categoryName($0.script.category) == category }
        }
        let words = ReplySearch.words(query)
        guard !words.isEmpty else { return list }

        let scored: [(offset: Int, item: ReplyItem, score: Int)] = list.enumerated().compactMap { pair in
            let s = ReplySearch.score(pair.element.script, words: words)
            guard s > 0 else { return nil }
            return (offset: pair.offset, item: pair.element, score: s)
        }
        return scored
            .sorted { a, b in a.score != b.score ? a.score > b.score : a.offset < b.offset }
            .map { $0.item }
    }

    // MARK: Изменения

    /// Сохранить новый или изменённый скрипт.
    mutating func save(_ script: ReplyScript) {
        var s = script
        s.title = s.title.trimmingCharacters(in: .whitespacesAndNewlines)
        s.category = Self.categoryName(s.category)
        s.keywords = s.keywords
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        if let studio = studioVersion(of: s.id) {
            if s == studio {
                state.overrides[s.id] = nil
            } else {
                let snapshot = state.overrides[s.id]?.studioSnapshot ?? studio
                state.overrides[s.id] = ReplyOverride(script: s, studioSnapshot: snapshot)
            }
            state.hiddenBaseIDs.removeAll { $0 == s.id }
        } else if let i = state.custom.firstIndex(where: { $0.id == s.id }) {
            state.custom[i] = s
        } else {
            state.custom.append(s)
        }
    }

    mutating func delete(id: String) {
        if studioVersion(of: id) != nil {
            if !state.hiddenBaseIDs.contains(id) { state.hiddenBaseIDs.append(id) }
            state.overrides[id] = nil
        } else {
            state.custom.removeAll { $0.id == id }
        }
    }

    /// Вернуть версию студии (отменить свои правки).
    mutating func resetToStudio(id: String) {
        state.overrides[id] = nil
    }

    /// Оставить свою версию и убрать отметку «студия обновила».
    mutating func keepMine(id: String) {
        guard var edit = state.overrides[id], let studio = studioVersion(of: id) else { return }
        edit.studioSnapshot = studio
        state.overrides[id] = edit
    }

    mutating func restoreHidden() {
        state.hiddenBaseIDs = []
    }

    mutating func addCategory(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !categories.contains(trimmed) else { return }
        state.extraCategories.append(trimmed)
    }

    /// Копия скрипта как своего.
    mutating func duplicate(id: String) -> ReplyScript? {
        guard let source = item(id: id)?.script else { return nil }
        var copy = source
        copy.id = "my." + UUID().uuidString
        copy.title = source.title + " (копия)"
        state.custom.append(copy)
        return copy
    }

    /// Импорт: каждый скрипт становится своим, точные дубли (то же название и текст) пропускаются.
    /// Возвращает число добавленных.
    @discardableResult
    mutating func importScripts(_ scripts: [ReplyScript]) -> Int {
        var known = Set(items.map { Self.dedupKey($0.script) })
        var added = 0
        for incoming in scripts {
            let key = Self.dedupKey(incoming)
            guard !incoming.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  !known.contains(key) else { continue }
            var copy = incoming
            copy.id = "my." + UUID().uuidString
            copy.category = Self.categoryName(copy.category)
            state.custom.append(copy)
            known.insert(key)
            added += 1
        }
        return added
    }

    private static func dedupKey(_ s: ReplyScript) -> String {
        s.title.trimmingCharacters(in: .whitespacesAndNewlines) + "\u{1F}" + s.text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

enum ReplySearch {
    static func normalize(_ text: String) -> String {
        text.lowercased().replacingOccurrences(of: "ё", with: "е")
    }

    static func words(_ query: String) -> [String] {
        normalize(query)
            .split(whereSeparator: { ch in ch.isWhitespace || ch == "," || ch == ";" })
            .map(String.init)
    }

    /// 0 — не подходит. Иначе: название ×3, ключевые слова и категория ×2, текст ×1.
    static func score(_ script: ReplyScript, words: [String]) -> Int {
        let title = normalize(script.title)
        let tags = normalize(script.keywords.joined(separator: " ") + " " + script.category)
        let body = normalize(script.text)
        var total = 0
        for word in words {
            var s = 0
            if title.contains(word) { s += 3 }
            if tags.contains(word) { s += 2 }
            if body.contains(word) { s += 1 }
            if s == 0 { return 0 }
            total += s
        }
        return total
    }
}
