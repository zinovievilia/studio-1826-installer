import Foundation

// Справочные данные студии: филиалы, ссылки, отчёт по кассе, скрипты студии для браузера.

enum StudioRepo {
    static let raw = "https://raw.githubusercontent.com/zinovievilia/studio-1826-installer/main"
}

// MARK: - Филиалы и ссылки

enum StudioBranch: String, CaseIterable, Identifiable, Codable {
    case paveletskaya = "pav"
    case serpukhovskaya = "serp"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .paveletskaya: return "Павелецкая"
        case .serpukhovskaya: return "Серпуховская"
        }
    }

    var links: [StudioLink] {
        let base = "https://1826.studio/\(rawValue)"
        return [
            StudioLink(id: "\(rawValue).halls", title: "Залы",
                       detail: "Фото и описание залов",
                       systemImage: "square.grid.2x2", url: URL(string: base)!),
            StudioLink(id: "\(rawValue).equipment", title: "Оборудование",
                       detail: "Свет, фоны, реквизит",
                       systemImage: "camera", url: URL(string: "\(base)/equipment")!),
            StudioLink(id: "\(rawValue).contacts", title: "Как пройти",
                       detail: "Адрес, схема прохода, контакты",
                       systemImage: "map", url: URL(string: "\(base)/contacts")!),
            StudioLink(id: "\(rawValue).payment", title: "Бронирование",
                       detail: "Онлайн-бронь и оплата",
                       systemImage: "calendar.badge.plus", url: URL(string: "\(base)/payment")!),
        ]
    }
}

struct StudioLink: Identifiable, Hashable {
    let id: String
    let title: String
    let detail: String
    let systemImage: String
    let url: URL
}

enum StudioLinks {
    static let salarySheet = URL(string: "https://docs.google.com/spreadsheets/d/1lf9CrUuzlzHZa4cH70gbzeBtW68uPvNArI__W-d-wy8/edit?gid=371799261#gid=371799261")!
    static let bitrix = URL(string: "https://1826studio.bitrix24.ru/")!
}

// MARK: - Отчёт по кассе

enum CashField: String, CaseIterable, Identifiable {
    case withdrawal, deposit, cash, drawer, register

    var id: String { rawValue }

    var title: String {
        switch self {
        case .withdrawal: return "Изъятие"
        case .deposit: return "Внесение"
        case .cash: return "Наличные"
        case .drawer: return "Денежный ящик"
        case .register: return "Касса"
        }
    }
}

struct CashReport {
    var date: Date
    var branch: StudioBranch
    var values: [CashField: Decimal]

    /// «23.10»
    static func dateString(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.day, .month], from: date)
        return String(format: "%02d.%02d", c.day ?? 0, c.month ?? 0)
    }

    /// Текст для копирования:
    /// 23.10
    /// Павелецкая
    ///
    /// Изъятие: 0
    /// Внесение: 2.000
    /// …
    func text(calendar: Calendar = .current) -> String {
        var lines = [Self.dateString(date, calendar: calendar), branch.title, ""]
        for field in CashField.allCases {
            lines.append("\(field.title): \(MoneyFormat.string(values[field] ?? 0))")
        }
        return lines.joined(separator: "\n")
    }
}

// MARK: - Скрипты студии для браузера (userscripts)

struct StudioUserscript: Identifiable, Hashable {
    let id: String
    let name: String
    let summary: String
    /// Имя файла в корне репозитория и в папке Userscripts. Не менять без необходимости:
    /// от него зависят уже установленные копии у всех сотрудников.
    let fileName: String

    var downloadURL: URL { URL(string: "\(StudioRepo.raw)/\(fileName)")! }

    static let main = StudioUserscript(
        id: "main",
        name: "Основной",
        summary: "Расчёт выплат администраторов, копирование оборудования, информация по залам и настройки интерфейса Bitrix24",
        fileName: "studio1826.user.js"
    )

    /// Новые скрипты добавляются сюда.
    static let all: [StudioUserscript] = [main]
}
