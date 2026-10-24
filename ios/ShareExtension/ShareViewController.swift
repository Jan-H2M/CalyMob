import Social
import UniformTypeIdentifiers
import UIKit

/// App Group is preferred; the local-only pasteboard queue is the entitlement-free fallback.
final class ShareViewController: SLComposeServiceViewController {
  private let appGroup = "group.com.calypso.calymob"
  private let manifestName = "suunto-import-manifest.json"
  private let pasteboardType = "be.calypsodc.calymob.suunto-share-inbox"
  private var hasStartedHandoff = false
  private struct InboxItem: Codable { let id: String; let storedName: String; let originalName: String; let uti: String }
  private struct PasteboardItem: Codable { let id: String; let originalName: String; let uti: String; let base64Bytes: String }

  override func isContentValid() -> Bool { true }
  override func didSelectCancel() { hasStartedHandoff = true; extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError)) }
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    if !hasStartedHandoff { didSelectPost() }
  }
  override func didSelectPost() {
    guard !hasStartedHandoff else { return }
    hasStartedHandoff = true
    let accepted = [UTType.json, UTType.xml, UTType.zip, UTType.data]
    guard let item = extensionContext?.inputItems.first as? NSExtensionItem,
          let provider = item.attachments?.first(where: { provider in accepted.contains(where: { provider.hasItemConformingToTypeIdentifier($0.identifier) }) }),
          let type = accepted.first(where: { provider.hasItemConformingToTypeIdentifier($0.identifier) }) else {
      extensionContext?.cancelRequest(withError: NSError(domain: "CalyMobSuuntoShare", code: 1, userInfo: [NSLocalizedDescriptionKey: "A supported dive-log file is required."]))
      return
    }
    provider.loadItem(forTypeIdentifier: type.identifier, options: nil) { [weak self] item, _ in
      guard let self else { return }
      do {
        let bytes: Data
        if let url = item as? URL {
          let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
          if (attributes[.size] as? NSNumber)?.intValue ?? 0 > 20 * 1024 * 1024 { throw NSError(domain: "CalyMobSuuntoShare", code: 3, userInfo: [NSLocalizedDescriptionKey: "The file exceeds 20 MB."]) }
          bytes = try Data(contentsOf: url)
        } else if let data = item as? Data {
          if data.count > 20 * 1024 * 1024 { throw NSError(domain: "CalyMobSuuntoShare", code: 3, userInfo: [NSLocalizedDescriptionKey: "The file exceeds 20 MB."]) }
          bytes = data
        } else { throw NSError(domain: "CalyMobSuuntoShare", code: 4, userInfo: [NSLocalizedDescriptionKey: "Unsupported dive-log item."]) }
        let originalName = (item as? URL)?.lastPathComponent ?? provider.suggestedName ?? "dive-log"
        let id = UUID().uuidString
        do {
          try self.enqueueAppGroup(bytes: bytes, id: id, originalName: originalName, uti: type.identifier)
        } catch {
          try self.enqueuePasteboard(bytes: bytes, id: id, originalName: originalName, uti: type.identifier)
        }
        self.openHost()
        self.extensionContext?.completeRequest(returningItems: nil)
      } catch { self.extensionContext?.cancelRequest(withError: error) }
    }
  }

  private func openHost() {
    guard let url = URL(string: "calymob://dive-share-inbox") else { return }
    extensionContext?.open(url, completionHandler: nil)
    var responder: UIResponder? = self
    while let current = responder {
      if let application = current as? UIApplication {
        application.open(url, options: [:], completionHandler: nil)
        break
      }
      responder = current.next
    }
  }

  private func enqueueAppGroup(bytes: Data, id: String, originalName: String, uti: String) throws {
    guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
      throw NSError(domain: "CalyMobSuuntoShare", code: 2, userInfo: [NSLocalizedDescriptionKey: "The secure CalyMob inbox is unavailable."])
    }
    let suffix = (originalName as NSString).pathExtension.isEmpty ? "bin" : (originalName as NSString).pathExtension
    let storedName = "dive-log-\(id).\(suffix)"
    try bytes.write(to: container.appendingPathComponent(storedName), options: .atomic)
    let manifestURL = container.appendingPathComponent(manifestName)
    var coordinationError: NSError?
    var manifestError: Error?
    NSFileCoordinator().coordinate(writingItemAt: manifestURL, options: .forMerging, error: &coordinationError) { url in
      do {
        let existing = FileManager.default.fileExists(atPath: url.path)
          ? try JSONDecoder().decode([InboxItem].self, from: Data(contentsOf: url)) : []
        try JSONEncoder().encode(existing + [InboxItem(id: id, storedName: storedName, originalName: originalName, uti: uti)]).write(to: url, options: .atomic)
      } catch { manifestError = error }
    }
    if let coordinationError { throw coordinationError }
    if let manifestError { throw manifestError }
  }

  private func enqueuePasteboard(bytes: Data, id: String, originalName: String, uti: String) throws {
    let pasteboard = UIPasteboard.general
    var queue: [PasteboardItem] = []
    if pasteboard.contains(pasteboardTypes: [pasteboardType]), let data = pasteboard.data(forPasteboardType: pasteboardType) {
      queue = try JSONDecoder().decode([PasteboardItem].self, from: data)
    }
    queue.append(PasteboardItem(id: id, originalName: originalName, uti: uti, base64Bytes: bytes.base64EncodedString()))
    pasteboard.setItems([[pasteboardType: try JSONEncoder().encode(queue)]], options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(24 * 60 * 60)])
  }
}
