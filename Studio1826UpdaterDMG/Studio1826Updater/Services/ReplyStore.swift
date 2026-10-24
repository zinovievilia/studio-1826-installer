import Foundation
import Combine

/// Хранит библиотеку скриптов ответов: базовая — из приложения, своя — в
/// ~/Library/Application Support/Studio1826/replies.json.
@MainActor
final class ReplyStore: ObservableObject {
    @Published private(set) var library: ReplyLibrary
    /// Сообщение, если файл со своими скриптами не прочитался (он сохранён рядом под другим именем).
    @Published var loadWarning: String?

    private let fileURL: URL

    init() {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Studio1826", isDirectory: true)
        fileURL = folder.appendingPathComponent("replies.json")

        var base = BaseReplyLibrary.empty
        if let url = Bundle.main.url(forResource: "ReplyLibrary", withExtension: "json"),
           let data = try? Data(contentsOf: url),
           let decoded = try? JSONDecoder().decode(BaseReplyLibrary.self, from: data) {
            base = decoded
        }

        var state = ReplyUserState()
        var warning: String?
        if let data = try? Data(contentsOf: fileURL) {
            do {
                state = try JSONDecoder().decode(ReplyUserState.self, from: data)
            } catch {
                // Не затираем повреждённый файл — откладываем его в сторону
                let backup = folder.appendingPathComponent("replies-повреждён-\(Int(Date().timeIntervalSince1970)).json")
                try? FileManager.default.moveItem(at: fileURL, to: backup)
                warning = "Файл со своими скриптами не прочитался. Копия сохранена: \(backup.path)"
            }
        }
        library = ReplyLibrary(base: base, state: state)
        loadWarning = warning
    }

    /// Изменить библиотеку и сразу сохранить на диск.
    func update(_ change: (inout ReplyLibrary) -> Void) {
        var copy = library
        change(&copy)
        library = copy
        persist()
    }

    private func persist() {
        do {
            try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(),
                                                    withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(library.state).write(to: fileURL, options: .atomic)
        } catch {
            loadWarning = "Не удалось сохранить скрипты: \(error.localizedDescription)"
        }
    }

    // MARK: Обмен файлами

    static func exportData(_ scripts: [ReplyScript]) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(ReplyExportFile(scripts: scripts))
    }

    /// Возвращает число добавленных скриптов.
    func importFile(at url: URL) throws -> Int {
        let data = try Data(contentsOf: url)
        let payload = try JSONDecoder().decode(ReplyImportPayload.self, from: data)
        var added = 0
        update { added = $0.importScripts(payload.scripts) }
        return added
    }
}
