import Foundation

/// Одна запись журнала: что пошло не так и где.
struct DebugEvent: Codable, Equatable {
    var date: Date
    /// Раздел приложения: «Скрипты», «Обновление приложения», «Вставка»…
    var area: String
    var message: String
}

/// Отчёт для разбора проблем: состояние приложения + последние ошибки.
/// Тексты скриптов ответов и суммы кассы сюда не попадают — только техническое состояние.
struct DebugReport {
    struct Section {
        var title: String
        var rows: [(String, String)]
    }

    var created: Date
    /// Почему сформирован: «вручную» или текст ошибки, из-за которой он собрался сам.
    var reason: String
    var sections: [Section]
    var events: [DebugEvent]

    /// Сколько последних записей журнала хранить и класть в отчёт.
    static let eventLimit = 100

    static func trimmed(_ events: [DebugEvent], limit: Int = eventLimit) -> [DebugEvent] {
        events.count > limit ? Array(events.suffix(limit)) : events
    }

    static func timestamp(_ date: Date, timeZone: TimeZone = .current) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f.string(from: date)
    }

    /// Имя файла без двоеточий и пробелов: Studio1826-debug-2026-10-25_17-13-38.txt
    static func fileName(for date: Date, timeZone: TimeZone = .current) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "yyyy-MM-dd_HH-mm-ss"
        return "Studio1826-debug-\(f.string(from: date)).txt"
    }

    func text(timeZone: TimeZone = .current) -> String {
        var lines: [String] = [
            "Studio 1826 — дебаг",
            "Сформирован: \(Self.timestamp(created, timeZone: timeZone))",
            "Причина: \(reason)",
        ]
        for section in sections {
            lines.append("")
            lines.append("## \(section.title)")
            for (key, value) in section.rows {
                lines.append("\(key): \(value)")
            }
        }
        lines.append("")
        lines.append("## Последние ошибки (\(events.count))")
        if events.isEmpty {
            lines.append("нет")
        } else {
            for e in events.reversed() {
                lines.append("\(Self.timestamp(e.date, timeZone: timeZone)) [\(e.area)] \(e.message)")
            }
        }
        return lines.joined(separator: "\n") + "\n"
    }
}
