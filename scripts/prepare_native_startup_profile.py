#!/usr/bin/env python3
"""Prepare an uncommitted, isolated native profiling worktree; never run/build it."""
import argparse
import pathlib
import plistlib
import subprocess


def sanitize(root):
    root = pathlib.Path(root)
    project = root / 'ios/Runner.xcodeproj/project.pbxproj'
    project.write_text(project.read_text().replace(
        'be.calypsodc.calymob', 'be.calypsodc.calymob.startupprofile'))
    config = {
        'API_KEY': 'fake-api-key', 'GCM_SENDER_ID': '1234567890',
        'PLIST_VERSION': '1', 'BUNDLE_ID': 'be.calypsodc.calymob.startupprofile',
        'PROJECT_ID': 'demo-calymob-startup',
        'GOOGLE_APP_ID': '1:1234567890:ios:0123456789abcdef012345',
        'IS_ANALYTICS_ENABLED': False, 'IS_GCM_ENABLED': False,
        'IS_ADS_ENABLED': False, 'IS_SIGNIN_ENABLED': False,
        'IS_APPINVITE_ENABLED': False,
    }
    (root / 'ios/Runner/GoogleService-Info.plist').write_bytes(plistlib.dumps(config))
    info_path = root / 'ios/Runner/Info.plist'
    info = plistlib.loads(info_path.read_bytes())
    info.update({
        'CalyMobFlutterTarget': '$(FLUTTER_TARGET)',
        'CFBundleDisplayName': 'CalyMob Startup DEV',
        'FirebaseDataCollectionDefaultEnabled': False,
        'FIREBASE_ANALYTICS_COLLECTION_ENABLED': False,
        'FIREBASE_ANALYTICS_COLLECTION_DEACTIVATED': True,
        'FirebaseCrashlyticsCollectionEnabled': False,
        'FirebaseMessagingAutoInitEnabled': False,
    })
    info_path.write_bytes(plistlib.dumps(info))
    # This target does not need production APNs, keychain or app-group access.
    for name in ['ios/Runner/Runner.entitlements',
                 'ios/ShareExtension/CalyMobSuuntoShare.entitlements']:
        (root / name).write_bytes(plistlib.dumps({}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=pathlib.Path)
    parser.add_argument('--revision', default='HEAD')
    args = parser.parse_args()
    source = pathlib.Path(__file__).resolve().parents[1]
    destination = args.destination.expanduser().resolve()
    if destination.exists():
        parser.error('destination must not exist; existing worktrees are never overwritten')
    # Only commit objects; no shell interpolation or arbitrary git options.
    revision = subprocess.check_output([
        'git', '-C', str(source), 'rev-parse', '--verify', '--end-of-options',
        args.revision + '^{commit}',
    ], text=True).strip()
    subprocess.run(['git', '-C', str(source), 'worktree', 'add', '--detach',
                    str(destination), revision], check=True)
    # Baselines may predate the harness and pre-registration guard. Use the
    # same diagnostic delegate/target on both, preserving plugin dependency sets.
    for name in ['ios/Runner/AppDelegate.swift', 'tool/startup_profile/main.dart']:
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(subprocess.check_output([
            'git', '-C', str(source), 'show', 'HEAD:' + name,
        ]))
    sanitize(destination)
    print(f'Prepared synthetic native-only profile: {destination}')
    print(f'Comparison source: {revision}')
    print('No build, device launch, Firebase deployment, or store action performed.')
    print('Keep this diagnostic worktree uncommitted. Follow docs/CALYMOB_STARTUP_1031_1745.md.')


if __name__ == '__main__':
    main()
