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
      extensionContext?.cancelRequest(withError: NSError(domain: "CalyMobSuuntoShare", code: 1, userInfo: [NSLocalizedDescriptionKey: "A JSON file is required."]))
      return
    }
    provider.loadItem(forTypeIdentifier: UTType.json.identifier, options: nil) { [weak self] item, _ in
      guard let self, let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: self.appGroup) else {
        self?.extensionContext?.cancelRequest(withError: NSError(domain: "CalyMobSuuntoShare", code: 2, userInfo: [NSLocalizedDescriptionKey: "The secure CalyMob inbox is unavailable."]))
        return
      }
      let destination = container.appendingPathComponent(self.inboxName)
      do {
        try? FileManager.default.removeItem(at: destination)
        if let url = item as? URL {
          let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
          if (attributes[.size] as? NSNumber)?.intValue ?? 0 > 20 * 1024 * 1024 { throw NSError(domain: "CalyMobSuuntoShare", code: 3, userInfo: [NSLocalizedDescriptionKey: "The file exceeds 20 MB."]) }
          try FileManager.default.copyItem(at: url, to: destination)
        } else if let data = item as? Data {
          if data.count > 20 * 1024 * 1024 { throw NSError(domain: "CalyMobSuuntoShare", code: 3, userInfo: [NSLocalizedDescriptionKey: "The file exceeds 20 MB."]) }
          try data.write(to: destination, options: .atomic)
        } else { throw NSError(domain: "CalyMobSuuntoShare", code: 4, userInfo: [NSLocalizedDescriptionKey: "Unsupported JSON item."]) }
        self.extensionContext?.completeRequest(returningItems: nil)
      } catch { self.extensionContext?.cancelRequest(withError: error) }
    }
  }
}
