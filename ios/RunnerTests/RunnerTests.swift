import Flutter
import UIKit
import XCTest

class RunnerTests: XCTestCase {

  func testProductionBundleConfiguration() throws {
    let bundle = Bundle.main
    XCTAssertEqual(bundle.bundleIdentifier, "be.calypsodc.calymob")
    XCTAssertFalse((bundle.object(forInfoDictionaryKey: "NSCameraUsageDescription") as? String ?? "").isEmpty)
    XCTAssertEqual(bundle.object(forInfoDictionaryKey: "ITSAppUsesNonExemptEncryption") as? Bool, false)

    let url = try XCTUnwrap(bundle.url(forResource: "GoogleService-Info", withExtension: "plist"))
    let data = try Data(contentsOf: url)
    let config = try XCTUnwrap(PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])
    XCTAssertEqual(config["PROJECT_ID"] as? String, "calycompta")
    XCTAssertEqual(config["BUNDLE_ID"] as? String, "be.calypsodc.calymob")
    XCTAssertEqual(config["GOOGLE_APP_ID"] as? String, "1:328464166969:ios:59423f69116580ea8f5de8")
  }

}
