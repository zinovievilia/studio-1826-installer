import SwiftUI

/// «Отчёт по кассе»: дата, филиал, пять сумм (можно с подсчётами) → готовый текст в буфер обмена.
struct CashReportView: View {
    @EnvironmentObject var model: CashReportModel
    @EnvironmentObject var toaster: Toaster
    @FocusState private var focused: CashField?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageHeader(title: "Отчёт по кассе",
                           subtitle: "В полях можно считать: «100+500» превратится в 600. Enter — к следующему полю.",
                           systemImage: "banknote")

                Card {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 12) {
                            Text("Дата").frame(width: 120, alignment: .leading)
                            DatePicker("", selection: $model.date, displayedComponents: .date)
                                .labelsHidden()
                                .datePickerStyle(.field)
                                .frame(width: 130)
                            if !Calendar.current.isDateInToday(model.date) {
                                Button("Сегодня") { model.date = Date() }
                                    .controlSize(.small)
                            }
                            Spacer()
                        }
                        HStack(spacing: 12) {
                            Text("Филиал").frame(width: 120, alignment: .leading)
                            Picker("", selection: $model.branch) {
                                ForEach(StudioBranch.allCases) { b in Text(b.title).tag(b) }
                            }
                            .labelsHidden()
                            .pickerStyle(.segmented)
                            .frame(width: 300)
                            Spacer()
                        }
                    }
                }

                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(CashField.allCases) { field in
                            fieldRow(field)
                        }
                    }
                }

                HStack(alignment: .top, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Так будет скопировано").font(.caption).foregroundColor(.secondary)
                        Text(previewText)
                            .font(.system(.body, design: .monospaced))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                            .background(RoundedRectangle(cornerRadius: 8).fill(Color(nsColor: .textBackgroundColor)))
                            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color(nsColor: .separatorColor).opacity(0.6)))
                    }
                    .frame(maxWidth: 320)

                    VStack(alignment: .leading, spacing: 10) {
                        Button {
                            copy()
                        } label: {
                            Label("Скопировать отчёт", systemImage: "doc.on.doc")
                                .frame(minWidth: 180)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .keyboardShortcut(.return, modifiers: .command)
                        .disabled(!model.problems.isEmpty)

                        if !model.problems.isEmpty {
                            Text("Заполните: " + model.problems.map(\.title).joined(separator: ", "))
                                .font(.caption)
                                .foregroundColor(.orange)
                                .fixedSize(horizontal: false, vertical: true)
                        } else {
                            Text("⌘↩ — скопировать").font(.caption).foregroundColor(.secondary)
                        }

                        Button("Новый отчёт") {
                            model.clear()
                            focused = CashField.allCases.first
                        }
                    }
                    .padding(.top, 20)
                }
            }
            .padding(24)
            .frame(maxWidth: 760, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .onAppear {
            if (model.inputs[.withdrawal] ?? "").isEmpty { focused = .withdrawal }
        }
    }

    private func fieldRow(_ field: CashField) -> some View {
        HStack(spacing: 12) {
            Text(field.title).frame(width: 120, alignment: .leading)
            TextField("0", text: binding(field))
                .textFieldStyle(.roundedBorder)
                .font(.body.monospacedDigit())
                .frame(width: 220)
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
                .font(.callout)
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

    private var previewText: String {
        var lines = [CashReport.dateString(model.date), model.branch.title, ""]
        for field in CashField.allCases {
            let value: String
            if case .success(let v) = model.result(field) {
                value = MoneyFormat.string(v)
            } else {
                value = "—"
            }
            lines.append("\(field.title): \(value)")
        }
        return lines.joined(separator: "\n")
    }

    private func copy() {
        guard model.problems.isEmpty else { return }
        Clipboard.copy(model.report.text())
        toaster.show("Отчёт скопирован")
    }
}
