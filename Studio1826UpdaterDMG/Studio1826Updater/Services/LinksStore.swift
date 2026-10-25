import Foundation

/// Вкладка «Ссылки» этого Mac: `~/Library/Application Support/Studio1826/links.json`.
/// Пока сотрудник ничего не менял, файла нет и показывается набор студии.
@MainActor
final class LinksStore: ObservableObject {
    @Published private(set) var layout: LinksLayout

    private let fileURL: URL

    init() {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Studio1826", isDirectory: true)
        fileURL = folder.appendingPathComponent("links.json")

        if let data = try? Data(contentsOf: fileURL),
           var saved = try? JSONDecoder().decode(LinksLayout.self, from: data) {
            let before = saved
            saved.merge(studio: .studio)
            layout = saved
            if saved != before { persist() }
        } else {
            layout = .studio
        }
    }

    var isCustomized: Bool { FileManager.default.fileExists(atPath: fileURL.path) }

    /// Изменить и сразу сохранить на диск.
    func update(_ change: (inout LinksLayout) -> Void) {
        var copy = layout
        change(&copy)
        guard copy != layout else { return }
        layout = copy
        persist()
    }

    /// Вернуть набор студии: свои строки и порядок пропадут.
    func resetToStudio() {
        try? FileManager.default.removeItem(at: fileURL)
        layout = .studio
        objectWillChange.send()
    }

    private func persist() {
        do {
            try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(layout).write(to: fileURL, options: .atomic)
        } catch {
            NSLog("Studio1826: не удалось сохранить ссылки: \(error)")
        }
    }
}
