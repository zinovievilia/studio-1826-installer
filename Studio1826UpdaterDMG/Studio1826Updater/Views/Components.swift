import SwiftUI
import AppKit

// Общие элементы интерфейса.

/// Карточка-подложка.
struct Card<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color(nsColor: .controlBackgroundColor))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(Color(nsColor: .separatorColor).opacity(0.6))
            )
    }
}

/// Сворачиваемая карточка с заголовком (раскрывающийся список).
struct Collapsible<Label: View, Content: View>: View {
    @Binding var isExpanded: Bool
    private let label: Label
    private let content: Content

    init(isExpanded: Binding<Bool>, @ViewBuilder label: () -> Label, @ViewBuilder content: () -> Content) {
        self._isExpanded = isExpanded
        self.label = label()
        self.content = content()
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 0) {
                Button {
                    withAnimation(.easeInOut(duration: 0.18)) { isExpanded.toggle() }
                } label: {
                    HStack(spacing: 10) {
                        label
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)
                            .rotationEffect(.degrees(isExpanded ? 90 : 0))
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if isExpanded {
                    content
                        .padding(.top, 12)
                        .transition(.opacity)
                }
            }
        }
    }
}

enum BadgeStyle {
    case ok, warning, error, neutral

    var color: Color {
        switch self {
        case .ok: return .green
        case .warning: return .orange
        case .error: return .red
        case .neutral: return .secondary
        }
    }
}

/// Небольшая плашка состояния.
struct Badge: View {
    let text: String
    var style: BadgeStyle = .neutral

    var body: some View {
        Text(text)
            .font(.caption.weight(.medium))
            .foregroundColor(style.color)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(Capsule().fill(style.color.opacity(0.12)))
    }
}

/// Нумерованная инструкция.
struct Instructions: View {
    let steps: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(steps.enumerated()), id: \.offset) { pair in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("\(pair.offset + 1).")
                        .font(.callout.monospacedDigit())
                        .foregroundColor(.secondary)
                        .frame(width: 20, alignment: .trailing)
                    Text(LocalizedStringKey(pair.element))   // поддержка **жирного**
                        .font(.callout)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

/// Подсказка мелким шрифтом с иконкой.
struct Hint: View {
    let text: String
    var systemImage = "info.circle"

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Image(systemName: systemImage).foregroundColor(.secondary)
            Text(LocalizedStringKey(text))
                .font(.caption)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Всплывающее «Скопировано» внизу окна.
struct ToastOverlay: View {
    @EnvironmentObject var toaster: Toaster

    var body: some View {
        VStack {
            Spacer()
            if let message = toaster.message {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill").foregroundColor(.green)
                    Text(message).font(.callout.weight(.medium))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(.regularMaterial, in: Capsule())
                .shadow(color: .black.opacity(0.15), radius: 8, y: 2)
                .padding(.bottom, 20)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: toaster.message)
        .allowsHitTesting(false)
    }
}

let shortDateTime: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "ru_RU")
    f.dateFormat = "d MMM, HH:mm"
    return f
}()
