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
      guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { result(nil); return }
      let file = container.appendingPathComponent("suunto-import-inbox.json")
      guard let bytes = try? Data(contentsOf: file) else { result(nil); return }
      // Consume first, then delete: the extension cannot leave a persistent copy.
      try? FileManager.default.removeItem(at: file)
      result(FlutterStandardTypedData(bytes: bytes))
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
