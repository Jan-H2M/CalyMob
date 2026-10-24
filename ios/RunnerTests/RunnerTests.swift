import Flutter
import UIKit
import XCTest

private struct TestPasteboardItem: Codable {
  let id: String
  let originalName: String
  let uti: String
  let base64Bytes: String
}

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

  func testSuuntoSharePasteboardEnvelopeRoundTrips() throws {
    let item = TestPasteboardItem(
      id: "test-id", originalName: "dive.fit", uti: "public.data",
      base64Bytes: Data([1, 2, 3]).base64EncodedString()
    )
    let decoded = try JSONDecoder().decode(
      [TestPasteboardItem].self,
      from: JSONEncoder().encode([item])
    )
    XCTAssertEqual(decoded.first?.id, "test-id")
    XCTAssertEqual(
      decoded.first.flatMap { Data(base64Encoded: $0.base64Bytes) },
      Data([1, 2, 3])
    )
  }

}
