# CALYMOB-25 — document snapshot permission errors

Scope: app-side listener hardening on `dev`. No security rules, backend data,
version, signing, store or production changes. Startup work below is analysis only.

## Evidence and attribution

Jan supplied CALYMOB-25 as a `cloud_firestore/permission-denied` from
`MethodChannelDocumentReference.snapshots` (`method_channel_document_reference.dart:135`),
still occurring in iOS 27.0.1 / 1.28.0+537: 4 events / 3 users this week,
10 events / 6 users all-time. [Issue](https://h2mai.sentry.io/issues/CALYMOB-25).

PR #156 hardened `member_observations` **query** subscriptions. Its native stack
family differs from this issue's **document** subscription.

Direct retrieval of the private Sentry issue and trace was unavailable during this
audit. The available browser inventory exposed only an unverified account for
this H2M context, so no account or portal was changed. The figures above are
user-supplied evidence. Without the event's document path or route breadcrumbs,
the exact emitting document remains unconfirmed; the fixes address reproducible
failure mechanisms rather than claiming a proven production path.

## Confirmed defects and changes

1. `FeatureFlagService.listen()` discarded its subscription and omitted
   `onError`. Repeated calls leaked listeners; disposal could not stop them.
   All five feature-flag stream APIs now share an auth-scoped document source.
   The notifier cancels replaced/disposed listeners, contains errors and ignores
   stale generations. This legacy notifier method currently has no app caller;
   it is an unsafe API, not a proven source of this event.
2. `BoutiqueCurrentPaymentPanel` created `Future.error(error)` from its document
   listener's error callback. Between frames the future could fail before
   `FutureBuilder` subscribed, creating an unhandled exception from an otherwise
   handled stream. Its asynchronous reloads had the same observation gap.
   Document errors now set explicit unavailable state, remove the payable QR and
   block the email action. Display-load failures are observed immediately and
   represented as unavailable data. Deleted orders also fail closed. Listener
   replacement/disposal ignores stale generations.
3. `BoutiqueAccessService` forwarded a core document error but left its assignment
   polling subscription alive. A subsequent assignment result could emit access
   derived from stale flags/member data. Errors now cancel both core documents
   and assignment polling, and invalidate queued assignment callbacks. Access
   streams are bound to the requested authenticated UID.
4. Pool session detail ignored its document stream's errors and used the original
   session as fallback. It now shows an unavailable message on error, removes the
   stream when signed out and hides cached session actions.

The shared `authenticatedStream` subscribes through `idTokenChanges`: no
protected source starts while signed out; logout/account mismatch cancels the
previous source; token refresh retries a rejected source, including for the same
UID. Server rules remain authoritative. A permission error is explicit, and is
never converted into an OFF unread-rollout flag. The flag stream remains able to
recover on the next auth/token event.

## Complete document snapshot audit

All `.snapshots()` call sites under `lib` were inspected, including references
returned by helpers and document streams nested inside Rx combinations. Query
streams were distinguished by their receiver type. The table covers every
document source family (repeated feature-flag sources are consolidated now).

| Source / document | Subscription owner and failure handling |
| --- | --- |
| Feature flags: `settings/feature_flags`, five stream APIs | Changed: shared auth gate; retained notifier subscription with `onError`; widget streams use `StreamBuilder`; unread provider already handles unknown/error state and cancels on context changes. |
| Boutique access: flags + private member | Changed: exact UID auth gate; permission error invalidates assignments and cancels combined sources; route guard fails closed. |
| Boutique payment: `orders/{id}` | Changed: auth gate, explicit error state, eagerly observed reload futures, replacement/disposal generation guard. |
| Pool session: `piscine_sessions/{id}` | `PiscineSessionService.getSessionStream` returns the mapped source to `StreamBuilder`. Changed consumer to hide cached fallback/actions on error and detach on logout. |
| Private profile and public directory: `ProfileService.watchProfile/watchDirectoryProfile` | Owned by profile/directory `StreamBuilder`s. Auth-scoped profile screens reject empty UID; errors produce no profile/contact data. Builders own cancellation and identity changes; there is no internal fire-and-forget subscription. |
| Sensitive info: `banking`, `emergency`, `medical` | Three returned document streams consumed by profile `StreamBuilder`s and `EmergencyContactsCard`. Errors clear snapshot data; empty/unavailable UI supplies no private data. Cancellation belongs to the widget. |
| Medical certification: private member joined with certificate query | `watchCurrentCertification` forwards combined errors to profile/medical `StreamBuilder`s; no internal unmanaged listener. Existing medical live-date tests cover the join. |
| Team channels: one document per authorized channel ID | Existing `async*` / `try` / `await for` catches combined errors and cancels the combined subscription. Fallback is channel metadata; message access remains separately authorized. |
| Apnée history: session + attendee + QR receipt | Three nested document sources combined under `switchMap`; source changes cancel old history rows; dossier `StreamBuilder` displays its error state. |
| Active formation: member directory | Combined with enrollment query; `StreamBuilder` explicitly marks error/unavailable and suppresses active selection/actions. |
| Brevet screen: own private member | UID is checked before starting `StreamBuilder`; document errors clear snapshot data; widget owns cancellation. |
| Logbook confirmation: `_ref` | `StreamBuilder` contains document errors and renders unavailable when there is no data; no unmanaged listener. |
| Formation goals: `formation_goals/current` | Exported mapped stream factory, currently no application subscriber. No listener is started by constructing the service; future consumers receive its error normally. |
| Read state: section + scope cursor | Two exported mapped stream factories, currently no application subscribers (covered in service tests). No internal listener. Errors remain explicit rather than manufacturing an empty read cursor. |

Existing builders contain asynchronous stream errors; adding a global Sentry
permission filter would hide unrelated defects and is unnecessary. No such
filter was added.

## Verification

- New regressions exercise the real shared gate, real service and real payment
  widget: signed-out start, account mismatch, same-UID token retry, permission
  error, assignment cancellation, stale events, disposal, and failed payment
  reload between frames.
- Existing Boutique access/route/QR tests use an explicit authenticated UID.
- Related suites cover unread providers, private/public profiles, sensitive
  information, team channels, pool sessions, medical dates, apnée history, read
  state and the PR #156 observation error handling.
- Dedicated PR CI runs these suites, focused static analysis and the locked
  dependency check. This is automated regression evidence; it does not establish
  that an unreleased app fix has stopped production Sentry events.

## Startup analysis — no implementation changes

User-supplied figures: app start p95 **16.8 s**; warm “App start to plugin
registration” p95 **13 s**.
[Trace](https://h2mai.sentry.io/explore/traces/trace/09934c7695ed45c8972cb31e81830f3e).
The private trace itself was not accessible, so its individual spans, sample
count, device distribution and per-trace timings have not been independently
verified. Percentiles across possibly different cohorts cannot be subtracted to
claim a 3.8 s remainder or a particular fraction of one launch.

The lockfile uses `sentry_flutter` **9.14.0**. In that exact SDK,
`NativeAppStartHandler` creates this span from the native app-start timestamp to
the Sentry plugin registration timestamp. `SentryFlutterPlugin.register` records
the latter at function entry. Therefore the 13 s interval includes native
process/runtime/UIKit/Flutter-engine startup and every preceding synchronous
plugin registration. It does not measure only time inside a plugin registration
function. Sources: [Dart span construction](https://github.com/getsentry/sentry-dart/blob/9.14.0/packages/flutter/lib/src/integrations/native_app_start_handler.dart),
[native timestamp](https://github.com/getsentry/sentry-dart/blob/9.14.0/packages/flutter/ios/sentry_flutter/Sources/sentry_flutter/SentryFlutterPlugin.swift).

The current `AppDelegate` calls `GeneratedPluginRegistrant.register(with: self)`
before the custom share-inbox bridge. The generated registrant registers Sentry
after Firebase, camera/scanner, local notifications, secure storage, image tools,
biometrics and other plugins. An inference worth testing is that the dominant
delay occurs in the native launch/engine/earlier-plugin interval. The supplied
span alone cannot identify the individual component. Cocoa's warm/cold launch
classification should also be checked; a return from background is a distinct
lifecycle case, and prewarming can affect timestamps.

There is a separate, confirmed first-frame risk later in Dart: `main()` awaits
Firebase initialization, local read preferences, locale setup,
`NotificationService.initialize()` and deep links before `runApp`.
Notification initialization awaits permission and, when authorized, FCM
`getToken()`. The native delegate also requests notification authorization.
Those waits can delay the first Flutter frame after registration; their durations
are unmeasured here.

Suggested follow-up, in order:

1. Inspect the matched trace and sample counts by release, device, OS and launch
   type. Check the native startup child spans and prewarming/background context.
   Compare repeated release/profile launches on an affected iOS device.
2. Record Instruments App Launch / Time Profiler and timings at delegate entry,
   around the generated registrant, and around individual registrations before
   Sentry. This separates native/engine time from a slow preceding plugin.
3. Add measured spans around each Dart startup await in a separate performance
   change. Consider rendering a boot shell earlier, then initializing optional
   notifications/deep links; preserve Firebase readiness before dependent
   providers. Bound or defer notification token acquisition and consolidate
   permission prompting after measuring it.
4. Compare p50/p95 and time to first usable content on the same devices and
   cohorts. Evaluate Sentry/replay initialization overhead with controlled
   measurements while retaining error reporting. No SDK upgrade, plugin removal
   or startup reordering belongs to this permission-error patch.
