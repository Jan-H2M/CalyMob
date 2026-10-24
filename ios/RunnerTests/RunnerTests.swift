import Flutter
import UIKit
import XCTest

class RunnerTests: XCTestCase {

  func testProductionBundleConfiguration() throws {
    let bundle = Bundle.main
    XCTAssertEqual(bundle.bundleIdentifier, "be.calypsodc.calymob")
    XCTAssertFalse((bundle.object(forInfoDictionaryKey: "NSCameraUsageDescription") as? String ?? "").isEmpty)
    XCTAssertEqual(bundle.object(forInfoDictionaryKey: "ITSAppUsesNonExemptEncryption") as? Bool, false)

    // main.dart initializes Firebase with DefaultFirebaseOptions.ios. Its exact
    // project/app/bundle identity is checked by firebase_options_test.dart;
    // this app deliberately does not bundle a GoogleService-Info.plist.
  }

}
