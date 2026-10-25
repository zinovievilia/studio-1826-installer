import Foundation
import ServiceManagement

/// Автозапуск при входе в систему (macOS 13+, «Объекты входа» в Системных настройках).
/// Включается сам, пока сотрудник не выключил его вручную. Работает только для приложения из «Программ»:
/// копия из образа DMG, «Загрузок» или папки сборки не регистрируется — путь пропал бы или указывал бы не туда.
enum LaunchAtLogin {
    /// Сотрудник сам выключил автозапуск — больше его не включаем
    private static let disabledByUserKey = "launchAtLoginDisabledByUser"

    enum State: Equatable {
        case on
        case off
        /// Включено, но macOS ждёт подтверждения в Системных настройках
        case needsApproval
        /// Приложение запущено не из «Программ»
        case notInstalled
    }

    static var isRunningFromApplications: Bool {
        let path = Bundle.main.bundlePath
        let home = NSHomeDirectory()
        return path.hasPrefix("/Applications/") || path.hasPrefix(home + "/Applications/")
    }

    static var state: State {
        guard isRunningFromApplications else { return .notInstalled }
        switch SMAppService.mainApp.status {
        case .enabled: return .on
        case .requiresApproval: return .needsApproval
        default: return .off
        }
    }

    /// Выбор сотрудника (переключатель, пункт меню). Ошибку отдаём наружу — её показывают в интерфейсе.
    static func set(_ enabled: Bool) throws {
        guard isRunningFromApplications else { return }
        UserDefaults.standard.set(!enabled, forKey: disabledByUserKey)
        try apply(enabled)
    }

    /// При каждом запуске из «Программ»: если автозапуск не включён и сотрудник его не выключал — включаем.
    static func enableUnlessDisabled() {
        guard isRunningFromApplications, !UserDefaults.standard.bool(forKey: disabledByUserKey) else { return }
        guard SMAppService.mainApp.status == .notRegistered else { return }
        try? apply(true)
    }

    private static func apply(_ enabled: Bool) throws {
        if enabled {
            if SMAppService.mainApp.status != .enabled { try SMAppService.mainApp.register() }
        } else {
            if SMAppService.mainApp.status != .notRegistered { try SMAppService.mainApp.unregister() }
        }
    }

    static func openSystemSettings() {
        SMAppService.openSystemSettingsLoginItems()
    }
}
