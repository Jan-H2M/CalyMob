import Social
import UniformTypeIdentifiers

/// Share-extension implementation for the `CalyMobSuuntoShare` target.
/// The target is intentionally dependency-free: it copies a JSON file into
/// the App Group inbox, after which the Flutter host owns parsing/deletion.
final class ShareViewController: SLComposeServiceViewController {
  private let appGroup = "group.com.calypso.calymob"
  private let manifestName = "suunto-import-manifest.json"

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
      let fileName = "suunto-\(UUID().uuidString).json"
      let destination = container.appendingPathComponent(fileName)
      do {
        if let url = item as? URL {
          let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
          if (attributes[.size] as? NSNumber)?.intValue ?? 0 > 20 * 1024 * 1024 { throw NSError(domain: "CalyMobSuuntoShare", code: 3, userInfo: [NSLocalizedDescriptionKey: "The file exceeds 20 MB."]) }
          try FileManager.default.copyItem(at: url, to: destination)
        } else if let data = item as? Data {
          if data.count > 20 * 1024 * 1024 { throw NSError(domain: "CalyMobSuuntoShare", code: 3, userInfo: [NSLocalizedDescriptionKey: "The file exceeds 20 MB."]) }
          try data.write(to: destination, options: .atomic)
        } else { throw NSError(domain: "CalyMobSuuntoShare", code: 4, userInfo: [NSLocalizedDescriptionKey: "Unsupported JSON item."]) }
        let manifestURL = container.appendingPathComponent(self.manifestName)
        // Coordinate with a running host app or another share extension before
        // read-modify-write, preventing lost handoff names.
        var coordinationError: NSError?
        NSFileCoordinator().coordinate(writingItemAt: manifestURL, options: .forMerging, error: &coordinationError) { url in
          let existing = (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode([String].self, from: $0) } ?? []
          try? JSONEncoder().encode(existing + [fileName]).write(to: url, options: .atomic)
        }
        if let coordinationError { throw coordinationError }
        self.extensionContext?.completeRequest(returningItems: nil)
      } catch { self.extensionContext?.cancelRequest(withError: error) }
    }
  }
}
