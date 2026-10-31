import Flutter
import UIKit
import UserNotifications
import os.signpost

enum SuuntoSharePasteboard {
  static let type = "be.calypsodc.calymob.suunto-share-inbox"
  struct Item: Codable { let id: String; let originalName: String; let uti: String; let base64Bytes: String }

  static func queue() throws -> [Item] {
    let board = UIPasteboard.general
    guard board.contains(pasteboardTypes: [type]), let data = board.data(forPasteboardType: type) else { return [] }
    return try JSONDecoder().decode([Item].self, from: data)
  }

  static func replace(_ items: [Item]) throws {
    let data = try JSONEncoder().encode(items)
    UIPasteboard.general.setItems([[type: data]], options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(24 * 60 * 60)])
  }
  static func enqueue(bytes: Data, originalName: String, uti: String) throws {
    var items = try queue()
    items.append(Item(id: UUID().uuidString, originalName: originalName, uti: uti, base64Bytes: bytes.base64EncodedString()))
    try replace(items)
  }
}

@main
@objc class AppDelegate: FlutterAppDelegate {
  private let startupLog = OSLog(subsystem: "be.calypsodc.calymob", category: "Startup")
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Let Flutter's firebase_core handle Firebase initialization
    // Measure the whole registrant, rather than interpreting Sentry's
    // process-start-to-Sentry-registration interval as plugin execution time.
    let registrationStart = Date().timeIntervalSince1970
    let registrationClock = ProcessInfo.processInfo.systemUptime
    os_signpost(.begin, log: startupLog, name: "GeneratedPluginRegistration")
    GeneratedPluginRegistrant.register(with: self)
    let registrationDuration = ProcessInfo.processInfo.systemUptime - registrationClock
    os_signpost(.end, log: startupLog, name: "GeneratedPluginRegistration")
    let controller = window?.rootViewController as! FlutterViewController
    let startup = FlutterMethodChannel(name: "calymob/startup", binaryMessenger: controller.binaryMessenger)
    startup.setMethodCallHandler { call, result in
      guard call.method == "getTimings" else { result(FlutterMethodNotImplemented); return }
      result([
        "registrationStartUs": registrationStart * 1_000_000,
        "registrationEndUs": (registrationStart + registrationDuration) * 1_000_000,
        "registrationDurationMs": registrationDuration * 1000
      ])
    }
    let inbox = FlutterMethodChannel(name: "calymob/suunto_share_inbox", binaryMessenger: controller.binaryMessenger)
    inbox.setMethodCallHandler { call, result in
      struct InboxItem: Codable { let id: String; let storedName: String; let originalName: String; let uti: String }
      guard ["consume", "ack", "discard", "hasPending"].contains(call.method) else { result(FlutterMethodNotImplemented); return }
      if call.method == "hasPending" {
        let groupHasItems: Bool = {
          guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.calypso.calymob"),
                let data = try? Data(contentsOf: container.appendingPathComponent("suunto-import-manifest.json")) else { return false }
          return ((try? JSONDecoder().decode([InboxItem].self, from: data))?.isEmpty == false)
        }()
        let pasteboardHasItems = (try? SuuntoSharePasteboard.queue().isEmpty == false) ?? false
        result(groupHasItems || pasteboardHasItems)
        return
      }
      let group = "group.com.calypso.calymob"
      var resultValue: [String: Any]?
      var handledAppGroup = false
      var coordinationError: NSError?
      var manifestError: Error?
      if let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) {
      let manifest = container.appendingPathComponent("suunto-import-manifest.json")
      NSFileCoordinator().coordinate(writingItemAt: manifest, options: .forMerging, error: &coordinationError) { url in
        do {
          guard FileManager.default.fileExists(atPath: url.path) else { return }
          let manifestData = try Data(contentsOf: url)
          var items: [InboxItem]
          do {
            items = try JSONDecoder().decode([InboxItem].self, from: manifestData)
          } catch {
            // Upgrade an inbox written by the original name-only bridge.
            let names = try JSONDecoder().decode([String].self, from: manifestData)
            items = names.map { InboxItem(id: $0, storedName: $0, originalName: $0, uti: "") }
          }
          guard !items.isEmpty else { return }
          if call.method == "consume" {
            let item = items[0]
            let bytes = try Data(contentsOf: container.appendingPathComponent(item.storedName))
            resultValue = ["id": item.id, "filename": item.originalName, "uti": item.uti, "bytes": FlutterStandardTypedData(bytes: bytes)]
            handledAppGroup = true
          } else {
            guard let id = call.arguments as? String, let index = items.firstIndex(where: { $0.id == id }) else { return }
            let item = items[index]
            let payloadURL = container.appendingPathComponent(item.storedName)
            // Preserve the manifest record if deletion fails, so a later retry can
            // still clean up the shared file. A missing file is already clean.
            if FileManager.default.fileExists(atPath: payloadURL.path) {
              try FileManager.default.removeItem(at: payloadURL)
            }
            items.remove(at: index)
            try JSONEncoder().encode(items).write(to: url, options: .atomic)
            handledAppGroup = true
          }
        } catch {
          manifestError = error
        }
      }
      }
      if let coordinationError {
        result(FlutterError(code: "share_inbox_read_failed", message: coordinationError.localizedDescription, details: nil))
        return
      }
      if let manifestError {
        result(FlutterError(code: "share_inbox_read_failed", message: manifestError.localizedDescription, details: nil))
        return
      }
      if !handledAppGroup {
        do {
          var queue = try SuuntoSharePasteboard.queue()
          if call.method == "consume" {
            if let item = queue.first, let bytes = Data(base64Encoded: item.base64Bytes) {
              resultValue = ["id": item.id, "filename": item.originalName, "uti": item.uti, "bytes": FlutterStandardTypedData(bytes: bytes)]
            }
          } else if let id = call.arguments as? String, let index = queue.firstIndex(where: { $0.id == id }) {
            queue.remove(at: index)
            try SuuntoSharePasteboard.replace(queue)
          }
        } catch {
          result(FlutterError(code: "share_inbox_read_failed", message: error.localizedDescription, details: nil))
          return
        }
      }
      result(resultValue)
    }

    // Set up push notifications after Flutter plugins are registered
    if #available(iOS 10.0, *) {
      UNUserNotificationCenter.current().delegate = self

      // Dart requests permission once, after its first frame and launch-payload
      // delivery. Do not present a second dialog during native startup.
    }

    // Register for remote notifications
    application.registerForRemoteNotifications()

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func application(_ application: UIApplication,
                            didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    print("📱 APNs token received: \(deviceToken.map { String(format: "%02.2hhx", $0) }.joined())")
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  override func application(_ app: UIApplication, open url: URL,
                            options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
    if url.scheme == "calymob" && url.host == "dive-share-inbox" {
      return super.application(app, open: url, options: options)
    }
    guard url.isFileURL else { return super.application(app, open: url, options: options) }
    let accessed = url.startAccessingSecurityScopedResource()
    defer { if accessed { url.stopAccessingSecurityScopedResource() } }
    do {
      let bytes = try Data(contentsOf: url)
      guard bytes.count <= 20 * 1024 * 1024 else { return false }
      try SuuntoSharePasteboard.enqueue(bytes: bytes, originalName: url.lastPathComponent, uti: "public.data")
      if url.path.contains("/Documents/Inbox/") { try? FileManager.default.removeItem(at: url) }
      if let inboxURL = URL(string: "calymob://dive-share-inbox") { _ = super.application(app, open: inboxURL, options: options) }
      return true
    } catch { return false }
  }

  // Handle APNs registration failure
  override func application(_ application: UIApplication,
                            didFailToRegisterForRemoteNotificationsWithError error: Error) {
    print("❌ Failed to register for remote notifications: \(error.localizedDescription)")
  }
}
