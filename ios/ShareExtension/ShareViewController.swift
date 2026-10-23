import Social
import UniformTypeIdentifiers

/// Share-extension implementation for the `CalyMobSuuntoShare` target.
/// The target is intentionally dependency-free: it copies a supported dive log into
/// the App Group inbox, after which the Flutter host owns parsing/deletion.
final class ShareViewController: SLComposeServiceViewController {
  private let appGroup = "group.com.calypso.calymob"
  private let manifestName = "suunto-import-manifest.json"
  private struct InboxItem: Codable { let id: String; let storedName: String; let originalName: String; let uti: String }

  override func isContentValid() -> Bool { true }
  override func didSelectPost() {
    let accepted = [UTType.json, UTType.xml, UTType.zip, UTType.data]
    guard let item = extensionContext?.inputItems.first as? NSExtensionItem,
          let provider = item.attachments?.first(where: { provider in accepted.contains(where: { provider.hasItemConformingToTypeIdentifier($0.identifier) }) }),
          let type = accepted.first(where: { provider.hasItemConformingToTypeIdentifier($0.identifier) }) else {
      extensionContext?.cancelRequest(withError: NSError(domain: "CalyMobSuuntoShare", code: 1, userInfo: [NSLocalizedDescriptionKey: "A supported dive-log file is required."]))
      return
    }
    provider.loadItem(forTypeIdentifier: type.identifier, options: nil) { [weak self] item, _ in
      guard let self, let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: self.appGroup) else {
        self?.extensionContext?.cancelRequest(withError: NSError(domain: "CalyMobSuuntoShare", code: 2, userInfo: [NSLocalizedDescriptionKey: "The secure CalyMob inbox is unavailable."]))
        return
      }
      let sourceName = (item as? URL)?.lastPathComponent ?? provider.suggestedName ?? "dive-log"
      let suffix = (sourceName as NSString).pathExtension.isEmpty ? (type == .json ? "json" : type == .xml ? "xml" : type == .zip ? "zip" : "bin") : (sourceName as NSString).pathExtension
      let id = UUID().uuidString
      let fileName = "dive-log-\(id).\(suffix)"
      let destination = container.appendingPathComponent(fileName)
      do {
        if let url = item as? URL {
          let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
          if (attributes[.size] as? NSNumber)?.intValue ?? 0 > 20 * 1024 * 1024 { throw NSError(domain: "CalyMobSuuntoShare", code: 3, userInfo: [NSLocalizedDescriptionKey: "The file exceeds 20 MB."]) }
          try FileManager.default.copyItem(at: url, to: destination)
        } else if let data = item as? Data {
          if data.count > 20 * 1024 * 1024 { throw NSError(domain: "CalyMobSuuntoShare", code: 3, userInfo: [NSLocalizedDescriptionKey: "The file exceeds 20 MB."]) }
          try data.write(to: destination, options: .atomic)
        } else { throw NSError(domain: "CalyMobSuuntoShare", code: 4, userInfo: [NSLocalizedDescriptionKey: "Unsupported dive-log item."]) }
        let manifestURL = container.appendingPathComponent(self.manifestName)
        // Coordinate with a running host app or another share extension before
        // read-modify-write, preventing lost handoff names.
        var coordinationError: NSError?
        var manifestError: Error?
        NSFileCoordinator().coordinate(writingItemAt: manifestURL, options: .forMerging, error: &coordinationError) { url in
          do {
            let existing: [InboxItem]
            if FileManager.default.fileExists(atPath: url.path) {
              existing = try JSONDecoder().decode([InboxItem].self, from: Data(contentsOf: url))
            } else {
              existing = []
            }
            try JSONEncoder().encode(existing + [InboxItem(id: id, storedName: fileName, originalName: sourceName, uti: type.identifier)]).write(to: url, options: .atomic)
          } catch {
            manifestError = error
          }
        }
        if let coordinationError { throw coordinationError }
        if let manifestError { throw manifestError }
        self.extensionContext?.completeRequest(returningItems: nil)
      } catch { self.extensionContext?.cancelRequest(withError: error) }
    }
  }
}
