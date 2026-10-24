import Foundation
import Combine
import AppKit

// MARK: - Constants

private let repoRaw       = "https://raw.githubusercontent.com/zinovievilia/studio-1826-installer/main"
private let scriptURL     = URL(string: "\(repoRaw)/studio1826.user.js")!
private let appVersionURL = URL(string: "\(repoRaw)/app.version")!
private let appDMGURL     = URL(string: "\(repoRaw)/Studio1826Updater.dmg")!

/// Текущая версия приложения — должна совпадать с содержимым app.version в репо
let APP_VERSION = "3.0.0"

// MARK: - ScriptManager (пути к файлам расширений)

enum ScriptManager: String, CaseIterable, Identifiable {
    case userscripts  = "Userscripts"
    case tampermonkey = "Tampermonkey"

    var id: String { rawValue }

    /// Путь к файлу скрипта внутри расширения
    var scriptPath: String {
        let home = FileManager.default.homeDirectoryForCurrentUser
        switch self {
        case .userscripts:
            return home
                .appendingPathComponent("Library/Containers/com.userscripts.macos.Userscripts-Extension/Data/Documents/scripts/studio1826.user.js")
                .path
        case .tampermonkey:
            return home
                .appendingPathComponent("Library/Application Support/Google/Chrome/Default/Extensions")
                .appendingPathComponent("dhdgffkkebhmkfjojejmpbldmpobfkfo")
                .path + "/studio1826.user.js"
        }
    }

    /// Папка существует (расширение установлено)
    var isInstalled: Bool {
        switch self {
        case .userscripts:
            let dir = (scriptPath as NSString).deletingLastPathComponent
            return FileManager.default.fileExists(atPath: dir)
        case .tampermonkey:
            if let custom = UserDefaults.standard.string(forKey: "tampermonkeyPath"), !custom.isEmpty {
                return FileManager.default.fileExists(atPath: (custom as NSString).deletingLastPathComponent)
            }
            return false
        }
    }

    func resolvedPath() -> String {
        if self == .tampermonkey,
           let custom = UserDefaults.standard.string(forKey: "tampermonkeyPath"),
           !custom.isEmpty {
            return custom
        }
        return scriptPath
    }
}

// MARK: - ScheduleMode

enum ScheduleMode: String, CaseIterable, Identifiable {
    case schedule22   = "График 2/2"
    case everyDay     = "Каждый день"
    case weekdaysOnly = "Только будни"
    case manual       = "Вручную"

    var id: String { rawValue }

    func isActiveDay(date: Date = Date()) -> Bool {
        switch self {
        case .schedule22:
            let epoch = Calendar.current.date(
                from: DateComponents(year: 2024, month: 1, day: 1))!
            let days = Int(date.timeIntervalSince(epoch) / 86400)
            return ((days % 4) + 4) % 4 < 2

        case .everyDay:
            return true

        case .weekdaysOnly:
            let weekday = Calendar.current.component(.weekday, from: date)
            return weekday >= 2 && weekday <= 6

        case .manual:
            return false
        }
    }
}

// MARK: - UpdaterService

@MainActor
class UpdaterService: ObservableObject {

    // --- Script ---
    @Published var scriptVersion: String  = "—"
    @Published var scriptStatus: String   = "Ожидание…"
    @Published var scriptLastCheck: Date?
    @Published var scriptLastUpdate: Date?
    @Published var isCheckingScript: Bool = false

    @Published var enabledManagers: Set<ScriptManager> = []

    // --- App ---
    @Published var appVersion: String        = APP_VERSION
    @Published var appLatestVersion: String? = nil
    @Published var appStatus: String         = "—"
    @Published var isCheckingApp: Bool       = false
    @Published var isInstallingApp: Bool     = false
    @Published var installProgress: Double   = 0

    // --- Schedule ---
    @Published var scheduleActive: Bool = true
    @Published var nextCheck: Date?

    /// Режим расписания — сохраняется в UserDefaults
    @Published var scheduleMode: ScheduleMode {
        didSet {
            UserDefaults.standard.set(scheduleMode.rawValue, forKey: "scheduleMode")
            scheduleTimer()
        }
    }

    /// Интервал проверки в часах (1, 2, 3, 6, 12, 24)
    @Published var checkIntervalHours: Int {
        didSet {
            UserDefaults.standard.set(checkIntervalHours, forKey: "checkIntervalHours")
            scheduleTimer()
        }
    }

    static let availableIntervals: [Int] = [1, 2, 3, 6, 12, 24]

    // --- Tampermonkey custom path ---
    @Published var tampermonkeyPath: String {
        didSet {
            UserDefaults.standard.set(tampermonkeyPath, forKey: "tampermonkeyPath")
            detectManagers()
        }
    }

    private var timer: Timer?
    private var mountedPath: String?

    var checkInterval: TimeInterval {
        TimeInterval(checkIntervalHours) * 3600
    }

    init() {
        tampermonkeyPath = UserDefaults.standard.string(forKey: "tampermonkeyPath") ?? ""

        let savedMode = UserDefaults.standard.string(forKey: "scheduleMode") ?? ""
        scheduleMode = ScheduleMode(rawValue: savedMode) ?? .schedule22

        let savedInterval = UserDefaults.standard.integer(forKey: "checkIntervalHours")
        checkIntervalHours = Self.availableIntervals.contains(savedInterval) ? savedInterval : 6
    }

    // MARK: Start

    func start() {
        detectManagers()
        refreshScriptVersion()
        scheduleTimer()
        Task {
            await checkScript(force: false)
            await checkApp()
        }
    }

    // MARK: Public

    func forceUpdateScript() {
        Task { await checkScript(force: true) }
    }

    func checkAppNow() {
        Task { await checkApp() }
    }

    func installApp() {
        guard let v = appLatestVersion else { return }
        Task { await performAppInstall(remoteVersion: v) }
    }

    func detectManagers() {
        var found: Set<ScriptManager> = []
        for m in ScriptManager.allCases {
            if m.isInstalled { found.insert(m) }
        }
        enabledManagers = found
    }

    // MARK: Timer

    private func scheduleTimer() {
        timer?.invalidate()

        guard scheduleMode != .manual else {
            nextCheck = nil
            return
        }

        timer = Timer.scheduledTimer(
            withTimeInterval: checkInterval,
            repeats: true
        ) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                await self.checkScript(force: false)
                await self.checkApp()
            }
        }
        RunLoop.main.add(timer!, forMode: .common)
        nextCheck = Date(timeIntervalSinceNow: checkInterval)
    }

    // MARK: Script update

    private func checkScript(force: Bool) async {
        let workDay = scheduleMode.isActiveDay()
        scheduleActive = workDay || scheduleMode == .manual

        if scheduleMode != .manual {
            nextCheck = Date(timeIntervalSinceNow: checkInterval)
        }

        if !force && scheduleMode != .manual && !workDay {
            scriptStatus = "Пропущено по расписанию «\(scheduleMode.rawValue)»"
            return
        }

        if enabledManagers.isEmpty {
            scriptStatus = "Расширения не найдены — укажите путь в настройках"
            return
        }

        isCheckingScript = true
        scriptStatus = "Скачиваю скрипт…"

        do {
            let (data, _) = try await URLSession.shared.data(from: scriptURL)
            guard let text = String(data: data, encoding: .utf8) else {
                throw Err("Не удалось декодировать файл")
            }

            let remote = parseVersion(text) ?? "?"
            var updatedAny = false
            var skippedAny = false
            var errors: [String] = []

            for manager in ScriptManager.allCases where enabledManagers.contains(manager) {
                let path = manager.resolvedPath()

                if !force {
                    let local = parseVersion((try? String(contentsOfFile: path, encoding: .utf8)) ?? "")
                    if local == remote {
                        skippedAny = true
                        continue
                    }
                }

                do {
                    let dir = (path as NSString).deletingLastPathComponent
                    try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
                    try data.write(to: URL(fileURLWithPath: path), options: .atomic)
                    updatedAny = true
                } catch {
                    errors.append("\(manager.rawValue): \(error.localizedDescription)")
                }
            }

            scriptLastCheck = Date()

            if !errors.isEmpty {
                scriptStatus = "Ошибка записи: \(errors.joined(separator: "; "))"
            } else if updatedAny {
                scriptLastUpdate = Date()
                scriptStatus = "Обновлено до \(remote)"
            } else if skippedAny {
                scriptStatus = "Актуальная версия \(remote)"
            }

        } catch {
            scriptStatus = "Ошибка: \(error.localizedDescription)"
            scriptLastCheck = Date()
        }

        isCheckingScript = false
        refreshScriptVersion()
    }

    // MARK: App update — check

    private func checkApp() async {
        isCheckingApp = true
        appStatus = "Проверяю версию приложения…"

        do {
            var request = URLRequest(url: appVersionURL)
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            let (data, response) = try await URLSession.shared.data(for: request)

            // GitHub отдаёт 404 если файл ещё не залит
            if let http = response as? HTTPURLResponse {
                if http.statusCode == 404 {
                    appStatus = "app.version не найден в репозитории"
                    appLatestVersion = nil
                    isCheckingApp = false
                    return
                }
                if http.statusCode != 200 {
                    appStatus = "Ошибка сервера: \(http.statusCode)"
                    appLatestVersion = nil
                    isCheckingApp = false
                    return
                }
            }

            guard let raw = String(data: data, encoding: .utf8) else {
                throw Err("Не удалось прочитать app.version")
            }
            let remote = raw.trimmingCharacters(in: .whitespacesAndNewlines)

            if remote != APP_VERSION {
                appLatestVersion = remote
                appStatus = "Доступна v\(remote)"
            } else {
                appLatestVersion = nil
                appStatus = "v\(APP_VERSION) — актуальная"
            }
        } catch {
            appStatus = "Ошибка проверки: \(error.localizedDescription)"
        }

        isCheckingApp = false
    }

    // MARK: App update — install

    private func performAppInstall(remoteVersion: String) async {
        isInstallingApp = true
        installProgress = 0
        appStatus = "Скачиваю v\(remoteVersion)…"

        let tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("s1826-upd-\(UUID().uuidString)")

        do {
            try FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)

            let dmgPath = tmp.appendingPathComponent("update.dmg")
            let (dmgData, _) = try await URLSession.shared.data(from: appDMGURL)
            try dmgData.write(to: dmgPath)
            installProgress = 0.35
            appStatus = "Монтирую образ…"

            let mount = tmp.appendingPathComponent("mnt")
            try FileManager.default.createDirectory(at: mount, withIntermediateDirectories: true)
            try await run("/usr/bin/hdiutil", ["attach", dmgPath.path, "-mountpoint", mount.path, "-nobrowse", "-quiet"])
            mountedPath = mount.path
            installProgress = 0.55
            appStatus = "Устанавливаю…"

            let contents = try FileManager.default.contentsOfDirectory(at: mount, includingPropertiesForKeys: nil)
            guard let bundle = contents.first(where: { $0.pathExtension == "app" }) else {
                throw Err(".app не найден в DMG")
            }

            let dest = URL(fileURLWithPath: "/Applications/Studio1826Updater.app")
            let fm = FileManager.default

            let staged = tmp.appendingPathComponent("Studio1826Updater.app")
            try fm.copyItem(at: bundle, to: staged)
            installProgress = 0.75

            _ = try fm.replaceItemAt(dest, withItemAt: staged)
            installProgress = 0.85

            mountedPath = nil
            try await run("/usr/bin/hdiutil", ["detach", mount.path, "-quiet"])
            try? fm.removeItem(at: tmp)

            installProgress = 1.0
            appStatus = "Установлено v\(remoteVersion) — перезапуск…"

            try await Task.sleep(nanoseconds: 1_500_000_000)
            relaunch(appAt: dest)

        } catch {
            if let mp = mountedPath {
                try? await run("/usr/bin/hdiutil", ["detach", mp, "-force", "-quiet"])
                mountedPath = nil
            }
            try? FileManager.default.removeItem(at: tmp)
            appStatus = "Ошибка установки: \(error.localizedDescription)"
            isInstallingApp = false
        }
    }

    private func relaunch(appAt url: URL) {
        let helper = Process()
        helper.executableURL = URL(fileURLWithPath: "/bin/sh")
        helper.arguments = ["-c", "sleep 1.5; /usr/bin/open \"$1\"", "sh", url.path]
        try? helper.run()
        NSApp.terminate(nil)
    }

    // MARK: Helpers

    private func run(_ exe: String, _ args: [String]) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            do {
                let t = Process()
                t.executableURL = URL(fileURLWithPath: exe)
                t.arguments = args
                t.terminationHandler = { p in
                    if p.terminationStatus == 0 { cont.resume() }
                    else { cont.resume(throwing: Err("\(exe) вернул \(p.terminationStatus)")) }
                }
                try t.run()
            } catch { cont.resume(throwing: error) }
        }
    }

    private func parseVersion(_ text: String) -> String? {
        for pattern in [#"@version\s+([\d.]+)"#, #"VERSION\s*=\s*'([\d.]+)'"#] {
            if let m = text.range(of: pattern, options: .regularExpression),
               let v = text[m].firstMatch(of: /[\d.]+/) {
                return String(v.output)
            }
        }
        return nil
    }

    private func refreshScriptVersion() {
        for m in ScriptManager.allCases where enabledManagers.contains(m) {
            let text = (try? String(contentsOfFile: m.resolvedPath(), encoding: .utf8)) ?? ""
            if let v = parseVersion(text) {
                scriptVersion = v
                return
            }
        }
        scriptVersion = enabledManagers.isEmpty ? "расширение не найдено" : "не установлен"
    }
}

private struct Err: LocalizedError {
    let errorDescription: String?
    init(_ msg: String) { errorDescription = msg }
}
