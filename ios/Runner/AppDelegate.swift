import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Let Flutter's firebase_core handle Firebase initialization
    GeneratedPluginRegistrant.register(with: self)
    let controller = window?.rootViewController as! FlutterViewController
    let inbox = FlutterMethodChannel(name: "calymob/suunto_share_inbox", binaryMessenger: controller.binaryMessenger)
    inbox.setMethodCallHandler { call, result in
      guard call.method == "consume" else { result(FlutterMethodNotImplemented); return }
      let group = "group.com.calypso.calymob"
      guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
        result(FlutterError(code: "share_inbox_unavailable", message: "The CalyMob share inbox is unavailable.", details: nil))
        return
      }
      let manifest = container.appendingPathComponent("suunto-import-manifest.json")
      var resultBytes: Data?
      var coordinationError: NSError?
      var manifestError: Error?
      NSFileCoordinator().coordinate(writingItemAt: manifest, options: .forMerging, error: &coordinationError) { url in
        do {
          let manifestData = try Data(contentsOf: url)
          var names = try JSONDecoder().decode([String].self, from: manifestData)
          guard !names.isEmpty else { return }
          let name = names.removeFirst()
          let file = container.appendingPathComponent(name)
          let bytes = try Data(contentsOf: file)
          try JSONEncoder().encode(names).write(to: url, options: .atomic)
          try FileManager.default.removeItem(at: file)
          resultBytes = bytes
        } catch {
          manifestError = error
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
      guard let resultBytes else { result(nil); return }
      result(FlutterStandardTypedData(bytes: resultBytes))
    }

    // Set up push notifications after Flutter plugins are registered
    if #available(iOS 10.0, *) {
      UNUserNotificationCenter.current().delegate = self

      let authOptions: UNAuthorizationOptions = [.alert, .badge, .sound]
      UNUserNotificationCenter.current().requestAuthorization(
        options: authOptions,
        completionHandler: { _, _ in }
      )
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

  // Handle APNs registration failure
  override func application(_ application: UIApplication,
                            didFailToRegisterForRemoteNotificationsWithError error: Error) {
    print("❌ Failed to register for remote notifications: \(error.localizedDescription)")
  }
}
