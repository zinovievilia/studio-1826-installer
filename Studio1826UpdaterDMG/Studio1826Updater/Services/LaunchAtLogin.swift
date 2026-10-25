import Foundation
import ServiceManagement

/// Автозапуск при входе в систему (macOS 13+, «Объекты входа» в Системных настройках).
/// Работает только для приложения, лежащего на диске: запущенное прямо из образа DMG
/// или из «карантинной» папки не регистрируем — путь пропал бы после извлечения образа.
enum LaunchAtLogin {
    private static let askedKey = "launchAtLoginAsked"

    enum State: Equatable {
        case on
        case off
        /// Включено, но macOS ждёт подтверждения в Системных настройках
        case needsApproval
        /// Приложение запущено не из «Программ» (образ DMG и т. п.)
        case notInstalled
    }

    static var isRunningFromInstalledLocation: Bool {
        let path = Bundle.main.bundlePath
        return !path.hasPrefix("/Volumes/") && !path.contains("/AppTranslocation/")
    }

    static var state: State {
        guard isRunningFromInstalledLocation else { return .notInstalled }
        switch SMAppService.mainApp.status {
        case .enabled: return .on
        case .requiresApproval: return .needsApproval
        default: return .off
        }
    }

    /// Включить или выключить. Ошибку отдаём наружу — её показывают в интерфейсе.
    static func set(_ enabled: Bool) throws {
        guard isRunningFromInstalledLocation else { return }
        if enabled {
            if SMAppService.mainApp.status != .enabled { try SMAppService.mainApp.register() }
        } else {
            if SMAppService.mainApp.status != .notRegistered { try SMAppService.mainApp.unregister() }
        }
    }

    /// Первый запуск из «Программ»: включаем один раз. Дальше выбор сотрудника не трогаем,
    /// даже если он выключил автозапуск в настройках.
    static func enableOnFirstRun() {
        guard isRunningFromInstalledLocation, !UserDefaults.standard.bool(forKey: askedKey) else { return }
        UserDefaults.standard.set(true, forKey: askedKey)
        try? set(true)
    }

    static func openSystemSettings() {
        SMAppService.openSystemSettingsLoginItems()
    }
}
