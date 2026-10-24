import SwiftUI

/// Главное окно: слева — выбор браузера, разделы и обновления; справа — выбранный раздел.
struct MainView: View {
    @EnvironmentObject var navigation: Navigation

    var body: some View {
        HStack(spacing: 0) {
            Sidebar()
                .frame(width: 240)
            Divider()
            detail
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(nsColor: .windowBackgroundColor))
        }
        .frame(minWidth: 820, minHeight: 560)
        .overlay(ToastOverlay())
    }

    @ViewBuilder
    private var detail: some View {
        switch navigation.section {
        case .replies: RepliesView()
        case .cashReport: CashReportView()
        case .links: LinksView()
        case .setup: SetupView()
        }
    }
}

// MARK: - Боковая панель

private struct Sidebar: View {
    @EnvironmentObject var navigation: Navigation
    @EnvironmentObject var browsers: BrowserService

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BrowserMenu()
                .padding(.horizontal, 12)
                .padding(.top, 14)
                .padding(.bottom, 8)

            List(selection: selection) {
                Section("Работа") {
                    row(.replies)
                    row(.cashReport)
                    row(.links)
                }
                Section("Настройка") {
                    row(.setup)
                }
            }
            .listStyle(.sidebar)

            Divider()
            UpdateFooter()
                .padding(12)
        }
        .background(Color(nsColor: .underPageBackgroundColor).opacity(0.35))
    }

    /// List(selection:) работает с опционалом — оборачиваем навигацию.
    private var selection: Binding<AppSection?> {
        Binding(get: { navigation.section },
                set: { if let s = $0 { navigation.section = s } })
    }

    private func row(_ section: AppSection) -> some View {
        HStack {
            Label(section.title, systemImage: section.systemImage)
            Spacer()
            if section == .setup && setupNeedsAttention {
                Circle().fill(Color.orange).frame(width: 7, height: 7)
            }
        }
        .tag(section)
    }

    private var setupNeedsAttention: Bool {
        guard let b = browsers.selected else { return true }
        return !browsers.hasExtension(b)
    }
}

/// Выбор браузера — вверху, всегда на виду.
private struct BrowserMenu: View {
    @EnvironmentObject var browsers: BrowserService
    @EnvironmentObject var navigation: Navigation

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Мой браузер")
                .font(.caption)
                .foregroundColor(.secondary)
            Menu {
                ForEach(BrowserKind.allCases) { b in
                    Button {
                        browsers.selected = b
                        navigation.section = .setup
                    } label: {
                        if browsers.selected == b {
                            Label(b.title, systemImage: "checkmark")
                        } else {
                            Text(b.title + (browsers.isInstalled(b) ? "" : " — не установлен"))
                        }
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    if let b = browsers.selected, let icon = browsers.icon(for: b) {
                        Image(nsImage: icon).resizable().frame(width: 18, height: 18)
                    } else {
                        Image(systemName: "globe")
                    }
                    Text(browsers.selected?.title ?? "Выберите браузер")
                }
            }
            .menuStyle(.borderlessButton)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 7).fill(Color(nsColor: .controlBackgroundColor)))
            .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(Color(nsColor: .separatorColor).opacity(0.6)))
        }
    }
}

/// Внизу боковой панели: версия, состояние и «Проверить обновления».
private struct UpdateFooter: View {
    @EnvironmentObject var updater: UpdaterService

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text("Studio 1826").font(.callout.weight(.semibold))
                Text(APP_VERSION).font(.caption).foregroundColor(.secondary)
                Spacer()
            }

            Text(statusLine)
                .font(.caption)
                .foregroundColor(updater.appLatestVersion != nil ? .orange : .secondary)
                .lineLimit(4)
                .fixedSize(horizontal: false, vertical: true)

            if updater.isInstallingApp {
                ProgressView(value: updater.installProgress)
            }

            if let latest = updater.appLatestVersion {
                Button {
                    updater.installApp()
                } label: {
                    Label("Установить \(latest)", systemImage: "arrow.down.app")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
                .disabled(updater.isInstallingApp)
            }

            Button {
                updater.checkForUpdates()
            } label: {
                HStack {
                    if updater.isChecking {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "arrow.triangle.2.circlepath")
                    }
                    Text(updater.isChecking ? "Проверяю…" : "Проверить обновления")
                }
                .frame(maxWidth: .infinity)
            }
            .controlSize(.large)
            .disabled(updater.isChecking || updater.isInstallingApp)
        }
    }

    private var statusLine: String {
        let main = updater.state(of: .main)
        var parts = [updater.appStatus]
        if let v = main.remoteVersion ?? main.localVersion {
            parts.append("Основной скрипт: \(v)")
        }
        if let last = updater.appLastCheck {
            parts.append("Проверено \(shortDateTime.string(from: last))")
        }
        return parts.joined(separator: "\n")
    }
}
