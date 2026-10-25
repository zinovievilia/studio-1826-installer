import Foundation

// MARK: - Отчёт для отладки
//
// Текстовый файл с состоянием приложения: версии, браузер, папка Userscripts, статусы скриптов,
// разрешения macOS и последние ошибки. Без личных данных: ни быстрых ответов, ни сумм кассы.

/// Одна запись журнала ошибок.
struct DebugEvent: Equatable {
    let date: Date
    /// Где случилось: «скрипт Основной», «проверка обновления» …
    let context: String
    let message: String
}

struct DebugReport {
    /// Почему сформирован: «вручную» или «ошибка: …»
    let trigger: String
    let date: Date
    /// Разделы: заголовок → строки «ключ: значение»
    var sections: [(title: String, lines: [String])] = []
    var events: [DebugEvent] = []

    static let fileExtension = "txt"

    /// «Studio1826-debug-2026-10-25_20-15-03.txt»
    static func fileName(for date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        return String(format: "Studio1826-debug-%04d-%02d-%02d_%02d-%02d-%02d.%@",
                      c.year ?? 0, c.month ?? 0, c.day ?? 0, c.hour ?? 0, c.minute ?? 0, c.second ?? 0,
                      fileExtension)
    }

    /// «25.10.2026 20:15:03»
    static func timestamp(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        return String(format: "%02d.%02d.%04d %02d:%02d:%02d",
                      c.day ?? 0, c.month ?? 0, c.year ?? 0, c.hour ?? 0, c.minute ?? 0, c.second ?? 0)
    }

    func text(calendar: Calendar = .current) -> String {
        var out = ["Studio 1826 — отчёт для отладки",
                   "Сформирован: \(Self.timestamp(date, calendar: calendar))",
                   "Причина: \(trigger)"]
        for section in sections {
            out.append("")
            out.append("== \(section.title) ==")
            out.append(contentsOf: section.lines)
        }
        out.append("")
        out.append("== Последние ошибки (новые сверху) ==")
        if events.isEmpty {
            out.append("нет")
        } else {
            for e in events.reversed() {
                out.append("\(Self.timestamp(e.date, calendar: calendar))  [\(e.context)]  \(e.message)")
            }
        }
        return out.joined(separator: "\n") + "\n"
    }
}

// MARK: - Правила автоотчётов

enum DebugPolicy {
    /// Сколько ошибок держать в памяти для отчёта
    static let maxEvents = 50
    /// Сколько автоотчётов хранить в папке
    static let maxStoredReports = 30
    /// Ошибка в одном и том же месте — не чаще одного автоотчёта за этот интервал
    static let autoReportInterval: TimeInterval = 10 * 60

    /// Нужен ли автоотчёт для ошибки в `context`, если прошлый для него был в `last`.
    static func shouldAutoReport(context: String, now: Date, last: [String: Date]) -> Bool {
        guard let prev = last[context] else { return true }
        return now.timeIntervalSince(prev) >= autoReportInterval
    }

    /// Добавить событие, оставив не больше `maxEvents` последних.
    static func appending(_ event: DebugEvent, to events: [DebugEvent]) -> [DebugEvent] {
        Array((events + [event]).suffix(maxEvents))
    }

    /// Какие файлы удалить, чтобы осталось `keep` самых новых. Дата в имени сортируется как строка.
    static func filesToPrune(_ names: [String], keep: Int = maxStoredReports) -> [String] {
        let reports = names
            .filter { $0.hasPrefix("Studio1826-debug-") && $0.hasSuffix(".\(DebugReport.fileExtension)") }
            .sorted()
        return Array(reports.dropLast(keep))
    }
}
