import Social
import UniformTypeIdentifiers

/// Share-extension implementation for the `CalyMobSuuntoShare` target.
/// The target is intentionally dependency-free: it copies a JSON file into
/// the App Group inbox, after which the Flutter host owns parsing/deletion.
final class ShareViewController: SLComposeServiceViewController {
  private let appGroup = "group.com.calypso.calymob"
  private let inboxName = "suunto-import-inbox.json"

  override func isContentValid() -> Bool { true }
  override func didSelectPost() {
    guard let item = extensionContext?.inputItems.first as? NSExtensionItem,
          let provider = item.attachments?.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.json.identifier) }) else {
      extensionContext?.completeRequest(returningItems: nil)
      return
    }
    provider.loadItem(forTypeIdentifier: UTType.json.identifier, options: nil) { [weak self] item, _ in
      defer { self?.extensionContext?.completeRequest(returningItems: nil) }
      guard let self, let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: self.appGroup) else { return }
      let destination = container.appendingPathComponent(self.inboxName)
      try? FileManager.default.removeItem(at: destination)
      if let url = item as? URL { try? FileManager.default.copyItem(at: url, to: destination) }
      else if let data = item as? Data { try? data.write(to: destination, options: .atomic) }
    }
  }
}
