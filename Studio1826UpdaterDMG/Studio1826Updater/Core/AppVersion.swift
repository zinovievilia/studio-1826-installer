import Foundation

/// Сравнение версий вида «1.2.3» / «v1.2.3». Нечисловые части считаются нулём.
enum AppVersion {
    static func components(_ version: String) -> [Int] {
        var text = version.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.hasPrefix("v") || text.hasPrefix("V") { text.removeFirst() }
        return text.split(separator: ".").map { part in
            Int(String(part.prefix(while: { ch in ch.isASCII && ch.isNumber }))) ?? 0
        }
    }

    /// true, если `candidate` строго новее `current`.
    /// Раньше приложение предлагало «обновиться» при любом отличии app.version,
    /// в том числе на более старую версию.
    static func isNewer(_ candidate: String, than current: String) -> Bool {
        let a = components(candidate)
        let b = components(current)
        for i in 0..<max(a.count, b.count) {
            let x = i < a.count ? a[i] : 0
            let y = i < b.count ? b[i] : 0
            if x != y { return x > y }
        }
        return false
    }
}

/// Разбор текста userscript.
enum UserscriptText {
    /// Версия из `// @version 5.6.0` (или запасной вариант `VERSION = '5.6.0'`).
    static func version(in text: String) -> String? {
        if let r = text.range(of: #"@version[ \t]+[0-9][0-9.]*"#, options: .regularExpression) {
            let match = text[r]
            if let last = match.split(whereSeparator: { ch in ch == " " || ch == "\t" }).last {
                return String(last)
            }
        }
        if let r = text.range(of: #"VERSION\s*=\s*'[0-9][0-9.]*'"#, options: .regularExpression) {
            let digits = text[r].drop(while: { ch in ch != "'" }).filter { ch in ch.isNumber || ch == "." }
            return digits.isEmpty ? nil : String(digits)
        }
        return nil
    }

    /// Защита от записи в Userscripts страницы ошибки вместо скрипта.
    static func looksLikeUserscript(_ text: String) -> Bool {
        text.contains("==UserScript==") && text.contains("==/UserScript==")
    }
}
