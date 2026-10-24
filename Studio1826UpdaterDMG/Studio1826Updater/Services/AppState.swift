import AppKit
import Combine

/// Разделы главного окна.
enum AppSection: String, CaseIterable, Identifiable {
    case replies, cashReport, links, setup

    var id: String { rawValue }

    var title: String {
        switch self {
        case .replies: return "Скрипты ответов"
        case .cashReport: return "Отчёт по кассе"
        case .links: return "Сайт и ссылки"
        case .setup: return "Браузер и расширения"
        }
    }

    /// Подпись на вкладке
    var tabTitle: String {
        switch self {
        case .replies: return "Скрипты"
        case .cashReport: return "Касса"
        case .links: return "Ссылки"
        case .setup: return "Настройка"
        }
    }

    var systemImage: String {
        switch self {
        case .replies: return "text.bubble"
        case .cashReport: return "banknote"
        case .links: return "link"
        case .setup: return "puzzlepiece.extension"
        }
    }
}

@MainActor
final class Navigation: ObservableObject {
    @Published var section: AppSection {
        didSet { UserDefaults.standard.set(section.rawValue, forKey: "lastSection") }
    }

    init(defaultSection: AppSection) {
        section = UserDefaults.standard.string(forKey: "lastSection").flatMap(AppSection.init(rawValue:)) ?? defaultSection
    }
}

/// Поиск скриптов в окне под значком. Общий, чтобы набранное при открытии окна сразу попадало в поиск.
@MainActor
final class ReplySearchState: ObservableObject {
    @Published var query = ""
    /// Увеличить — поле поиска заберёт фокус
    @Published var focusToken = 0

    func focus() { focusToken += 1 }
}

/// Короткое всплывающее подтверждение внизу окна («Скопировано»).
@MainActor
final class Toaster: ObservableObject {
    @Published private(set) var message: String?
    private var hideTask: Task<Void, Never>?

    func show(_ text: String) {
        message = text
        hideTask?.cancel()
        hideTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            guard !Task.isCancelled else { return }
            self?.message = nil
        }
    }
}

enum Clipboard {
    /// changeCount после нашего последнего копирования — чтобы не принять свой же текст за сообщение клиента.
    static var ownChangeCount = -1

    static func copy(_ text: String) {
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setString(text, forType: .string)
        ownChangeCount = pb.changeCount
    }
}

/// Поля отчёта по кассе. Живёт всё время работы приложения, чтобы введённое не терялось
/// при переходе между разделами.
@MainActor
final class CashReportModel: ObservableObject {
    @Published var date = Date()
    @Published var branch: StudioBranch {
        didSet { UserDefaults.standard.set(branch.rawValue, forKey: "cashReportBranch") }
    }
    @Published var inputs: [CashField: String] = [:]

    init() {
        branch = UserDefaults.standard.string(forKey: "cashReportBranch").flatMap(StudioBranch.init(rawValue:)) ?? .paveletskaya
    }

    /// nil — поле пустое.
    func result(_ field: CashField) -> Result<Decimal, Calculator.Failure>? {
        let raw = (inputs[field] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty { return nil }
        return Calculator.evaluate(raw)
    }

    /// Поля, которые пусты или с ошибкой.
    var problems: [CashField] {
        CashField.allCases.filter { field in
            if case .success = result(field) { return false }
            return true
        }
    }

    var report: CashReport {
        var values: [CashField: Decimal] = [:]
        for field in CashField.allCases {
            if case .success(let v) = result(field) { values[field] = v }
        }
        return CashReport(date: date, branch: branch, values: values)
    }

    func clear() {
        inputs = [:]
        date = Date()
    }
}
