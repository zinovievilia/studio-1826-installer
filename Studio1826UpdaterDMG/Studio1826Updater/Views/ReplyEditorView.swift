import SwiftUI

/// Создание / редактирование скрипта ответа (внутри окна, без отдельного листа).
struct ReplyEditorView: View {
    private let isNew: Bool
    private let categories: [String]
    private let onCancel: () -> Void
    private let onSave: (ReplyScript) -> Void
    private let original: ReplyScript

    @State private var title: String
    @State private var category: String
    @State private var text: String

    init(script: ReplyScript, isNew: Bool, categories: [String],
         onCancel: @escaping () -> Void, onSave: @escaping (ReplyScript) -> Void) {
        self.original = script
        self.isNew = isNew
        self.categories = categories
        self.onCancel = onCancel
        self.onSave = onSave
        _title = State(initialValue: script.title)
        _category = State(initialValue: script.category)
        _text = State(initialValue: script.text)
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(isNew ? "Новый скрипт" : "Изменить скрипт").font(.headline)
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if !isNew && original.id.hasPrefix("studio.") {
                        Hint(text: "Это скрипт студии. Правки сохранятся только на этом Mac; если студия обновит скрипт, появится отметка и можно будет выбрать версию.")
                    }

                    labeled("Название") {
                        TextField("Например: Парковка и курьеры", text: $title)
                            .textFieldStyle(.roundedBorder)
                    }

                    labeled("Категория — выберите или впишите новую") {
                        HStack(spacing: 6) {
                            TextField("Категория", text: $category)
                                .textFieldStyle(.roundedBorder)
                            Menu {
                                ForEach(categories, id: \.self) { c in
                                    Button(c) { category = c }
                                }
                            } label: {
                                Image(systemName: "chevron.down")
                            }
                            .menuStyle(.borderlessButton)
                            .fixedSize()
                        }
                    }

                    labeled("Текст для клиента") {
                        TextEditor(text: $text)
                            .font(.body)
                            .frame(minHeight: 220)
                            .padding(4)
                            .background(RoundedRectangle(cornerRadius: 6).fill(Color(nsColor: .textBackgroundColor)))
                            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(nsColor: .separatorColor)))
                    }

                    Text("Искать скрипт можно по любым словам из названия и текста — ключевые слова отдельно не нужны.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(14)
            }

            Divider()

            HStack {
                Button("Отмена", action: onCancel)
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button("Сохранить") {
                    var result = original
                    result.title = title
                    result.category = category
                    result.text = text
                    onSave(result)
                }
                .keyboardShortcut("s", modifiers: .command)
                .buttonStyle(.borderedProminent)
                .disabled(!canSave)
            }
            .padding(12)
        }
    }

    private func labeled<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundColor(.secondary)
            content()
        }
    }
}
