import Foundation
import Combine
import AppKit

// MARK: - Constants

private let repoRaw       = StudioRepo.raw
private let appVersionURL = URL(string: "\(repoRaw)/app.version")!
private let appDMGURL     = URL(string: "\(repoRaw)/Studio1826Updater.dmg")!

/// Текущая версия приложения — должна совпадать с содержимым app.version в репо.
/// build.sh берёт версию отсюда: строка должна начинаться с `let APP_VERSION = "`.
let APP_VERSION = "4.4.1"

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

// MARK: - Состояние одного скрипта студии

struct ScriptState {
    /// Версия файла в папке Userscripts (только Safari)
    var localVersion: String?
    /// Последняя версия на GitHub
    var remoteVersion: String?
    var status: String = "Ещё не проверялся"
    var isBusy = false
    var lastCheck: Date?
    var lastUpdate: Date?
    var hasError = false
}

// MARK: - UpdaterService

@MainActor
class UpdaterService: ObservableObject {

    // --- Скрипты студии ---
    @Published var scripts: [String: ScriptState] = [:]

    // --- Приложение ---
    @Published var appVersion: String        = APP_VERSION
    @Published var appLatestVersion: String? = nil
    @Published var appStatus: String         = "Обновления ещё не проверялись"
    @Published var isCheckingApp: Bool       = false
    @Published var isInstallingApp: Bool     = false
    @Published var installProgress: Double   = 0
    @Published var appLastCheck: Date?

    // --- Расписание ---
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

    let browsers: BrowserService
    private var timer: Timer?
    private var mountedPath: String?

    var checkInterval: TimeInterval {
        TimeInterval(checkIntervalHours) * 3600
    }

    var isChecking: Bool {
        isCheckingApp || scripts.values.contains { $0.isBusy }
    }

    init(browsers: BrowserService) {
        self.browsers = browsers

        let savedMode = UserDefaults.standard.string(forKey: "scheduleMode") ?? ""
        scheduleMode = ScheduleMode(rawValue: savedMode) ?? .everyDay

        let savedInterval = UserDefaults.standard.integer(forKey: "checkIntervalHours")
        checkIntervalHours = Self.availableIntervals.contains(savedInterval) ? savedInterval : 6

        for script in StudioUserscript.all {
            scripts[script.id] = ScriptState()
        }
        refreshLocalVersions()
    }

    // MARK: Start

    func start() {
        scheduleTimer()
        Task {
            await checkScripts(trigger: .automatic)
            await checkApp()
        }
    }

    // MARK: Public

    /// Кнопка «Проверить обновления»: приложение + скрипты, вне графика.
    func checkForUpdates() {
        Task {
            await checkApp()
            await checkScripts(trigger: .manual)
        }
    }

    /// Установить или переустановить скрипт прямо сейчас.
    /// Safari — файл кладётся в папку Userscripts; Chromium — скрипт открывается в браузере,
    /// Tampermonkey показывает страницу установки.
    func install(_ script: StudioUserscript) {
        guard let browser = browsers.selected else { return }
        if browser == .safari {
            Task { await updateScript(script, force: true) }
        } else {
            browsers.open(script.downloadURL, in: browser)
        }
    }

    func checkAppNow() {
        Task { await checkApp() }
    }

    func installApp() {
        guard let v = appLatestVersion else { return }
        Task { await performAppInstall(remoteVersion: v) }
    }

    func state(of script: StudioUserscript) -> ScriptState {
        scripts[script.id] ?? ScriptState()
    }

    func refreshLocalVersions() {
        for script in StudioUserscript.all {
            let path = BrowserService.userscriptsFolder.appendingPathComponent(script.fileName)
            let text = (try? String(contentsOf: path, encoding: .utf8)) ?? ""
            scripts[script.id, default: ScriptState()].localVersion = UserscriptText.version(in: text)
        }
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
                await self.checkScripts(trigger: .automatic)
                await self.checkApp()
            }
        }
        RunLoop.main.add(timer!, forMode: .common)
        nextCheck = Date(timeIntervalSinceNow: checkInterval)
    }

    // MARK: Script update

    enum Trigger { case automatic, manual }

    private func checkScripts(trigger: Trigger) async {
        let workDay = scheduleMode.isActiveDay()
        scheduleActive = workDay || scheduleMode == .manual

        if scheduleMode != .manual {
            nextCheck = Date(timeIntervalSinceNow: checkInterval)
        }

        if trigger == .automatic && scheduleMode != .manual && !workDay {
            for script in StudioUserscript.all {
                scripts[script.id, default: ScriptState()].status = "Пропущено по расписанию «\(scheduleMode.rawValue)»"
            }
            return
        }

        for script in StudioUserscript.all {
            await updateScript(script, force: false)
        }
    }

    /// Скачать скрипт; в Safari — записать в папку Userscripts, если версия отличается (или force).
    private func updateScript(_ script: StudioUserscript, force: Bool) async {
        var st = scripts[script.id] ?? ScriptState()
        st.isBusy = true
        st.hasError = false
        st.status = "Скачиваю…"
        scripts[script.id] = st

        defer {
            scripts[script.id]?.isBusy = false
            refreshLocalVersions()
        }

        do {
            var request = URLRequest(url: script.downloadURL)
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            let (data, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode != 200 {
                throw Err("GitHub ответил \(http.statusCode)")
            }
            guard let text = String(data: data, encoding: .utf8), UserscriptText.looksLikeUserscript(text) else {
                throw Err("скачался не userscript — файл не тронут")
            }
            let remote = UserscriptText.version(in: text) ?? "?"
            scripts[script.id]?.remoteVersion = remote
            scripts[script.id]?.lastCheck = Date()

            guard browsers.selected == .safari else {
                // Tampermonkey обновляет скрипты сам по @updateURL
                scripts[script.id]?.status = "Последняя версия \(remote)"
                return
            }

            let folder = BrowserService.userscriptsFolder
            guard FileManager.default.fileExists(atPath: folder.path) else {
                throw Err("нет папки Userscripts — откройте приложение Userscripts один раз")
            }
            let path = folder.appendingPathComponent(script.fileName)
            let local = UserscriptText.version(in: (try? String(contentsOf: path, encoding: .utf8)) ?? "")

            if !force && local == remote {
                scripts[script.id]?.status = "Актуальная версия \(remote)"
                return
            }
            try data.write(to: path, options: .atomic)
            scripts[script.id]?.lastUpdate = Date()
            scripts[script.id]?.status = local == nil ? "Установлен \(remote)" : "Обновлён до \(remote)"
        } catch {
            scripts[script.id]?.hasError = true
            scripts[script.id]?.status = "Ошибка: \(error.localizedDescription)"
            DebugLog.shared.record("Скрипт «\(script.name)»", error.localizedDescription)
            scripts[script.id]?.lastCheck = Date()
        }
    }

    // MARK: App update — check

    private func checkApp() async {
        isCheckingApp = true
        appStatus = "Проверяю версию приложения…"
        defer {
            isCheckingApp = false
            appLastCheck = Date()
        }

        do {
            var request = URLRequest(url: appVersionURL)
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            let (data, response) = try await URLSession.shared.data(for: request)

            // GitHub отдаёт 404 если файл ещё не залит
            if let http = response as? HTTPURLResponse {
                if http.statusCode == 404 {
                    appStatus = "app.version не найден в репозитории"
                    appLatestVersion = nil
                    return
                }
                if http.statusCode != 200 {
                    appStatus = "Ошибка сервера: \(http.statusCode)"
                    DebugLog.shared.record("Проверка обновления", "app.version: GitHub ответил \(http.statusCode)")
                    appLatestVersion = nil
                    return
                }
            }

            guard let raw = String(data: data, encoding: .utf8) else {
                throw Err("Не удалось прочитать app.version")
            }
            let remote = raw.trimmingCharacters(in: .whitespacesAndNewlines)

            if AppVersion.isNewer(remote, than: APP_VERSION) {
                appLatestVersion = remote
                appStatus = "Доступна версия \(remote)"
            } else {
                appLatestVersion = nil
                appStatus = "Установлена последняя версия"
            }
        } catch {
            appStatus = "Ошибка проверки: \(error.localizedDescription)"
            DebugLog.shared.record("Проверка обновления", error.localizedDescription)
        }
    }

    // MARK: App update — install

    private func performAppInstall(remoteVersion: String) async {
        isInstallingApp = true
        installProgress = 0
        appStatus = "Скачиваю \(remoteVersion)…"

        let tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("s1826-upd-\(UUID().uuidString)")

        do {
            try FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)

            let dmgPath = tmp.appendingPathComponent("update.dmg")
            var request = URLRequest(url: appDMGURL)
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            let (dmgData, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode != 200 {
                throw Err("GitHub ответил \(http.statusCode) на запрос DMG")
            }
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
            // Пустой .app в DMG уже был — не ставим такой поверх рабочего
            let executable = bundle.appendingPathComponent("Contents/MacOS/Studio1826Updater")
            guard FileManager.default.isExecutableFile(atPath: executable.path) else {
                throw Err("в DMG повреждённое приложение — установка отменена")
            }

            let dest = URL(fileURLWithPath: "/Applications/Studio1826Updater.app")
            let fm = FileManager.default

            let staged = tmp.appendingPathComponent("Studio1826Updater.app")
            try fm.copyItem(at: bundle, to: staged)
            installProgress = 0.75

            if fm.fileExists(atPath: dest.path) {
                _ = try fm.replaceItemAt(dest, withItemAt: staged)
            } else {
                try fm.moveItem(at: staged, to: dest)
            }
            installProgress = 0.85

            mountedPath = nil
            try await run("/usr/bin/hdiutil", ["detach", mount.path, "-quiet"])
            try? fm.removeItem(at: tmp)

            installProgress = 1.0
            appStatus = "Установлена \(remoteVersion) — перезапуск…"

            try await Task.sleep(nanoseconds: 1_500_000_000)
            relaunch(appAt: dest)

        } catch {
            if let mp = mountedPath {
                try? await run("/usr/bin/hdiutil", ["detach", mp, "-force", "-quiet"])
                mountedPath = nil
            }
            try? FileManager.default.removeItem(at: tmp)
            appStatus = "Ошибка установки: \(error.localizedDescription)"
            DebugLog.shared.record("Установка обновления", error.localizedDescription)
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
}

private struct Err: LocalizedError {
    let errorDescription: String?
    init(_ msg: String) { errorDescription = msg }
}
