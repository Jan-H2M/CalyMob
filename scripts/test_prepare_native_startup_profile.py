import pathlib
import plistlib
import tempfile
import unittest

from prepare_native_startup_profile import sanitize


class NativeProfileConfigurationTest(unittest.TestCase):
    def test_replaces_all_production_config_and_capabilities(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            for name in ['ios/Runner', 'ios/Runner.xcodeproj', 'ios/ShareExtension']:
                (root / name).mkdir(parents=True)
            project = root / 'ios/Runner.xcodeproj/project.pbxproj'
            project.write_text('be.calypsodc.calymob be.calypsodc.calymob.SuuntoShare')
            (root / 'ios/Runner/Info.plist').write_bytes(plistlib.dumps({
                'CFBundleURLTypes': [{'CFBundleURLSchemes': ['calymob']}],
                'CFBundleDocumentTypes': [{'CFBundleTypeName': 'Dive file'}],
                'UTImportedTypeDeclarations': [{'UTTypeIdentifier': 'production'}],
                'UIBackgroundModes': ['remote-notification'],
            }))
            (root / 'ios/ShareExtension/Info.plist').write_bytes(plistlib.dumps({
                'CFBundleDisplayName': 'CalyMob',
                'NSExtension': {'NSExtensionAttributes': {
                    'NSExtensionActivationRule': 'TRUEPREDICATE'}},
            }))
            (root / 'ios/Runner/GoogleService-Info.plist').write_bytes(
                plistlib.dumps({'PROJECT_ID': 'production', 'API_KEY': 'old-key'}))
            sanitize(root)
            config = plistlib.loads((root / 'ios/Runner/GoogleService-Info.plist').read_bytes())
            self.assertEqual(config['PROJECT_ID'], 'demo-calymob-startup')
            self.assertEqual(config['API_KEY'], 'fake-api-key')
            self.assertNotIn('old-key', str(config))
            self.assertEqual(project.read_text(),
                'be.calypsodc.calymob.startupprofile be.calypsodc.calymob.startupprofile.SuuntoShare')
            info = plistlib.loads((root / 'ios/Runner/Info.plist').read_bytes())
            self.assertEqual(info['CalyMobFlutterTarget'], '$(FLUTTER_TARGET)')
            for key in ['CFBundleURLTypes', 'CFBundleDocumentTypes',
                        'UTImportedTypeDeclarations', 'UIBackgroundModes']:
                self.assertNotIn(key, info)
            extension = plistlib.loads((root / 'ios/ShareExtension/Info.plist').read_bytes())
            self.assertEqual(extension['CFBundleDisplayName'], 'Startup DEV (disabled)')
            self.assertEqual(extension['NSExtension']['NSExtensionAttributes'][
                'NSExtensionActivationRule'], 'FALSEPREDICATE')
            self.assertFalse(info['FirebaseDataCollectionDefaultEnabled'])
            self.assertFalse(info['FirebaseCrashlyticsCollectionEnabled'])
            self.assertFalse(info['FirebaseMessagingAutoInitEnabled'])
            self.assertFalse(info['FIREBASE_ANALYTICS_COLLECTION_ENABLED'])
            self.assertTrue(info['FIREBASE_ANALYTICS_COLLECTION_DEACTIVATED'])
            for name in ['ios/Runner/Runner.entitlements',
                         'ios/ShareExtension/CalyMobSuuntoShare.entitlements']:
                self.assertEqual(plistlib.loads((root / name).read_bytes()), {})


if __name__ == '__main__':
    unittest.main()
