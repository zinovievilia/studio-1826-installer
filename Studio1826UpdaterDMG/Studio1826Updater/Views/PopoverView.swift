import SwiftUI

/// Окно под значком в строке меню: шапка с браузером, вкладки, раздел, внизу — обновления.
struct PopoverView: View {
    @EnvironmentObject var navigation: Navigation

    var body: some View {
        VStack(spacing: 0) {
            Header()
                .padding(.horizontal, 14)
                .padding(.top, 12)
                .padding(.bottom, 8)
            TabBar()
                .padding(.horizontal, 10)
                .padding(.bottom, 8)
            Divider()
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            Divider()
            UpdateFooter()
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
        }
        .frame(width: PopoverLayout.width, height: PopoverLayout.height)
        .overlay(ToastOverlay())
    }

    @ViewBuilder
    private var content: some View {
        switch navigation.section {
        case .replies: RepliesView()
        case .cashReport: CashReportView()
        case .links: LinksView()
        case .setup: SetupView()
        }
    }
}

// MARK: - Шапка

private struct Header: View {
    var body: some View {
        HStack(spacing: 8) {
            if let logo = NSImage(named: "MenuIcon") {
                Image(nsImage: logo)
                    .renderingMode(.template)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(height: 28)
            } else {
                Text("Studio 1826").font(.title2.weight(.semibold))
            }
            Spacer()
            BrowserMenu()
        }
    }
}

/// Выбор браузера — вверху, всегда на виду.
private struct BrowserMenu: View {
    @EnvironmentObject var browsers: BrowserService
    @EnvironmentObject var navigation: Navigation

    var body: some View {
        Menu {
            Section("Мой браузер") {
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
            }
        } label: {
            HStack(spacing: 6) {
                if let b = browsers.selected, let icon = browsers.icon(for: b) {
                    Image(nsImage: icon).resizable().frame(width: 16, height: 16)
                } else {
                    Image(systemName: "globe")
                }
                Text(browsers.selected?.shortTitle ?? "Выберите браузер")
            }
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
        .help("Браузер, в котором вы работаете с Bitrix24")
    }
}

// MARK: - Вкладки

private struct TabBar: View {
    @EnvironmentObject var navigation: Navigation
    @EnvironmentObject var browsers: BrowserService

    var body: some View {
        HStack(spacing: 4) {
            ForEach(AppSection.allCases) { section in
                tab(section)
            }
        }
    }

    private func tab(_ section: AppSection) -> some View {
        let selected = navigation.section == section
        return Button {
            navigation.section = section
        } label: {
            VStack(spacing: 3) {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: section.systemImage)
                        .font(.system(size: 15, weight: .medium))
                        .frame(width: 26, height: 20)
                    if section == .setup && setupNeedsAttention {
                        Circle().fill(Color.orange).frame(width: 7, height: 7)
                    }
                }
                Text(section.tabTitle).font(.caption.weight(selected ? .semibold : .regular))
            }
            .foregroundColor(selected ? .accentColor : .secondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 8).fill(selected ? Color.accentColor.opacity(0.12) : Color.clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(section.title)
    }

    private var setupNeedsAttention: Bool {
        guard let b = browsers.selected else { return true }
        return !browsers.hasExtension(b)
    }
}

// MARK: - Обновления внизу

private struct UpdateFooter: View {
    @EnvironmentObject var updater: UpdaterService

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if updater.isInstallingApp {
                ProgressView(value: updater.installProgress)
            }
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Studio 1826 · \(APP_VERSION)").font(.caption.weight(.medium))
                    Text(statusLine)
                        .font(.caption2)
                        .foregroundColor(updater.appLatestVersion != nil ? .orange : .secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 6)

                if let latest = updater.appLatestVersion {
                    Button("Установить \(latest)") { updater.installApp() }
                        .buttonStyle(.borderedProminent)
                        .tint(.orange)
                        .disabled(updater.isInstallingApp)
                } else {
                    Button {
                        updater.checkForUpdates()
                    } label: {
                        HStack(spacing: 5) {
                            if updater.isChecking {
                                ProgressView().controlSize(.small)
                            } else {
                                Image(systemName: "arrow.triangle.2.circlepath")
                            }
                            Text(updater.isChecking ? "Проверяю…" : "Проверить обновления")
                        }
                    }
                    .disabled(updater.isChecking || updater.isInstallingApp)
                }

                Button {
                    NSApp.terminate(nil)
                } label: {
                    Image(systemName: "power")
                }
                .buttonStyle(.borderless)
                .help("Выйти из Studio 1826")
            }
        }
    }

    private var statusLine: String {
        var parts = [updater.appStatus]
        let main = updater.state(of: .main)
        if let v = main.remoteVersion ?? main.localVersion { parts.append("скрипт \(v)") }
        return parts.joined(separator: " · ")
    }
}
