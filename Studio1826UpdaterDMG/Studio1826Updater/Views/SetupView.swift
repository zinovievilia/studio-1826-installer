import SwiftUI
import AppKit

/// «Браузер и расширения»: выбор браузера и пошаговая настройка с проверками.
struct SetupView: View {
    @EnvironmentObject var browsers: BrowserService
    @EnvironmentObject var updater: UpdaterService
    @EnvironmentObject var toaster: Toaster

    @State private var expanded: Set<String> = []
    @State private var showAutoUpdate = false
    @State private var showHelp = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PageHeader(title: "Браузер и расширения",
                           subtitle: "Выберите браузер, в котором работаете с Bitrix24, и пройдите шаги по порядку. Что можно проверить — приложение проверит само.",
                           systemImage: "puzzlepiece.extension")

                BrowserCards()

                if let browser = browsers.selected {
                    let steps = self.steps(for: browser)
                    ProgressSummary(done: steps.filter(\.isDone).count, total: steps.count)

                    ForEach(Array(steps.enumerated()), id: \.element.id) { pair in
                        stepCard(pair.element, number: pair.offset + 1, browser: browser)
                    }

                    if browser == .safari {
                        autoUpdateCard
                    }
                    helpCard(browser)
                } else {
                    Card {
                        Hint(text: "Выберите браузер выше — после этого здесь появятся шаги установки расширения и скриптов студии.",
                             systemImage: "arrow.up")
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 800, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .onAppear {
            refreshAll()
            resetExpansion()
        }
        .onChange(of: browsers.selected) { _ in resetExpansion() }
        // Вернулись в приложение после установки — сразу перепроверяем
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            refreshAll()
        }
    }

    private func refreshAll() {
        browsers.refresh()
        updater.refreshLocalVersions()
    }

    // MARK: Шаги

    private enum StepKind {
        case safariApp, safariOpen, safariEnable, browserApp, tampermonkey, allowScripts, scripts, check
    }

    private struct SetupStep: Identifiable {
        let id: String
        let kind: StepKind
        let title: String
        let subtitle: String
        let isDone: Bool
    }

    private func steps(for b: BrowserKind) -> [SetupStep] {
        let k = b.rawValue
        if b == .safari {
            return [
                SetupStep(id: "safari.app", kind: .safariApp,
                          title: "Установить Userscripts",
                          subtitle: "Бесплатное расширение из App Store — через него в Safari работают скрипты студии",
                          isDone: browsers.userscriptsAppURL != nil),
                SetupStep(id: "safari.open", kind: .safariOpen,
                          title: "Запустить Userscripts один раз",
                          subtitle: "Расширение создаст папку, куда приложение кладёт скрипты",
                          isDone: browsers.userscriptsFolderExists),
                SetupStep(id: "safari.enable", kind: .safariEnable,
                          title: "Включить расширение в Safari",
                          subtitle: "Галочка в настройках Safari и разрешение для Bitrix24",
                          isDone: browsers.isConfirmed("safari.enable")),
                SetupStep(id: "safari.scripts", kind: .scripts,
                          title: "Установить скрипты студии",
                          subtitle: "Приложение положит их в Userscripts и будет обновлять само",
                          isDone: StudioUserscript.all.allSatisfy { updater.state(of: $0).localVersion != nil }),
                SetupStep(id: "safari.check", kind: .check,
                          title: "Проверить в Bitrix24",
                          subtitle: "Открыть Bitrix24 и убедиться, что скрипт работает",
                          isDone: browsers.isConfirmed("safari.check")),
            ]
        }
        return [
            SetupStep(id: "\(k).browser", kind: .browserApp,
                      title: "Установить \(b.title)",
                      subtitle: browsers.isInstalled(b) ? "Найден на этом Mac" : "Браузер не найден на этом Mac",
                      isDone: browsers.isInstalled(b)),
            SetupStep(id: "\(k).extension", kind: .tampermonkey,
                      title: "Установить Tampermonkey",
                      subtitle: "Расширение, через которое в браузере работают скрипты студии",
                      isDone: browsers.hasExtension(b)),
            SetupStep(id: "\(k).allow", kind: .allowScripts,
                      title: "Разрешить пользовательские скрипты",
                      subtitle: "Один переключатель в настройках расширения",
                      isDone: browsers.isConfirmed("\(k).allow")),
            SetupStep(id: "\(k).scripts", kind: .scripts,
                      title: "Установить скрипты студии",
                      subtitle: "Скрипт откроется в браузере, Tampermonkey предложит его установить",
                      isDone: StudioUserscript.all.allSatisfy { browsers.isConfirmed(scriptKey($0, b)) }),
            SetupStep(id: "\(k).check", kind: .check,
                      title: "Проверить в Bitrix24",
                      subtitle: "Открыть Bitrix24 и убедиться, что скрипт работает",
                      isDone: browsers.isConfirmed("\(k).check")),
        ]
    }

    private func scriptKey(_ script: StudioUserscript, _ b: BrowserKind) -> String {
        "\(b.rawValue).script.\(script.id)"
    }

    /// Раскрыт первый невыполненный шаг.
    private func resetExpansion() {
        guard let b = browsers.selected else { expanded = []; return }
        if let first = steps(for: b).first(where: { !$0.isDone }) {
            expanded = [first.id]
        } else {
            expanded = []
        }
    }

    private func isExpanded(_ id: String) -> Binding<Bool> {
        Binding(get: { expanded.contains(id) },
                set: { open in if open { expanded.insert(id) } else { expanded.remove(id) } })
    }

    private func confirmation(_ key: String) -> Binding<Bool> {
        Binding(get: { browsers.isConfirmed(key) },
                set: { browsers.setConfirmed(key, $0) })
    }

    private func stepCard(_ step: SetupStep, number: Int, browser: BrowserKind) -> some View {
        Collapsible(isExpanded: isExpanded(step.id)) {
            HStack(spacing: 12) {
                StepMarker(number: number, done: step.isDone)
                VStack(alignment: .leading, spacing: 2) {
                    Text(step.title).font(.headline)
                    Text(step.subtitle)
                        .font(.callout)
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        } content: {
            stepContent(step, browser: browser)
                .padding(.leading, 40)
        }
    }

    @ViewBuilder
    private func stepContent(_ step: SetupStep, browser b: BrowserKind) -> some View {
        switch step.kind {
        case .safariApp:
            VStack(alignment: .leading, spacing: 12) {
                Instructions(steps: [
                    "Нажмите **Открыть в App Store**.",
                    "В App Store нажмите **Получить**, затем **Установить** (может попросить пароль Apple ID).",
                    "Вернитесь в это окно — шаг отметится сам.",
                ])
                HStack {
                    Button("Открыть в App Store") { browsers.openExtensionStore(for: .safari) }
                        .buttonStyle(.borderedProminent)
                    Button("Проверить снова") { refreshAll() }
                }
                Hint(text: "Поставить приложение из App Store за вас macOS не позволяет — кнопку «Получить» нужно нажать самому.")
            }

        case .safariOpen:
            VStack(alignment: .leading, spacing: 12) {
                Instructions(steps: [
                    "Нажмите **Запустить Userscripts**.",
                    "В открывшемся окне Userscripts ничего менять не нужно — его можно закрыть.",
                    "Вернитесь сюда — шаг отметится сам.",
                ])
                HStack {
                    Button("Запустить Userscripts") { browsers.launchUserscriptsApp() }
                        .buttonStyle(.borderedProminent)
                        .disabled(browsers.userscriptsAppURL == nil)
                    Button("Проверить снова") { refreshAll() }
                }
                if browsers.userscriptsAppURL == nil {
                    Hint(text: "Сначала выполните шаг 1 — установите Userscripts.", systemImage: "exclamationmark.triangle")
                }
            }

        case .safariEnable:
            VStack(alignment: .leading, spacing: 12) {
                Instructions(steps: [
                    "Нажмите **Открыть Safari**.",
                    "В меню **Safari → Настройки…** (⌘,) откройте вкладку **Расширения**.",
                    "Поставьте галочку у **Userscripts**.",
                    "Нажмите **Открыть Bitrix24**, затем на значок **Userscripts** слева от адресной строки и выберите **Всегда разрешать на этом веб-сайте**.",
                ])
                HStack {
                    Button("Открыть Safari") { browsers.launch(.safari) }
                    Button("Открыть Bitrix24") { browsers.open(StudioLinks.bitrix, in: .safari) }
                }
                Toggle("Готово — расширение включено", isOn: confirmation("safari.enable"))
                Hint(text: "Включено ли расширение в Safari, приложение проверить не может — отметьте галочку сами.")
            }

        case .browserApp:
            VStack(alignment: .leading, spacing: 12) {
                if browsers.isInstalled(b) {
                    Label("\(b.title) установлен.", systemImage: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Button("Открыть \(b.shortTitle)") { browsers.launch(b) }
                } else {
                    Instructions(steps: [
                        "Нажмите **Скачать \(b.title)** — откроется официальный сайт.",
                        "Скачайте и откройте установщик, перетащите браузер в папку **Программы**.",
                        "Вернитесь в это окно — шаг отметится сам.",
                    ])
                    HStack {
                        if let url = b.downloadPage {
                            Button("Скачать \(b.title)") { NSWorkspace.shared.open(url) }
                                .buttonStyle(.borderedProminent)
                        }
                        Button("Проверить снова") { refreshAll() }
                    }
                }
            }

        case .tampermonkey:
            VStack(alignment: .leading, spacing: 12) {
                Instructions(steps: [
                    "Нажмите **Открыть Tampermonkey в \(b.shortTitle)** — откроется страница расширения в магазине.",
                    b == .opera
                        ? "Нажмите **Добавить в Opera**."
                        : "Нажмите **Установить**, затем **Установить расширение**.",
                    "Вернитесь в это окно — приложение найдёт расширение само.",
                ])
                HStack {
                    Button("Открыть Tampermonkey в \(b.shortTitle)") { browsers.openExtensionStore(for: b) }
                        .buttonStyle(.borderedProminent)
                        .disabled(!browsers.isInstalled(b))
                    Button("Проверить снова") { refreshAll() }
                }
                if browsers.tampermonkeyFound.contains(b) {
                    Label("Tampermonkey найден в \(b.shortTitle).", systemImage: "checkmark.circle.fill")
                        .foregroundColor(.green)
                } else {
                    Toggle("Tampermonkey уже установлен, но приложение его не видит",
                           isOn: confirmation("\(b.rawValue).extension"))
                }
                Hint(text: "Установить расширение за вас браузер не позволяет — подтвердить установку нужно самому.")
            }

        case .allowScripts:
            VStack(alignment: .leading, spacing: 12) {
                Instructions(steps: allowSteps(b))
                HStack {
                    if let address = b.extensionsPageAddress {
                        Button("Скопировать адрес \(address)") {
                            Clipboard.copy(address)
                            toaster.show("Адрес скопирован — вставьте его в адресную строку")
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    Button("Открыть \(b.shortTitle)") { browsers.launch(b) }
                }
                Toggle("Готово — скрипты разрешены", isOn: confirmation("\(b.rawValue).allow"))
                Hint(text: "Страницу расширений браузер не даёт открыть из другого приложения, поэтому адрес нужно вставить вручную.")
            }

        case .scripts:
            VStack(alignment: .leading, spacing: 12) {
                if b == .safari {
                    if !browsers.userscriptsFolderExists {
                        Hint(text: "Сначала выполните шаг 2 — запустите Userscripts один раз.", systemImage: "exclamationmark.triangle")
                    }
                    ForEach(StudioUserscript.all) { script in SafariScriptRow(script: script) }
                    Hint(text: "Дальше приложение обновляет скрипты само по расписанию (настройка ниже). Если macOS спросит, можно ли **получить доступ к данным других приложений**, — нажмите **Разрешить**. После установки обновите страницу Bitrix24 (⌘R).")
                } else {
                    Instructions(steps: [
                        "Нажмите **Установить в Tampermonkey** — в \(b.shortTitle) откроется страница установки.",
                        "Нажмите там **Установить** (если скрипт уже стоит — **Обновить** или **Переустановить**).",
                        "Отметьте галочку **Установлен** здесь.",
                    ])
                    ForEach(StudioUserscript.all) { script in
                        ChromiumScriptRow(script: script, browser: b, installed: confirmation(scriptKey(script, b)))
                    }
                    Hint(text: "Дальше Tampermonkey сам проверяет обновления скриптов. Чтобы получить новую версию сразу, нажмите **Установить в Tampermonkey** ещё раз.")
                }
            }

        case .check:
            VStack(alignment: .leading, spacing: 12) {
                Instructions(steps: [
                    "Нажмите **Открыть Bitrix24** и войдите, если попросит.",
                    "Значок \(b.extensionName) рядом с адресной строкой должен показывать, что скрипт активен на странице.",
                    "Откройте любую бронь — должны появиться элементы Studio 1826 (расчёт администраторов, копирование оборудования).",
                ])
                Button("Открыть Bitrix24") { browsers.open(StudioLinks.bitrix, in: b) }
                    .buttonStyle(.borderedProminent)
                Toggle("Всё работает", isOn: confirmation("\(b.rawValue).check"))
            }
        }
    }

    private func allowSteps(_ b: BrowserKind) -> [String] {
        let address = b.extensionsPageAddress ?? ""
        switch b {
        case .chrome:
            return [
                "Нажмите **Скопировать адрес**, вставьте его в адресную строку Chrome и нажмите Enter.",
                "У **Tampermonkey** нажмите **Сведения**.",
                "Включите **Разрешить пользовательские скрипты**. Если такого переключателя нет — включите **Режим разработчика** в правом верхнем углу страницы расширений.",
                "Закрепите значок: пазл справа от адресной строки → булавка рядом с Tampermonkey.",
            ]
        case .yandex:
            return [
                "Нажмите **Скопировать адрес** (\(address)), вставьте его в адресную строку Яндекс Браузера и нажмите Enter.",
                "Найдите **Tampermonkey** в списке и проверьте, что он включён.",
                "Если Tampermonkey просит разрешить пользовательские скрипты — нажмите у него **Подробнее** и включите **Разрешить пользовательские скрипты**.",
            ]
        case .opera:
            return [
                "Нажмите **Скопировать адрес**, вставьте его в адресную строку Opera и нажмите Enter.",
                "Проверьте, что **Tampermonkey** включён.",
                "Нажмите у него **Подробнее** и включите **Разрешить пользовательские скрипты**, если такой переключатель есть.",
                "Закрепите значок через кнопку с кубиком справа от адресной строки.",
            ]
        case .safari:
            return []
        }
    }

    // MARK: Автообновление (Safari)

    private var autoUpdateCard: some View {
        Collapsible(isExpanded: $showAutoUpdate) {
            HStack(spacing: 12) {
                Image(systemName: "calendar.badge.clock")
                    .font(.system(size: 16))
                    .frame(width: 28)
                    .foregroundColor(.accentColor)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Автообновление скриптов").font(.headline)
                    Text("\(updater.scheduleMode.rawValue)"
                         + (updater.scheduleMode == .manual ? "" : ", каждые \(updater.checkIntervalHours) ч"))
                        .font(.callout)
                        .foregroundColor(.secondary)
                }
            }
        } content: {
            VStack(alignment: .leading, spacing: 12) {
                Picker("Когда проверять", selection: $updater.scheduleMode) {
                    ForEach(ScheduleMode.allCases) { mode in Text(mode.rawValue).tag(mode) }
                }
                .frame(maxWidth: 360)

                if updater.scheduleMode != .manual {
                    Picker("Как часто", selection: $updater.checkIntervalHours) {
                        ForEach(UpdaterService.availableIntervals, id: \.self) { h in
                            Text(h == 1 ? "Каждый час" : "Каждые \(h) ч").tag(h)
                        }
                    }
                    .frame(maxWidth: 360)
                }

                HStack(spacing: 6) {
                    Circle()
                        .fill(updater.scheduleMode == .manual ? Color.secondary : (updater.scheduleActive ? .green : .orange))
                        .frame(width: 7, height: 7)
                    Text(scheduleText).font(.callout).foregroundColor(.secondary)
                    if let next = updater.nextCheck, updater.scheduleMode != .manual {
                        Text("· следующая проверка \(shortDateTime.string(from: next))")
                            .font(.callout).foregroundColor(.secondary)
                    }
                }
                Hint(text: "«График 2/2» — два дня проверяет, два пропускает (как смены). Кнопка «Проверить обновления» внизу слева работает всегда.")
            }
            .padding(.leading, 40)
        }
    }

    private var scheduleText: String {
        switch updater.scheduleMode {
        case .manual: return "Только при запуске и по кнопке «Проверить обновления»"
        case .schedule22: return updater.scheduleActive ? "Сегодня рабочий день по графику 2/2" : "Сегодня выходной по графику 2/2"
        case .everyDay: return "Проверка каждый день"
        case .weekdaysOnly: return updater.scheduleActive ? "Сегодня будний день" : "Сегодня выходной — пропуск"
        }
    }

    // MARK: Помощь

    private func helpCard(_ b: BrowserKind) -> some View {
        Collapsible(isExpanded: $showHelp) {
            HStack(spacing: 12) {
                Image(systemName: "questionmark.circle")
                    .font(.system(size: 16))
                    .frame(width: 28)
                    .foregroundColor(.accentColor)
                Text("Если что-то не работает").font(.headline)
            }
        } content: {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(helpItems(b)) { item in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item.question).font(.callout.weight(.semibold))
                        Text(LocalizedStringKey(item.answer))
                            .font(.callout)
                            .foregroundColor(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.leading, 40)
        }
    }

    private struct HelpItem: Identifiable {
        let question: String
        let answer: String
        var id: String { question }

        init(_ question: String, _ answer: String) {
            self.question = question
            self.answer = answer
        }
    }

    private func helpItems(_ b: BrowserKind) -> [HelpItem] {
        var items: [HelpItem] = [
            HelpItem("Скрипт не появляется в Bitrix24",
             "Обновите страницу (⌘R). Проверьте, что расширение \(b.extensionName) включено и ему разрешено работать на сайте Bitrix24."),
            HelpItem("Шаг не отмечается, хотя я всё сделал",
             "Нажмите **Проверить снова** или переключитесь в другое окно и обратно — приложение перепроверит. Шаги, которые проверить нельзя, отмечаются галочкой вручную."),
        ]
        if b == .safari {
            items.append(HelpItem("Ошибка «нет папки Userscripts»",
                          "Запустите приложение Userscripts один раз (шаг 2). Если в его настройках выбрана другая папка для скриптов, верните папку по умолчанию."))
            items.append(HelpItem("macOS спрашивает про доступ к данным других приложений",
                          "Нажмите **Разрешить** — так приложение может положить скрипт в папку Userscripts. Если нажали «Не разрешать»: **Системные настройки → Конфиденциальность и безопасность → Данные других приложений** → включите Studio1826Updater."))
        } else {
            items.append(HelpItem("Tampermonkey показывает текст скрипта вместо кнопки «Установить»",
                          "Расширение выключено или ему не разрешены пользовательские скрипты — вернитесь к шагу 3."))
        }
        return items
    }
}

// MARK: - Карточки браузеров

private struct BrowserCards: View {
    @EnvironmentObject var browsers: BrowserService

    var body: some View {
        HStack(spacing: 10) {
            ForEach(BrowserKind.allCases) { b in
                Button {
                    browsers.selected = b
                } label: {
                    VStack(spacing: 8) {
                        Group {
                            if let icon = browsers.icon(for: b) {
                                Image(nsImage: icon).resizable()
                            } else {
                                Image(systemName: "globe").resizable().foregroundColor(.secondary)
                            }
                        }
                        .frame(width: 36, height: 36)
                        Text(b.title).font(.callout.weight(.medium)).lineLimit(1)
                        Text(browsers.isInstalled(b) ? "Установлен" : "Не установлен")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(browsers.selected == b ? Color.accentColor.opacity(0.12) : Color(nsColor: .controlBackgroundColor))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .strokeBorder(browsers.selected == b ? Color.accentColor : Color(nsColor: .separatorColor).opacity(0.6),
                                          lineWidth: browsers.selected == b ? 2 : 1)
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct ProgressSummary: View {
    let done: Int
    let total: Int

    var body: some View {
        HStack(spacing: 12) {
            ProgressView(value: Double(done), total: Double(max(total, 1)))
                .frame(maxWidth: 220)
            Text(done == total ? "Всё настроено" : "Готово \(done) из \(total)")
                .font(.callout.weight(.medium))
                .foregroundColor(done == total ? .green : .secondary)
            Spacer()
        }
    }
}

private struct StepMarker: View {
    let number: Int
    let done: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(done ? Color.green : Color.accentColor.opacity(0.15))
                .frame(width: 28, height: 28)
            if done {
                Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundColor(.white)
            } else {
                Text("\(number)").font(.callout.weight(.semibold)).foregroundColor(.accentColor)
            }
        }
    }
}

// MARK: - Строки скриптов

private struct SafariScriptRow: View {
    let script: StudioUserscript
    @EnvironmentObject var updater: UpdaterService
    @EnvironmentObject var browsers: BrowserService

    var body: some View {
        let st = updater.state(of: script)
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "doc.text").font(.system(size: 18)).foregroundColor(.accentColor).frame(width: 24)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(script.name).font(.headline)
                    if let local = st.localVersion {
                        Badge(text: "Установлен \(local)", style: .ok)
                    } else {
                        Badge(text: "Не установлен", style: .warning)
                    }
                    if let remote = st.remoteVersion, remote != st.localVersion {
                        Badge(text: "Есть \(remote)", style: .warning)
                    }
                }
                Text(script.summary).font(.caption).foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    if st.isBusy { ProgressView().controlSize(.small) }
                    Text(st.status).font(.caption).foregroundColor(st.hasError ? .red : .secondary)
                }
            }
            Spacer(minLength: 8)
            Button(buttonTitle(st)) { updater.install(script) }
                .buttonStyle(.borderedProminent)
                .disabled(st.isBusy || !browsers.userscriptsFolderExists)
        }
    }

    private func buttonTitle(_ st: ScriptState) -> String {
        guard let local = st.localVersion else { return "Установить" }
        if let remote = st.remoteVersion, remote != local { return "Обновить" }
        return "Переустановить"
    }
}

private struct ChromiumScriptRow: View {
    let script: StudioUserscript
    let browser: BrowserKind
    @Binding var installed: Bool
    @EnvironmentObject var updater: UpdaterService
    @EnvironmentObject var browsers: BrowserService

    var body: some View {
        let st = updater.state(of: script)
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "doc.text").font(.system(size: 18)).foregroundColor(.accentColor).frame(width: 24)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(script.name).font(.headline)
                    if let remote = st.remoteVersion {
                        Badge(text: "Последняя \(remote)")
                    }
                }
                Text(script.summary).font(.caption).foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Toggle("Установлен", isOn: $installed)
            }
            Spacer(minLength: 8)
            Button("Установить в Tampermonkey") { updater.install(script) }
                .buttonStyle(.borderedProminent)
                .disabled(!browsers.isInstalled(browser))
        }
    }
}
