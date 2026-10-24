import Foundation

// Тесты чистой логики (папка Studio1826Updater/Core) без Xcode и XCTest.
// Запуск на Mac из папки Studio1826UpdaterDMG:
//   swiftc -swift-version 5 Studio1826Updater/Core/*.swift Tests/CoreTests/main.swift -o /tmp/coretests && /tmp/coretests

var failures = 0
var checks = 0

func expect(_ condition: Bool, _ message: String, file: String = #file, line: Int = #line) {
    checks += 1
    if !condition {
        failures += 1
        print("✗ \(message)  (строка \(line))")
    }
}

func calc(_ s: String) -> String {
    switch Calculator.evaluate(s) {
    case .success(let v): return MoneyFormat.string(v)
    case .failure(let f): return "ошибка: \(f.message)"
    }
}

// MARK: Калькулятор и формат

expect(calc("100+500") == "600", "100+500 = 600")
expect(calc("0") == "0", "0")
expect(calc("2000") == "2.000", "2000 → 2.000")
expect(calc("2.000") == "2.000", "2.000 — тысячи")
expect(calc("102.690") == "102.690", "102.690 — тысячи")
expect(calc("102 690") == "102.690", "пробел внутри числа")
expect(calc("1.5") == "1,50", "1.5 — дробь")
expect(calc("1,5") == "1,50", "1,5 — дробь")
expect(calc("0.500") == "0,50", "0.500 — дробь, не тысячи")
expect(calc("1.234.567") == "1.234.567", "миллион с точками")
expect(calc("2.000+410") == "2.410", "тысячи в выражении")
expect(calc("(100+50)*2") == "300", "скобки")
expect(calc("10-20") == "-10", "минус")
expect(calc("-5+10") == "5", "унарный минус")
expect(calc("100x3") == "300", "x как умножение")
expect(calc("100х3") == "300", "кириллическая х")
expect(calc("900:3") == "300", "двоеточие как деление")
expect(calc("100 + 500 =") == "600", "знак = в конце")
expect(calc("10/3") == "3,33", "округление до копеек")
expect(Calculator.evaluate("") == .failure(.empty), "пусто")
expect(Calculator.evaluate("1/0") == .failure(.divisionByZero), "деление на ноль")
expect(Calculator.evaluate("(1+2") == .failure(.unbalancedParentheses), "скобка")
expect(Calculator.evaluate("1+2)") == .failure(.unbalancedParentheses), "лишняя скобка")
expect(Calculator.evaluate("100+") == .failure(.incomplete), "не закончено")
expect(Calculator.evaluate("10а") == .failure(.invalidCharacter("а")), "буква")
expect(Calculator.evaluate("1.2.3") == .failure(.invalidNumber("1.2.3")), "плохое число")

// MARK: Отчёт

var cal = Calendar(identifier: .gregorian)
cal.timeZone = TimeZone(identifier: "Europe/Moscow")!
let date = cal.date(from: DateComponents(year: 2026, month: 10, day: 23, hour: 12))!
let report = CashReport(date: date, branch: .paveletskaya, values: [
    .withdrawal: 0, .deposit: 2000, .cash: 410, .drawer: 102690, .register: 102730,
])
let expected = """
23.10
Павелецкая

Изъятие: 0
Внесение: 2.000
Наличные: 410
Денежный ящик: 102.690
Касса: 102.730
"""
expect(report.text(calendar: cal) == expected, "текст отчёта как в примере")
expect(CashReport.dateString(cal.date(from: DateComponents(year: 2026, month: 3, day: 5))!, calendar: cal) == "05.03", "дата с нулями")

// MARK: Версии

expect(AppVersion.isNewer("4.0.1", than: "4.0.0"), "4.0.1 > 4.0.0")
expect(AppVersion.isNewer("v4.1", than: "4.0.9"), "v4.1 > 4.0.9")
expect(!AppVersion.isNewer("3.0.0", than: "4.0.0"), "старую версию не предлагаем")
expect(!AppVersion.isNewer("4.0.0\n", than: "4.0.0"), "та же версия")
expect(UserscriptText.version(in: "// @version      5.6.0\n") == "5.6.0", "@version")
expect(UserscriptText.version(in: "const VERSION = '5.5.1';") == "5.5.1", "VERSION =")
expect(!UserscriptText.looksLikeUserscript("404: Not Found"), "страница ошибки — не скрипт")

// MARK: Ссылки

expect(StudioBranch.paveletskaya.links.map(\.url.absoluteString) == [
    "https://1826.studio/pav", "https://1826.studio/pav/equipment",
    "https://1826.studio/pav/contacts", "https://1826.studio/pav/payment",
], "ссылки Павелецкой")
expect(StudioBranch.serpukhovskaya.links.last?.url.absoluteString == "https://1826.studio/serp/payment", "бронь Серпуховской")

// MARK: Библиотека скриптов ответов

let a = ReplyScript(id: "studio.a", title: "Адрес", category: "Как добраться", text: "Мы на Павелецкой", keywords: ["адрес"])
let b = ReplyScript(id: "studio.b", title: "Бронь", category: "Бронирование", text: "Напишите дату", keywords: [])
var lib = ReplyLibrary(base: BaseReplyLibrary(version: 1, categories: ["Бронирование", "Как добраться"], scripts: [a, b]),
                       state: ReplyUserState())

expect(lib.items.count == 2, "две базовых")
expect(lib.search(query: "адрес", category: nil).first?.id == "studio.a", "поиск по названию")
expect(lib.search(query: "ПАВЕЛЕЦКОЙ", category: nil).map(\.id) == ["studio.a"], "поиск без учёта регистра")
expect(lib.search(query: "дату", category: "Как добраться").isEmpty, "фильтр по категории")
expect(lib.search(query: "адрес дату", category: nil).isEmpty, "все слова должны совпасть")

var mine = ReplyScript.newMine(category: "Своё")
mine.title = "Ёлка"
mine.text = "Текст"
lib.save(mine)
expect(lib.items.last?.origin == .mine, "свой скрипт")
expect(lib.search(query: "елка", category: nil).count == 1, "ё = е")
expect(lib.categories == ["Бронирование", "Как добраться", "Своё"], "категории по порядку")

var editedA = a
editedA.text = "Мы на Павелецкой, вход со двора"
lib.save(editedA)
expect(lib.item(id: "studio.a")?.origin == .studioEdited(studioChanged: false), "правка базового")
expect(lib.item(id: "studio.a")?.script.text == editedA.text, "правка видна")

// Студия выпустила новую версию того же скрипта
var newA = a
newA.text = "Мы переехали"
lib.base = BaseReplyLibrary(version: 2, categories: lib.base.categories, scripts: [newA, b])
expect(lib.item(id: "studio.a")?.origin == .studioEdited(studioChanged: true), "студия обновила — отметка")
expect(lib.item(id: "studio.a")?.script.text == editedA.text, "правка сотрудника не затёрта")
lib.keepMine(id: "studio.a")
expect(lib.item(id: "studio.a")?.origin == .studioEdited(studioChanged: false), "оставить мою — отметка снята")
lib.resetToStudio(id: "studio.a")
expect(lib.item(id: "studio.a")?.script.text == "Мы переехали", "вернуть версию студии")

lib.delete(id: "studio.b")
expect(lib.item(id: "studio.b") == nil && lib.hiddenCount == 1, "удаление базового скрывает")
lib.restoreHidden()
expect(lib.item(id: "studio.b") != nil, "вернуть удалённые")
lib.delete(id: mine.id)
expect(lib.item(id: mine.id) == nil, "удаление своего")

let added = lib.importScripts([b, ReplyScript(id: "x", title: "Новый", category: "", text: "Привет")])
expect(added == 1, "импорт пропускает дубли")
expect(lib.items.last?.script.category == ReplyLibrary.uncategorized, "пустая категория → «Без категории»")
expect(lib.items.last?.id.hasPrefix("my.") == true, "импорт получает свой id")

// Пользовательский файл старого/неполного формата читается
let partial = try! JSONDecoder().decode(ReplyUserState.self, from: Data(#"{"custom":[{"title":"t","text":"x"}]}"#.utf8))
expect(partial.custom.count == 1 && partial.overrides.isEmpty, "неполный файл состояния")

// Базовая библиотека из ресурсов приложения корректна
let resource = URL(fileURLWithPath: #file)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .appendingPathComponent("Studio1826Updater/Resources/ReplyLibrary.json")
if let data = try? Data(contentsOf: resource) {
    do {
        let base = try JSONDecoder().decode(BaseReplyLibrary.self, from: data)
        expect(!base.scripts.isEmpty, "в базовой библиотеке есть скрипты")
        expect(Set(base.scripts.map(\.id)).count == base.scripts.count, "id базовых скриптов уникальны")
        expect(base.scripts.allSatisfy { base.categories.contains($0.category) }, "категории базовых скриптов объявлены")
    } catch {
        expect(false, "ReplyLibrary.json не читается: \(error)")
    }
} else {
    expect(false, "нет файла \(resource.path)")
}

print(failures == 0 ? "✓ Все проверки пройдены: \(checks)" : "✗ Провалено \(failures) из \(checks)")
exit(failures == 0 ? 0 : 1)
