import SwiftUI
import AppKit

/// «Сайт и ссылки»: страницы филиалов и рабочие ссылки. Каждую ссылку можно открыть или скопировать для клиента.
struct LinksView: View {
    @EnvironmentObject var toaster: Toaster

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageHeader(title: "Сайт и ссылки",
                           subtitle: "Открыть страницу или скопировать ссылку, чтобы отправить клиенту.",
                           systemImage: "link")

                HStack(alignment: .top, spacing: 14) {
                    ForEach(StudioBranch.allCases) { branch in
                        BranchCard(branch: branch)
                    }
                }

                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Для сотрудников").font(.headline)
                        LinkRow(title: "Таблица зарплаты", detail: "Google Таблицы",
                                systemImage: "tablecells", url: StudioLinks.salarySheet, copyable: false)
                        Divider()
                        LinkRow(title: "Bitrix24", detail: "1826studio.bitrix24.ru",
                                systemImage: "briefcase", url: StudioLinks.bitrix, copyable: false)
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 900, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }
}

private struct BranchCard: View {
    let branch: StudioBranch
    @EnvironmentObject var toaster: Toaster

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label(branch.title, systemImage: "building.2").font(.headline)
                    Spacer()
                    Button {
                        Clipboard.copy(allLinksText)
                        toaster.show("Ссылки «\(branch.title)» скопированы")
                    } label: {
                        Label("Все ссылки", systemImage: "doc.on.doc")
                    }
                    .controlSize(.small)
                    .help("Скопировать все ссылки филиала одним сообщением")
                }
                ForEach(Array(branch.links.enumerated()), id: \.element.id) { pair in
                    if pair.offset > 0 { Divider() }
                    LinkRow(title: pair.element.title, detail: pair.element.detail,
                            systemImage: pair.element.systemImage, url: pair.element.url, copyable: true)
                }
            }
        }
    }

    private var allLinksText: String {
        ([branch.title] + branch.links.map { "\($0.title): \($0.url.absoluteString)" })
            .joined(separator: "\n")
    }
}

private struct LinkRow: View {
    let title: String
    let detail: String
    let systemImage: String
    let url: URL
    let copyable: Bool
    @EnvironmentObject var toaster: Toaster

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .frame(width: 22)
                .foregroundColor(.accentColor)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.body.weight(.medium))
                Text(detail).font(.caption).foregroundColor(.secondary)
            }
            Spacer(minLength: 6)
            if copyable {
                Button {
                    Clipboard.copy(url.absoluteString)
                    toaster.show("Ссылка скопирована")
                } label: {
                    Image(systemName: "doc.on.doc")
                }
                .help("Скопировать ссылку")
            }
            Button {
                NSWorkspace.shared.open(url)
            } label: {
                Label("Открыть", systemImage: "arrow.up.right.square")
            }
            .help(url.absoluteString)
        }
        .contextMenu {
            Button("Открыть") { NSWorkspace.shared.open(url) }
            Button("Скопировать ссылку") {
                Clipboard.copy(url.absoluteString)
                toaster.show("Ссылка скопирована")
            }
        }
    }
}
