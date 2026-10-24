import SwiftUI

struct ContentView: View {
    @ObservedObject var updater: UpdaterService

    private let fmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ru_RU")
        f.dateFormat = "d MMM, HH:mm"
        return f
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {

            // ── Заголовок ────────────────────────────────────────────
            HStack(spacing: 10) {
                Image(systemName: "arrow.triangle.2.circlepath.circle.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.accentColor)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Studio 1826 Updater")
                        .font(.headline)
                    Text("Автообновление userscript")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 10)

            Divider()

            // ── Секция: Расширения ───────────────────────────────────
            SectionHeader(title: "Расширения", icon: "puzzlepiece")

            VStack(alignment: .leading, spacing: 6) {
                ForEach(ScriptManager.allCases) { manager in
                    HStack(spacing: 8) {
                        Image(systemName: updater.enabledManagers.contains(manager)
                              ? "checkmark.circle.fill" : "xmark.circle")
                            .foregroundColor(updater.enabledManagers.contains(manager) ? .green : .secondary)
                            .font(.system(size: 13))
                        Text(manager.rawValue)
                            .font(.caption)
                            .foregroundColor(updater.enabledManagers.contains(manager) ? .primary : .secondary)
                        Spacer()
                        if updater.enabledManagers.contains(manager) {
                            Text("найдено")
                                .font(.caption2)
                                .foregroundColor(.green)
                        } else {
                            Text("не найдено")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                if !updater.enabledManagers.contains(.tampermonkey) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Путь к файлу Tampermonkey (необязательно):")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        HStack(spacing: 6) {
                            TextField("/Users/…/studio1826.user.js",
                                      text: $updater.tampermonkeyPath)
                                .font(.caption)
                                .textFieldStyle(.roundedBorder)
                            Button(action: pickTampermonkeyFile) {
                                Image(systemName: "folder")
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                        Text("Tampermonkey хранит скрипты в разных папках в зависимости от браузера. Найдите файл вручную и укажите путь.")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.top, 4)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)

            Divider()

            // ── Секция: Userscript ───────────────────────────────────
            SectionHeader(title: "Userscript", icon: "doc.text")

            VStack(alignment: .leading, spacing: 6) {
                InfoRow(icon: "number",
                        label: "Версия",
                        value: updater.scriptVersion)

                InfoRow(icon: "clock",
                        label: "Проверка",
                        value: updater.scriptLastCheck.map { fmt.string(from: $0) } ?? "—")

                InfoRow(icon: "clock.arrow.circlepath",
                        label: "Следующая",
                        value: updater.nextCheck.map { fmt.string(from: $0) } ?? "—")

                InfoRow(icon: "checkmark.circle",
                        label: "Обновлено",
                        value: updater.scriptLastUpdate.map { fmt.string(from: $0) } ?? "—")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)

            StatusBar(loading: updater.isCheckingScript, message: updater.scriptStatus)

            Button(action: { updater.forceUpdateScript() }) {
                Label(updater.isCheckingScript ? "Проверяю…" : "Обновить скрипт сейчас",
                      systemImage: "arrow.down.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(updater.isCheckingScript || updater.enabledManagers.isEmpty)
            .padding(.horizontal, 16)
            .padding(.bottom, 10)

            Divider()

            // ── Секция: График обновлений ────────────────────────────
            SectionHeader(title: "График обновлений", icon: "calendar.badge.clock")

            VStack(alignment: .leading, spacing: 10) {

                // Режим
                VStack(alignment: .leading, spacing: 4) {
                    Text("Режим расписания")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Picker("", selection: $updater.scheduleMode) {
                        ForEach(ScheduleMode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                // Интервал (только если не ручной режим)
                if updater.scheduleMode != .manual {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Интервал проверки")
                            .font(.caption)
                            .foregroundColor(.secondary)

                        Picker("", selection: $updater.checkIntervalHours) {
                            ForEach(UpdaterService.availableIntervals, id: \.self) { h in
                                Text(h == 1 ? "1 час" : "\(h) ч").tag(h)
                            }
                        }
                        .pickerStyle(.menu)
                        .labelsHidden()
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }

                // Статус расписания
                HStack(spacing: 6) {
                    Circle()
                        .fill(scheduleStatusColor)
                        .frame(width: 7, height: 7)

                    Text(scheduleStatusText)
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Spacer()

                    if let next = updater.nextCheck,
                       updater.scheduleMode != .manual {
                        Text("след. \(fmt.string(from: next))")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)

            Divider()

            // ── Секция: Приложение ────────────────────────────────────
            SectionHeader(title: "Приложение", icon: "app.badge")

            VStack(alignment: .leading, spacing: 6) {
                InfoRow(icon: "number",
                        label: "Установлено",
                        value: "v\(updater.appVersion)")

                if let latest = updater.appLatestVersion {
                    InfoRow(icon: "arrow.up.circle.fill",
                            label: "Доступно",
                            value: "v\(latest)",
                            valueColor: .orange)
                }

                InfoRow(icon: "info.circle",
                        label: "Статус",
                        value: updater.appStatus,
                        valueColor: updater.appLatestVersion != nil ? .orange : .secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)

            if updater.isInstallingApp {
                ProgressView(value: updater.installProgress)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 6)
            }

            HStack(spacing: 8) {
                if updater.appLatestVersion != nil {
                    Button(action: { updater.installApp() }) {
                        Label(updater.isInstallingApp ? "Устанавливаю…" : "Установить обновление",
                              systemImage: "arrow.down.app")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                    .disabled(updater.isInstallingApp)
                } else {
                    Button(action: { updater.checkAppNow() }) {
                        Label(updater.isCheckingApp ? "Проверяю…" : "Проверить обновление",
                              systemImage: "magnifyingglass")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .disabled(updater.isCheckingApp)
                }
            }
            .controlSize(.regular)
            .padding(.horizontal, 16)
            .padding(.bottom, 10)

            Divider()

            // ── Футер ────────────────────────────────────────────────
            HStack {
                Spacer()
                Button(action: { NSApp.terminate(nil) }) {
                    Label("Выйти", systemImage: "power")
                        .font(.caption)
                }
                .buttonStyle(.plain)
                .foregroundColor(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .frame(width: 360)
    }

    // ── Цвет статуса расписания ──────────────────────────────
    private var scheduleStatusColor: Color {
        switch updater.scheduleMode {
        case .manual:
            return .secondary
        default:
            return updater.scheduleActive ? .green : .orange
        }
    }

    // ── Текст статуса расписания ─────────────────────────────
    private var scheduleStatusText: String {
        switch updater.scheduleMode {
        case .manual:
            return "Только кнопкой «Обновить скрипт сейчас»"
        case .schedule22:
            return updater.scheduleActive
                ? "Рабочий день по графику 2/2"
                : "Выходной по графику 2/2"
        case .everyDay:
            return "Проверка каждый день"
        case .weekdaysOnly:
            return updater.scheduleActive
                ? "Будний день"
                : "Выходной день — пропуск"
        }
    }

    // Открыть диалог выбора файла для Tampermonkey
    private func pickTampermonkeyFile() {
        let panel = NSOpenPanel()
        panel.title = "Выберите файл studio1826.user.js"
        panel.allowedContentTypes = [.init(filenameExtension: "js")!]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        if panel.runModal() == .OK, let url = panel.url {
            updater.tampermonkeyPath = url.path
        }
    }
}

// MARK: - SectionHeader

struct SectionHeader: View {
    let title: String
    let icon: String
    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.secondary)
            Text(title.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.secondary)
                .kerning(0.5)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 2)
    }
}

// MARK: - StatusBar

struct StatusBar: View {
    let loading: Bool
    let message: String
    var body: some View {
        HStack(spacing: 6) {
            if loading {
                ProgressView().scaleEffect(0.6).frame(width: 12, height: 12)
            } else {
                Circle().fill(dotColor).frame(width: 7, height: 7)
            }
            Text(message)
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(1)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 6)
    }
    private var dotColor: Color {
        let m = message.lowercased()
        if m.contains("ошибка") || m.contains("не найден") { return .red }
        if m.contains("обновлено") || m.contains("актуальн") { return .green }
        if m.contains("выходной") || m.contains("пропущено") { return .orange }
        return .secondary
    }
}

// MARK: - InfoRow

struct InfoRow: View {
    let icon: String
    let label: String
    let value: String
    var valueColor: Color = .primary
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .frame(width: 14)
                .foregroundColor(.secondary)
                .font(.system(size: 11))
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
                .frame(width: 100, alignment: .leading)
            Text(value)
                .font(.caption)
                .fontWeight(.medium)
                .foregroundColor(valueColor)
                .lineLimit(1)
            Spacer()
        }
    }
}
