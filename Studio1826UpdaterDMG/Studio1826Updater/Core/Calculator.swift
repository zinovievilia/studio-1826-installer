import Foundation

/// Калькулятор для полей отчёта по кассе: «100+500» → 600.
///
/// Операции: + − × ÷ (также * / : x х), скобки, унарный минус. Знак «=» в конце игнорируется.
/// Числа: «2000», «2 000», «2.000» (точка перед группой из трёх цифр — разделитель тысяч,
/// как в самом отчёте), «12,5» и «12.5» — дробь.
enum Calculator {
    enum Failure: Error, Equatable {
        case empty
        case invalidCharacter(Character)
        case invalidNumber(String)
        case divisionByZero
        case unbalancedParentheses
        case incomplete

        var message: String {
            switch self {
            case .empty: return "Пусто"
            case .invalidCharacter(let ch): return "Непонятный символ «\(ch)»"
            case .invalidNumber(let s): return "Непонятное число «\(s)»"
            case .divisionByZero: return "Деление на ноль"
            case .unbalancedParentheses: return "Не хватает скобки"
            case .incomplete: return "Выражение не закончено"
            }
        }
    }

    private enum Token: Equatable {
        case number(Decimal)
        case op(Character)   // один из + - * /
        case open
        case close
    }

    static func evaluate(_ input: String) -> Result<Decimal, Failure> {
        do {
            let tokens = try tokenize(input)
            if tokens.isEmpty { return .failure(.empty) }
            var parser = Parser(tokens: tokens)
            let value = try parser.parseExpression()
            if parser.index < tokens.count {
                return .failure(tokens[parser.index] == .close ? .unbalancedParentheses : .incomplete)
            }
            return .success(value)
        } catch let failure as Failure {
            return .failure(failure)
        } catch {
            return .failure(.incomplete)
        }
    }

    // MARK: Числа

    static func parseNumber(_ raw: String) throws -> Decimal {
        var s = raw
        // «2.000», «102.690», «1.234.567,5» — точки разделяют тысячи
        if s.range(of: #"^[1-9][0-9]{0,2}(\.[0-9]{3})+(,[0-9]+)?$"#, options: .regularExpression) != nil {
            s = s.replacingOccurrences(of: ".", with: "")
        }
        s = s.replacingOccurrences(of: ",", with: ".")
        guard s.range(of: #"^([0-9]+(\.[0-9]*)?|\.[0-9]+)$"#, options: .regularExpression) != nil,
              let value = Decimal(string: s, locale: Locale(identifier: "en_US_POSIX")) else {
            throw Failure.invalidNumber(raw)
        }
        return value
    }

    // MARK: Лексер

    private static func tokenize(_ input: String) throws -> [Token] {
        var tokens: [Token] = []
        var number = ""

        func flush() throws {
            guard !number.isEmpty else { return }
            tokens.append(.number(try parseNumber(number)))
            number = ""
        }

        var text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        while text.hasSuffix("=") { text.removeLast() }

        for ch in text {
            switch ch {
            case "0"..."9", ".", ",":
                number.append(ch)
            case " ", "\u{00A0}", "\u{202F}", "\u{2009}", "'":
                continue   // пробелы внутри чисел: «2 000»
            case "+":
                try flush(); tokens.append(.op("+"))
            case "-", "−", "–":
                try flush(); tokens.append(.op("-"))
            case "*", "×", "x", "X", "х", "Х", "·":
                try flush(); tokens.append(.op("*"))
            case "/", "÷", ":":
                try flush(); tokens.append(.op("/"))
            case "(":
                try flush(); tokens.append(.open)
            case ")":
                try flush(); tokens.append(.close)
            default:
                throw Failure.invalidCharacter(ch)
            }
        }
        try flush()
        return tokens
    }

    // MARK: Парсер (рекурсивный спуск)

    private struct Parser {
        let tokens: [Token]
        var index = 0

        init(tokens: [Token]) {
            self.tokens = tokens
        }

        mutating func parseExpression() throws -> Decimal {
            var value = try parseTerm()
            while index < tokens.count, case .op(let op) = tokens[index], op == "+" || op == "-" {
                index += 1
                let rhs = try parseTerm()
                value = op == "+" ? value + rhs : value - rhs
            }
            return value
        }

        mutating func parseTerm() throws -> Decimal {
            var value = try parseFactor()
            while index < tokens.count, case .op(let op) = tokens[index], op == "*" || op == "/" {
                index += 1
                let rhs = try parseFactor()
                if op == "*" {
                    value = value * rhs
                } else {
                    if rhs == 0 { throw Failure.divisionByZero }
                    value = value / rhs
                }
            }
            return value
        }

        mutating func parseFactor() throws -> Decimal {
            guard index < tokens.count else { throw Failure.incomplete }
            let token = tokens[index]
            index += 1
            switch token {
            case .number(let n):
                return n
            case .op(let op) where op == "-":
                let inner = try parseFactor()
                return -inner
            case .op(let op) where op == "+":
                return try parseFactor()
            case .open:
                let inner = try parseExpression()
                guard index < tokens.count, tokens[index] == .close else {
                    throw Failure.unbalancedParentheses
                }
                index += 1
                return inner
            case .op, .close:
                throw Failure.incomplete
            }
        }
    }
}

/// Денежный формат отчёта: 102690 → «102.690», 0 → «0», 12.5 → «12,50».
enum MoneyFormat {
    static func string(_ value: Decimal) -> String {
        var input = value
        var rounded = Decimal()
        NSDecimalRound(&rounded, &input, 2, .plain)

        let negative = rounded < 0
        let absolute = negative ? -rounded : rounded
        let plain = NSDecimalNumber(decimal: absolute).stringValue   // «102690» или «12.5»
        let parts = plain.split(separator: ".", omittingEmptySubsequences: false)

        var grouped = ""
        for (i, ch) in String(parts[0]).reversed().enumerated() {
            if i > 0 && i % 3 == 0 { grouped.append(".") }
            grouped.append(ch)
        }
        var result = String(grouped.reversed())

        if parts.count > 1 {
            var fraction = String(parts[1])
            while fraction.count < 2 { fraction += "0" }
            result += "," + fraction
        }
        return negative ? "-" + result : result
    }
}
