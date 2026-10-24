import SwiftUI

/// Окно создания / редактирования скрипта ответа.
struct ReplyEditorView: View {
    @Environment(\.dismiss) private var dismiss

    private let isNew: Bool
    private let categories: [String]
    private let onSave: (ReplyScript) -> Void
    private let original: ReplyScript

    @State private var title: String
    @State private var category: String
    @State private var text: String
    @State private var keywords: String

    init(script: ReplyScript, isNew: Bool, categories: [String], onSave: @escaping (ReplyScript) -> Void) {
        self.original = script
        self.isNew = isNew
        self.categories = categories
        self.onSave = onSave
        _title = State(initialValue: script.title)
        _category = State(initialValue: script.category)
        _text = State(initialValue: script.text)
        _keywords = State(initialValue: script.keywords.joined(separator: ", "))
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(isNew ? "Новый скрипт" : "Изменить скрипт").font(.title3.weight(.semibold))

            if !isNew && original.id.hasPrefix("studio.") {
                Hint(text: "Это скрипт студии. Ваши правки сохранятся только на этом Mac; если студия обновит скрипт, вы увидите отметку и сможете выбрать версию.")
            }

            labeled("Название") {
                TextField("Например: Как пройти — Павелецкая", text: $title)
                    .textFieldStyle(.roundedBorder)
            }

            labeled("Категория") {
                HStack(spacing: 6) {
                    TextField("Выберите или впишите новую", text: $category)
                        .textFieldStyle(.roundedBorder)
                    Menu {
                        ForEach(categories, id: \.self) { c in
                            Button(c) { category = c }
                        }
                    } label: {
                        Image(systemName: "chevron.down")
                    }
                    .menuStyle(.borderlessButton)
                    .frame(width: 28)
                }
            }

            labeled("Текст для клиента") {
                TextEditor(text: $text)
                    .font(.body)
                    .frame(minHeight: 180)
                    .padding(4)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color(nsColor: .textBackgroundColor)))
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(nsColor: .separatorColor)))
            }

            labeled("Ключевые слова для поиска (через запятую)") {
                TextField("бронь, адрес, свет", text: $keywords)
                    .textFieldStyle(.roundedBorder)
            }

            HStack {
                Spacer()
                Button("Отмена", role: .cancel) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button("Сохранить") {
                    var result = original
                    result.title = title
                    result.category = category
                    result.text = text
                    result.keywords = keywords.split(separator: ",").map { String($0) }
                    onSave(result)
                    dismiss()
                }
                .keyboardShortcut("s", modifiers: .command)
                .buttonStyle(.borderedProminent)
                .disabled(!canSave)
            }
        }
        .padding(20)
        .frame(width: 560)
    }

    private func labeled<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundColor(.secondary)
            content()
        }
    }
}
