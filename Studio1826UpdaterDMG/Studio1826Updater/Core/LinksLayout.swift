import Foundation

// Вкладка «Ссылки», которую сотрудник настраивает под себя: разделы и строки можно двигать,
// переименовывать, скрывать, добавлять свои. Набор студии приходит с обновлением приложения;
// новые строки студии добавляются к настроенному списку, удалённые сотрудником — не возвращаются.

enum LinkKind: String, Codable, CaseIterable {
    case link, phone, text

    /// Угадываем по содержимому: ссылка, телефон или просто текст.
    static func detect(_ value: String) -> LinkKind {
        let v = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if v.lowercased().hasPrefix("http://") || v.lowercased().hasPrefix("https://") { return .link }
        let digits = v.filter(\.isNumber)
        let allowed = CharacterSet(charactersIn: "+0123456789 ()-")
        if digits.count >= 10 && digits.count <= 12 && v.unicodeScalars.allSatisfy(allowed.contains) { return .phone }
        return .text
    }
}

struct LinkEntry: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    /// Подпись под названием (может быть пустой)
    var detail: String
    /// Ссылка, телефон или текст — то, что копируется
    var value: String
    var systemImage: String
    var copyable: Bool

    var kind: LinkKind { LinkKind.detect(value) }

    var url: URL? {
        let v = value.trimmingCharacters(in: .whitespacesAndNewlines)
        switch kind {
        case .link: return URL(string: v)
        case .phone: return URL(string: "tel:" + v.filter { $0.isNumber || $0 == "+" })
        case .text: return nil
        }
    }

    /// Что видно в строке под названием
    var subtitle: String {
        if !detail.isEmpty { return detail }
        if kind == .phone { return PhoneFormat.pretty(value) }
        return value
    }

    static func newMine() -> LinkEntry {
        LinkEntry(id: "my." + UUID().uuidString, title: "", detail: "", value: "", systemImage: "link", copyable: true)
    }
}

struct LinkGroup: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var systemImage: String
    var items: [LinkEntry]
    /// Кнопка «Все ссылки» — копирует раздел одним сообщением
    var copyAll: Bool

    var allText: String {
        ([title] + items.map { "\($0.title): \($0.value)" }).joined(separator: "\n")
    }

    static func newMine() -> LinkGroup {
        LinkGroup(id: "my." + UUID().uuidString, title: "Новый раздел", systemImage: "folder", items: [], copyAll: false)
    }
}

enum PhoneFormat {
    /// +79165201826 → +7 916 520-18-26
    static func pretty(_ number: String) -> String {
        let c = Array(number.filter(\.isNumber))
        guard c.count == 11 else { return number }
        return "+\(c[0]) \(String(c[1...3])) \(String(c[4...6]))-\(String(c[7...8]))-\(String(c[9...10]))"
    }
}

struct LinksLayout: Codable, Equatable {
    var groups: [LinkGroup]
    /// id строк и разделов студии, которые этот Mac уже видел: удалённые сотрудником не возвращаем
    var knownStudioIDs: Set<String>

    init(groups: [LinkGroup], knownStudioIDs: Set<String> = []) {
        self.groups = groups
        self.knownStudioIDs = knownStudioIDs
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        groups = try c.decodeIfPresent([LinkGroup].self, forKey: .groups) ?? []
        knownStudioIDs = try c.decodeIfPresent(Set<String>.self, forKey: .knownStudioIDs) ?? []
    }

    // MARK: Набор студии

    static var studio: LinksLayout {
        let phones = LinkGroup(id: "studio.phones", title: "Телефоны", systemImage: "phone",
                               items: StudioPhone.all.map {
                                   LinkEntry(id: "studio.phone.\($0.id)", title: $0.title, detail: "", value: $0.number,
                                             systemImage: "phone", copyable: true)
                               }, copyAll: false)
        let branches = StudioBranch.allCases.map { branch in
            LinkGroup(id: "studio.\(branch.rawValue)", title: branch.title, systemImage: "building.2",
                      items: branch.links.map {
                          LinkEntry(id: "studio.\($0.id)", title: $0.title, detail: $0.detail,
                                    value: $0.url.absoluteString, systemImage: $0.systemImage, copyable: true)
                      }, copyAll: true)
        }
        let staff = LinkGroup(id: "studio.staff", title: "Для сотрудников", systemImage: "person.2", items: [
            LinkEntry(id: "studio.salary", title: "Таблица зарплаты", detail: "Google Таблицы",
                      value: StudioLinks.salarySheet.absoluteString, systemImage: "tablecells", copyable: false),
            LinkEntry(id: "studio.bitrix", title: "Bitrix24", detail: "1826studio.bitrix24.ru",
                      value: StudioLinks.bitrix.absoluteString, systemImage: "briefcase", copyable: false),
        ], copyAll: false)
        var layout = LinksLayout(groups: [phones] + branches + [staff])
        layout.knownStudioIDs = layout.allIDs
        return layout
    }

    var allIDs: Set<String> {
        Set(groups.map(\.id) + groups.flatMap { $0.items.map(\.id) })
    }

    /// Добавляет строки и разделы студии, которых этот Mac ещё не видел.
    mutating func merge(studio: LinksLayout) {
        for group in studio.groups {
            if !knownStudioIDs.contains(group.id) && !groups.contains(where: { $0.id == group.id }) {
                var fresh = group
                fresh.items.removeAll { knownStudioIDs.contains($0.id) }
                groups.append(fresh)
                continue
            }
            let newItems = group.items.filter { !knownStudioIDs.contains($0.id) && !allIDs.contains($0.id) }
            guard !newItems.isEmpty else { continue }
            if let index = groups.firstIndex(where: { $0.id == group.id }) {
                groups[index].items += newItems
            } else {
                var fresh = group
                fresh.items = newItems
                groups.append(fresh)
            }
        }
        knownStudioIDs.formUnion(studio.allIDs)
    }

    // MARK: Правка

    func location(of itemID: String) -> (group: Int, item: Int)? {
        for (g, group) in groups.enumerated() {
            if let i = group.items.firstIndex(where: { $0.id == itemID }) { return (g, i) }
        }
        return nil
    }

    mutating func moveGroup(id: String, by offset: Int) {
        guard let from = groups.firstIndex(where: { $0.id == id }) else { return }
        let to = from + offset
        guard groups.indices.contains(to) else { return }
        groups.swapAt(from, to)
    }

    /// Вверх/вниз внутри раздела; с края — в соседний раздел.
    mutating func moveItem(id: String, by offset: Int) {
        guard let (g, i) = location(of: id) else { return }
        let to = i + offset
        if groups[g].items.indices.contains(to) {
            groups[g].items.swapAt(i, to)
        } else if groups.indices.contains(g + offset) {
            let item = groups[g].items.remove(at: i)
            if offset < 0 { groups[g + offset].items.append(item) } else { groups[g + offset].items.insert(item, at: 0) }
        }
    }

    /// Перетаскивание раздела: встаёт на место `targetID`.
    mutating func moveGroup(id: String, onto targetID: String) {
        guard id != targetID, let from = groups.firstIndex(where: { $0.id == id }),
              let to = groups.firstIndex(where: { $0.id == targetID }) else { return }
        let group = groups.remove(at: from)
        groups.insert(group, at: to)
    }

    /// Перетаскивание строки на другую строку: встаёт на её место (в том числе в другом разделе).
    mutating func moveItem(id: String, onto targetID: String) {
        guard id != targetID, let (g, i) = location(of: id) else { return }
        let item = groups[g].items[i]
        guard let (tg, ti) = location(of: targetID) else { return }
        // Вниз внутри раздела — встаём после цели, иначе — перед ней
        let movingDown = g == tg && i < ti
        groups[g].items.remove(at: i)
        guard let (ng, ni) = location(of: targetID) else { return }
        groups[ng].items.insert(item, at: movingDown ? ni + 1 : ni)
    }

    /// Перетаскивание строки на заголовок раздела: в конец раздела.
    mutating func moveItem(id: String, toGroup groupID: String) {
        guard let (g, i) = location(of: id), let target = groups.firstIndex(where: { $0.id == groupID }) else { return }
        let item = groups[g].items.remove(at: i)
        groups[target].items.append(item)
    }

    /// Сохранить строку в раздел `groupID` (новую — в конец, существующую — на месте или в конец другого раздела).
    mutating func save(_ item: LinkEntry, in groupID: String) {
        guard let target = groups.firstIndex(where: { $0.id == groupID }) else { return }
        if let (g, i) = location(of: item.id) {
            if g == target { groups[g].items[i] = item; return }
            groups[g].items.remove(at: i)
        }
        groups[target].items.append(item)
    }

    mutating func deleteItem(id: String) {
        guard let (g, i) = location(of: id) else { return }
        groups[g].items.remove(at: i)
    }

    mutating func deleteGroup(id: String) {
        groups.removeAll { $0.id == id }
    }
}
