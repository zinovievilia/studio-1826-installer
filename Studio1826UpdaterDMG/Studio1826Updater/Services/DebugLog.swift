import AppKit

/// Журнал ошибок и дебаг-отчёты.
/// Ошибка записывается в журнал и сразу собирает отчёт в папку Application Support/…/Debug
/// (не чаще раза в 30 минут на одну и ту же ошибку) и отправляет его в приватный репозиторий
/// дебага. Кнопка в «Если что-то не работает» кладёт свежий отчёт в «Загрузки» и тоже отправляет.
///
/// Ключа нет ни в git, ни в DMG (репозиторий публичный — из DMG его достал бы любой).
/// Ключ вставляется один раз на каждом Mac в «Если что-то не работает» и лежит в
/// ~/.studio1826/debug-token (доступ только у владельца). Не в Связке ключей: сборка подписана
/// ad-hoc, и после каждого обновления macOS спрашивала бы пароль к записи.
/// Нет ключа — отчёты просто остаются на Mac.
@MainActor
final class DebugLog {
    static let shared = DebugLog()

    /// Откуда брать состояние приложения для отчёта (задаёт AppDelegate).
    weak var browsers: BrowserService?
    weak var updater: UpdaterService?

    private(set) var events: [DebugEvent]
    private var lastAutoReport: [String: Date] = [:]
    private static let autoReportPause: TimeInterval = 30 * 60
    private static let keptReports = 20

    static var folder: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Studio1826Updater", isDirectory: true)
    }
    static var reportsFolder: URL { folder.appendingPathComponent("Debug", isDirectory: true) }
    private static var eventsFile: URL { folder.appendingPathComponent("debug-events.json") }

    private init() {
        let data = try? Data(contentsOf: Self.eventsFile)
        events = data.flatMap { try? Self.decoder.decode([DebugEvent].self, from: $0) } ?? []
    }

    // MARK: Журнал

    func record(_ area: String, _ message: String) {
        NSLog("Studio1826 [\(area)]: \(message)")
        events = DebugReport.trimmed(events + [DebugEvent(date: Date(), area: area, message: message)])
        saveEvents()

        let key = "\(area)|\(message)"
        if let last = lastAutoReport[key], Date().timeIntervalSince(last) < Self.autoReportPause { return }
        lastAutoReport[key] = Date()
        do {
            upload(try writeAutoReport(reason: "\(area): \(message)"))
        } catch {
            NSLog("Studio1826: дебаг не сохранился: \(error)")
        }
    }

    private func saveEvents() {
        do {
            try FileManager.default.createDirectory(at: Self.folder, withIntermediateDirectories: true)
            try Self.encoder.encode(events).write(to: Self.eventsFile, options: .atomic)
        } catch {
            NSLog("Studio1826: журнал ошибок не сохранился: \(error)")
        }
    }

    // MARK: Отчёты

    func makeReport(reason: String) -> DebugReport {
        DebugReport(created: Date(), reason: reason, sections: sections(), events: events)
    }

    /// Свежий отчёт в «Загрузки». Возвращает путь к файлу.
    @discardableResult
    func saveToDownloads() throws -> URL {
        let report = makeReport(reason: "сформирован вручную")
        let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        let url = downloads.appendingPathComponent(DebugReport.fileName(for: report.created))
        try report.text().write(to: url, atomically: true, encoding: .utf8)
        upload(report)
        return url
    }

    private func writeAutoReport(reason: String) throws -> DebugReport {
        let report = makeReport(reason: reason)
        let fm = FileManager.default
        try fm.createDirectory(at: Self.reportsFolder, withIntermediateDirectories: true)
        let url = Self.reportsFolder.appendingPathComponent(DebugReport.fileName(for: report.created))
        try report.text().write(to: url, atomically: true, encoding: .utf8)

        // Старые отчёты не копим
        let files = (try? fm.contentsOfDirectory(at: Self.reportsFolder, includingPropertiesForKeys: nil)) ?? []
        let old = files.filter { $0.pathExtension == "txt" }
            .sorted { $0.lastPathComponent > $1.lastPathComponent }
            .dropFirst(Self.keptReports)
        for file in old { try? fm.removeItem(at: file) }
        return report
    }

    // MARK: Отправка в репозиторий дебага

    static let debugRepo = "zinovievilia/studio-1826-debug"

    static var tokenFile: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".studio1826/debug-token")
    }

    private static var uploadToken: String? {
        let token = (try? String(contentsOf: tokenFile, encoding: .utf8))?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return token?.isEmpty == false ? token : nil
    }

    var canUpload: Bool { Self.uploadToken != nil }

    /// Сохранить ключ (пустая строка — удалить).
    func setUploadToken(_ token: String) throws {
        let fm = FileManager.default
        let value = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else {
            try? fm.removeItem(at: Self.tokenFile)
            return
        }
        let dir = Self.tokenFile.deletingLastPathComponent()
        try fm.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try value.write(to: Self.tokenFile, atomically: true, encoding: .utf8)
        try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: Self.tokenFile.path)
    }

    /// reports/<пользователь Mac>/<файл>. Ошибки отправки — только в системный лог,
    /// иначе неудачная отправка сама порождала бы новые отчёты.
    private func upload(_ report: DebugReport) {
        guard let token = Self.uploadToken else { return }
        let path = "reports/\(DebugReport.safePathComponent(NSUserName()))/\(DebugReport.fileName(for: report.created))"
        guard let url = URL(string: "https://api.github.com/repos/\(Self.debugRepo)/contents/\(path)") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: String] = [
            "message": "Дебаг \(APP_VERSION): \(report.reason)",
            "content": Data(report.text().utf8).base64EncodedString(),
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        let finalRequest = request
        Task.detached {
            do {
                let (_, response) = try await URLSession.shared.data(for: finalRequest)
                if let http = response as? HTTPURLResponse, http.statusCode != 201 {
                    NSLog("Studio1826: дебаг не отправился, GitHub ответил \(http.statusCode)")
                }
            } catch {
                NSLog("Studio1826: дебаг не отправился: \(error)")
            }
        }
    }

    // MARK: Состояние приложения

    private func sections() -> [DebugReport.Section] {
        let info = ProcessInfo.processInfo
        var result: [DebugReport.Section] = [
            .init(title: "Приложение", rows: [
                ("Версия", APP_VERSION),
                ("Путь", Bundle.main.bundlePath),
                ("macOS", info.operatingSystemVersionString),
                ("Модель Mac", Self.hardwareModel()),
                ("Автозапуск", "\(LaunchAtLogin.state)"),
                ("Вставка (Универсальный доступ)", QuickReplySettings.canPaste ? "разрешена" : "нет доступа"),
                ("Автовставка включена", QuickReplySettings.autoPaste ? "да" : "нет"),
            ]),
        ]

        if let b = browsers {
            let folder = BrowserService.userscriptsFolder
            let fm = FileManager.default
            let files = (try? fm.contentsOfDirectory(atPath: folder.path))?.sorted().joined(separator: ", ")
            result.append(.init(title: "Браузер", rows: [
                ("Выбран", b.selected?.title ?? "не выбран"),
                ("Установлены", BrowserKind.allCases.filter { b.appURLs[$0] != nil }.map(\.title).joined(separator: ", ")),
                ("Tampermonkey найден в", BrowserKind.allCases.filter { b.tampermonkeyFound.contains($0) }.map(\.title).joined(separator: ", ")),
                ("Приложение Userscripts", b.userscriptsAppURL?.path ?? "не найдено"),
                ("Папка Userscripts", folder.path),
                ("Папка есть", fm.fileExists(atPath: folder.path) ? "да" : "нет"),
                ("Запись в папку", fm.isWritableFile(atPath: folder.path) ? "разрешена" : "запрещена"),
                ("Файлы в папке", files ?? "не читается"),
            ]))
        }

        if let u = updater {
            var rows: [(String, String)] = [
                ("Статус обновления", u.appStatus),
                ("Последняя версия на GitHub", u.appLatestVersion ?? "—"),
                ("Последняя проверка", u.appLastCheck.map { DebugReport.timestamp($0) } ?? "—"),
                ("Расписание", "\(u.scheduleMode.rawValue), каждые \(u.checkIntervalHours) ч"),
            ]
            for script in StudioUserscript.all {
                let st = u.scripts[script.id]
                rows.append(("Скрипт «\(script.name)»",
                             "\(st?.status ?? "—"); у меня \(st?.localVersion ?? "—"), на GitHub \(st?.remoteVersion ?? "—")"
                             + (st?.hasError == true ? "; ОШИБКА" : "")))
            }
            result.append(.init(title: "Обновления", rows: rows))
        }
        return result
    }

    private static func hardwareModel() -> String {
        var size = 0
        sysctlbyname("hw.model", nil, &size, nil, 0)
        guard size > 0 else { return "?" }
        var buffer = [CChar](repeating: 0, count: size)
        sysctlbyname("hw.model", &buffer, &size, nil, 0)
        return String(cString: buffer)
    }

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
