# CALYMOB-STARTUP 1031-1745

Scope: performance-only PR against `dev`. No production, version bump, Firebase
deployment, Xcode Cloud run, archive, TestFlight or store distribution.
Baseline source: `docs/sentry-calymob-25-analysis-2026-10-31.md` on `dev`.

## Baseline and limits

Jan supplied app-start p95 **16.8 s** and warm “App start to plugin registration”
p95 **13 s** for [this trace](https://h2mai.sentry.io/explore/traces/trace/09934c7695ed45c8972cb31e81830f3e).
The private trace was inaccessible here. Sample counts, matched device cohorts
and per-launch values remain unverified. Do not subtract those percentiles.

Sentry Flutter 9.14.0 defines that native interval from process/app-start to
entry into Sentry's native registration, including engine startup and preceding
plugins. It does not identify a 13-second plugin or a Dart await. The locked SDK
and generated plugin order are unchanged. Native lazy registration/removal is
deferred until a device profile identifies a specific safe candidate.

Before: Sentry → Firebase → local preferences → locale → notification channel /
local plugin / launch details / permission / FCM token → deep links → `runApp`.

After: Sentry → **parallel** Firebase + local preferences + locale → `runApp`
and first framework frame → independent notifications and deep links. Providers
still require completed Firebase initialization. Bootstrap errors render an
error shell instead of constructing Firebase-dependent providers.

Notification initialization no longer requests permission or warms an unused
FCM token. One FCM permission path runs after the frame and local launch-payload
delivery; native AppDelegate and local-notification initialization do not prompt.
Existing authorizations avoid a second token/device write. A newly granted
permission retries registration for the currently authenticated member. Android
13+ also requests from its initial `denied` status; iOS denial does not re-prompt.
Initial deep links now arrive after the app's listeners and Navigator exist.

## Measurements added

Sentry transactions use operation `app.startup`; timestamps are captured during
work and exported asynchronously afterwards, with explicit failure statuses.
No identifiers, tokens, payloads or document contents are added to timing spans.

| Transaction | Measured spans |
| --- | --- |
| `calymob.startup.dart` | `sentry.initialize`, `firebase.initialize`, `read_tracker.initialize`, `locale.initialize`, `flutter.first_frame`, `dart.main_to_first_frame` |
| `calymob.startup.auth` | `auth.first_state`: provider subscription to first restored auth state (including signed-out); timeout is explicitly failed after 30 s |
| `calymob.startup.notifications` | `notifications.local_initialize`, `notifications.permission`, and new-grant `notifications.token_registration` |
| `calymob.notifications.token` | `messaging.get_token`, including auth-driven token acquisition |
| `calymob.startup.deep_links` | `deep_links.initialize` |
| `calymob.startup.native_plugins` | `native.generated_plugin_registration`: actual generated registrant entry-to-return, with monotonic `duration_ms` |

Native timings come from a small `calymob/startup` method channel queried after
the frame. Instruments also receives the `GeneratedPluginRegistration`
signpost under subsystem `be.calypsodc.calymob`, category `Startup`.
Native and Dart timings are separate transactions, not children falsely
backdated before Dart `main`. Their sampled rates are independent.

`flutter.first_frame` ends at the framework's `endOfFrame`, not GPU presentation
or authenticated usable content. `auth.first_state` is SDK restoration, not a
completed member load or biometric login. Existing Sentry native app-start
metrics and Instruments remain necessary for end-to-end launch measurement.
Optional permission spans include human response time. A span whose await never
settles is not exported until it settles; it cannot hold the first frame.

Normal debug reporting stays disabled. A deliberately opted-in **profile** run
with both `ENV=dev` and `STARTUP_PROFILING=true` samples traces at 100%; production
sampling remains 20%. This flag changes telemetry only: the ordinary app's
Firebase configuration still points at `calycompta`. Do not run the ordinary
entrypoint as a supposed isolated DEV environment.

## Automated verification

Run the same focused suite as `.github/workflows/startup-performance.yml`:

```sh
flutter pub get --enforce-lockfile
flutter test test/services/startup_trace_test.dart \
  test/services/notification_startup_test.dart \
  test/services/deep_link_startup_test.dart \
  test/services/notification_preference_test.dart \
  test/services/notification_navigation_service_test.dart \
  test/services/auth_service_test.dart \
  test/services/local_read_tracker_export_test.dart
flutter analyze --no-pub lib/main.dart lib/providers/auth_provider.dart \
  lib/services/startup_trace.dart lib/services/notification_service.dart \
  lib/services/deep_link_service.dart tool/startup_profile/main.dart \
  test/services/startup_trace_test.dart \
  test/services/notification_startup_test.dart \
  test/services/deep_link_startup_test.dart
python3 -m unittest discover -s scripts -p test_prepare_native_startup_profile.py
git diff --exit-code -- pubspec.lock
```

These checks use fictional data and local fakes. Tests verify that all critical
awaits start together, Firebase gates readiness, errors retain failed timing,
Sentry receives original timestamps exactly once, a stalled optional initializer
does not stop a rendered frame or deep links, and notification payload delivery
precedes any permission/token request. They are not phone timing measurements.

## Exact physical-device procedure for Jan

Use a development iPhone. The preparation script creates a separate detached
worktree, synthetic `demo-calymob-startup` native Firebase configuration, disabled
native collection/auto-init, empty capabilities, no URL/document handlers, a
disabled share extension, and unique `.startupprofile`
bundle IDs. It does not overwrite the installed production app. AppDelegate
checks the expanded Flutter target, demo config and collection flags BEFORE
plugin registration; an ordinary checkout refuses to launch this profiling
entrypoint. This guard is needed because Firebase Core configures the bundled
native Firebase app during registration, before Dart starts. Use USB, leave the
phone unlocked, and enable Developer Mode. Keep the same device, iOS version,
power/thermal state and build mode throughout the comparison.

1. In this PR's clean DEV worktree, verify `hostname`, `pwd`, `git status` and
   `git rev-parse HEAD`. On the Mini, Flutter is `/Users/jan/flutter/bin/flutter`;
   on the MacBook, find Flutter with `command -v flutter` instead of copying a
   Mini path. Run `flutter devices` and note the physical device ID.
2. Prepare a new isolated worktree, then install the **native-only** target
   from THAT directory. It draws a static local shell and reads the timing
   bridge. Generated native plugins, including demo-configured Firebase Core,
   still register; no ordinary Dart app or auth/notification/deep-link/Sentry
   service starts. Keep airplane mode/Wi-Fi off for consistent offline timings;
   configuration isolation, not airplane mode, prevents production access:

   ```sh
   python3 scripts/prepare_native_startup_profile.py /tmp/calymob-native-profile-candidate
   cd /tmp/calymob-native-profile-candidate
   flutter pub get --enforce-lockfile
   flutter run --profile -d '<PHYSICAL_DEVICE_ID>' \
     --target=tool/startup_profile/main.dart \
     --dart-define=ENV=dev --dart-define=STARTUP_PROFILING=true
   ```

   If signing is unavailable, stop at that error; do not use an archive or cloud
   build as a substitute. After the shell appears, press `d` to detach. Do not
   press Archive, distribute, or start Xcode Cloud.
3. Open `ios/Runner.xcworkspace` in Xcode. Select **Runner** and that physical
   device. Under **Product → Scheme → Edit Scheme → Profile**, confirm build
   configuration **Profile**. Keep the Flutter target configured by step 2.
   Choose **Product → Profile** (⌘I), then **App Launch** in Instruments. Choose
   the installed Runner app and record a new process launch, not an attachment
   to an already-running process. Add **Time Profiler**, **Points of Interest**
   / **os_signpost**, and **dyld Activity** if not already present.
4. Record launch → shell → stop. In Points of Interest filter category `Startup`
   and select `GeneratedPluginRegistration`. Inspect its start, end and duration.
   In Time Profiler select that exact interval, select the main thread, use
   **Separate by Thread** / **Invert Call Tree**, then inspect the heaviest
   `registerWithRegistrar:`, `register(with:)`, Firebase, camera/scanner,
   notification, storage or biometric stacks. Also inspect time before the
   signpost: dyld/static initialization, UIKit and Flutter engine work. Export
   the `.trace` file; record device, OS, source revision and launch type beside it.
5. If the aggregate interval is slow but individual plugin attribution remains
   unclear, set Xcode breakpoints immediately before and after
   `GeneratedPluginRegistrant.register(with: self)` to locate the generated
   `GeneratedPluginRegistrant.m`. Inspect its actual ordered calls. Use Time
   Profiler samples on those symbols; for exact per-plugin intervals, add local
   paired signposts around one suspect call and repeat. Generated-file edits
   are temporary and must not be committed. Do not reorder or omit Sentry to
   change its timestamp: that would change the metric's meaning.
6. Capture at least 20 repeated **terminated-process** launches with identical
   conditions and a separate cold/post-reboot set; keep warm process launches
   separate from background resumes. Record prewarming when Instruments shows
   it. Run the baseline and candidate alternately to reduce thermal/order bias.
   Twenty observations are diagnostic, not a reliable field p95.

For a baseline native capture, run the same preparation script from the clean
PR checkout with `--revision <PR_BASE_COMMIT>` and a different new destination
(`/tmp/calymob-native-profile-baseline`), then repeat step 2 from that destination.
Find the base with `gh pr view 189 --json baseRefOid`. The script copies the same
current diagnostic delegate and shell into both native dependency sets. Both
use identical demo configuration, omit the native permission prompt and explicit
AppDelegate APNs registration (Firebase Messaging can still register with APNs
natively); therefore
this isolates engine/plugin costs and does not measure the permission change or
full app behavior. Keep both diagnostic worktrees uncommitted. Do not copy their
synthetic config into the actual app branches.

This native-only shell does **not** validate Dart app startup or real auth/FCM.
A full native-app DEV backend target does not currently exist in this repository (the new shell is native-only);
the existing isolated DEV target is a credentialless web client lab. Therefore
the full-app Sentry before/after comparison requires a separately configured,
verified non-production native app/backend. Do not substitute `ENV=dev` alone.
On that target, repeat cold and warm launches with the same devices and compare
counts/p50/p95 for app-start, Dart-to-frame, Firebase, auth restoration and
time-to-usable-content; test signed-out/restored sessions, slow/offline network,
permission accepted/denied/pending, remote/local notification cold launch,
password reset/payment return, and normal resume independently.

Procedure references: [Apple launch-time guidance](https://developer.apple.com/documentation/xcode/reducing-your-app-s-launch-time),
[Apple Instruments profiling](https://help.apple.com/xcode/mac/current/en.lproj/devcc15e6912.html),
[Flutter physical-device/profile guidance](https://docs.flutter.dev/perf/ui-performance).

## Before / after evidence

| Measure | Before | After |
| --- | --- | --- |
| Field app-start p95 | 16.8 s, user supplied | Not yet measured on a matched device/cohort |
| Warm process-start → Sentry plugin entry p95 | 13 s, user supplied | Not yet measured; Dart changes do not directly shorten this native interval |
| Pre-frame await topology | Serial prerequisites + permission/token + deep links | Parallel prerequisites; optional services after frame (regression-tested) |
| Native registrant duration | Unmeasured | New signpost/bridge ready; requires physical capture |

No percentage or seconds saved is claimed from unit tests or simulator builds.
