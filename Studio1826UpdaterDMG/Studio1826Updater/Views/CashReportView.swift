import SwiftUI

/// «Отчёт по кассе»: дата, филиал, пять сумм (можно с подсчётами, пустое — 0) → текст для Telegram в буфер обмена.
struct CashReportView: View {
    @EnvironmentObject var model: CashReportModel
    @EnvironmentObject var toaster: Toaster
    @FocusState private var focused: CashField?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Card {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            DatePicker("", selection: $model.date, displayedComponents: .date)
                                .labelsHidden()
                                .datePickerStyle(.field)
                                .frame(width: 110)
                            if !Calendar.current.isDateInToday(model.date) {
                                Button("Сегодня") { model.date = Date() }
                                    .controlSize(.small)
                            }
                            Picker("", selection: $model.branch) {
                                ForEach(StudioBranch.allCases) { b in Text(b.title).tag(b) }
                            }
                            .labelsHidden()
                            .pickerStyle(.segmented)
                        }
                        Divider()
                        ForEach(CashField.allCases) { field in
                            fieldRow(field)
                        }
                    }
                }

                Text("Пустое поле — 0. В полях можно считать: «100+500» станет 600. Enter — следующее поле.")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 10) {
                    Button {
                        copy()
                    } label: {
                        Label("Скопировать для Telegram", systemImage: "doc.on.doc")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .keyboardShortcut(.return, modifiers: .command)
                    .disabled(!model.problems.isEmpty)

                    Button("Новый отчёт") {
                        model.clear()
                        focused = CashField.allCases.first
                    }
                    .controlSize(.large)
                }

                if !model.problems.isEmpty {
                    Text("Исправьте: " + model.problems.map(\.title).joined(separator: ", "))
                        .font(.caption)
                        .foregroundColor(.orange)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(14)
        }
        .onAppear {
            if (model.inputs[.withdrawal] ?? "").isEmpty { focused = .withdrawal }
        }
    }

    private func fieldRow(_ field: CashField) -> some View {
        HStack(spacing: 10) {
            Text(field.title).frame(width: 110, alignment: .leading)
            TextField("0", text: binding(field))
                .textFieldStyle(.roundedBorder)
                .font(.body.monospacedDigit())
                .frame(width: 140)
                .focused($focused, equals: field)
                .onSubmit { focusNext(after: field) }
            resultLabel(field)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private func resultLabel(_ field: CashField) -> some View {
        switch model.result(field) {
        case .none:
            Text("").font(.callout)
        case .some(.success(let value)):
            Text("= \(MoneyFormat.string(value))")
                .font(.callout.monospacedDigit().weight(.medium))
                .foregroundColor(.green)
        case .some(.failure(let error)):
            Label(error.message, systemImage: "exclamationmark.triangle.fill")
                .font(.caption)
                .lineLimit(2)
                .foregroundColor(.red)
        }
    }

    private func binding(_ field: CashField) -> Binding<String> {
        Binding(get: { model.inputs[field] ?? "" },
                set: { model.inputs[field] = $0 })
    }

    private func focusNext(after field: CashField) {
        let all = CashField.allCases
        if let i = all.firstIndex(of: field), i + 1 < all.count {
            focused = all[i + 1]
        } else {
            focused = nil
            if model.problems.isEmpty { copy() }
        }
    }

    private func copy() {
        guard model.problems.isEmpty else { return }
        Clipboard.copy(model.report.text())
        toaster.show("Отчёт скопирован для Telegram")
    }
}
