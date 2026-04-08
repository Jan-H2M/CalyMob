# 📘 CalyMob — Notificaties & Badges (Master Document)

**Datum:** 8 april 2026
**Versie basis:** 1.4.2+124
**Auteur:** Claude (consolidatie van alle bestaande notificatie-documentatie + nieuw onderzoek)
**Status:** geconsolideerde referentie — vervangt het lezen van losse docs

> **Doel van dit document.** Dit is het *enige* document dat je hoeft te lezen om het hele notificatie- en badge-systeem van CalyMob te begrijpen: hoe het werkt, wat er stuk is, wat het plan is om het te fixen, en welke best-practices we volgen. Het is een consolidatie van vier eerdere docs (zie sectie 14) plus nieuwe web-research naar Firebase/APNs best-practices.

---

## 📑 Inhoudsopgave

1. [TL;DR](#1-tldr)
2. [Architectuur op één pagina](#2-architectuur-op-één-pagina)
3. [Code-inventaris (Flutter + Functions)](#3-code-inventaris)
4. [De push-pijplijn van A tot Z](#4-de-push-pijplijn-van-a-tot-z)
5. [Het badge-systeem in detail](#5-het-badge-systeem-in-detail)
6. [Token lifecycle](#6-token-lifecycle)
7. [iOS vs Android — verschillen](#7-ios-vs-android--verschillen)
8. [Targeting & user preferences (P1/P2/P3)](#8-targeting--user-preferences)
9. [Bekende bugs en root causes](#9-bekende-bugs-en-root-causes)
10. [Het fix-plan (13 staged fixes)](#10-het-fix-plan)
11. [Best practices, harde limieten en design choices](#11-best-practices-uit-web-research)
12. [Verification & roll-out](#12-verification--roll-out)
12bis. [Open verbeteringen / niet-blokkerend](#12bis-open-verbeteringen--niet-blokkerend)
13. [Code-wegwijzer](#13-code-wegwijzer)
14. [Bron-documenten (geïndexeerd)](#14-bron-documenten)

---

## 1. TL;DR

CalyMob gebruikt **Firebase Cloud Messaging (FCM)** voor push-notificaties. **12 Cloud Functions Gen2** (Node 20, regio `europe-west1`) reageren op Firestore-writes en sturen pushes via APNs (iOS) en FCM/GCM (Android). Het rode-bolletje-systeem heeft **drie parallelle waarheden** die gesynchroniseerd moeten blijven:

1. **App-icoon badge** — gezet door `app_badge_plus` (Flutter) én door APNs `aps.badge` (server).
2. **In-app badges** — kleine rode dots op de knoppen "Annonces", "Événements", "Piscine".
3. **Server-side `unread_counts` map** — op `clubs/{id}/members/{uid}`, gebruikt door Cloud Functions om APNs het juiste getal mee te geven.

Het systeem werkt globaal, maar bevat **vijf reële bugs** en **drie architecturele risico's**. De vier klachten van gebruikers zijn alle terug te voeren tot deze bugs:

| Klacht | Root cause |
|---|---|
| Rode badge verschijnt niet altijd | Race tussen client-overwrite en server-increment + Android-launcher beperking |
| Notificaties komen niet altijd door | Stale FCM tokens worden niet opgeruimd; geen version-change refresh |
| Badge blijft hangen na lezen | Race in `_syncCountsToFirestore` overschrijft server-truth |
| Reinstall brengt oude badge terug | `LocalReadTracker` reset baseline maar `unread_counts.total` survives uninstall |

Het fix-plan in sectie 10 bevat **13 staged fixes** verdeeld over Flutter en Cloud Functions:

- **Fixes #2 t/m #10:** de oorspronkelijke 9 stabiliteits/correctheids-fixes voor de bovenstaande klachten.
- **Fix #11:** custom notification sounds per categorie (iOS .caf + Android channels migreren naar `_v2` met `RawResourceAndroidNotificationSound`).
- **Fix #12:** geen lokale notif tonen als de gebruiker al naar de relevante conversatie kijkt.
- **Fix #13:** `onNewBugReport` Cloud Function die direct naar Jan's device pingt (afhankelijk van bug reporting feature).

Daarnaast zijn er drie **harde limieten** uit Firebase die de architectuur sturen (sectie 11.1): max 500 tokens per `sendEachForMulticast`, FCM token TTL ~270 dagen, en Android notification channels zijn immutable na creatie. We behandelen deze expliciet in de design choices (sectie 11.2).

---

## 2. Architectuur op één pagina

```
┌─────────────────────────────────────────────────────────────────────┐
│  CalyCompta web (admin)  +  CalyMob Flutter client                  │
│  schrijven berichten / events / certificaten in Firestore           │
└───────────────────┬─────────────────────────────────────────────────┘
                    │  Firestore write
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Firebase Firestore   (project: calycompta, club: calypso)          │
│  - clubs/{clubId}/announcements              + replies              │
│  - clubs/{clubId}/operations/{op}/messages   + inscriptions         │
│  - clubs/{clubId}/team_channels/{ch}/messages                       │
│  - clubs/{clubId}/piscine_sessions/{s}/messages + attendees         │
│  - clubs/{clubId}/members/{id}/medical_certificates                 │
│  - clubs/{clubId}/members/{id}                                      │
│       └─ unread_counts {announcements, event_messages, ...,         │
│                         total, last_updated}                        │
│       └─ fcm_tokens [arrayUnion]                                    │
│       └─ fcm_token (legacy)                                         │
│       └─ fcm_token_updated_at                                       │
│       └─ app_version + app_build_number + app_installed             │
│       └─ notifications_enabled  +  notification_preferences {...}   │
└───────────────────┬─────────────────────────────────────────────────┘
                    │  onDocumentCreated / onDocumentUpdated triggers
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Cloud Functions Gen2  (europe-west1, Node 20)                      │
│  ├─ onNewAnnouncement          ├─ onNewTeamMessage                  │
│  ├─ onNewAnnouncementReply     ├─ onNewSessionMessage               │
│  ├─ onNewEventMessage          ├─ onNewOperation                    │
│  ├─ onEventStatusChange ⚠️      ├─ onPiscineTaskAssigned            │
│  ├─ onMedicalCertCreated       ├─ onMedicalCertStatusChange         │
│  └─ sessionReminder (scheduled cron 09:00 CET)                      │
│                                                                     │
│  Alles deelt badge-helper.js:                                       │
│    1. collectTokensAndMembers()    (filter stale, dedup, exclude)   │
│    2. incrementUnreadCounts()      (FieldValue.increment, atomic)   │
│    3. sendNotificationsWithBadge() (per-member badge berekening)    │
│       - per member badge berekend via getBadgeCount()               │
│       - sendEachForMulticast met dynamische APNs aps.badge          │
│       - invalid token → arrayRemove cleanup                         │
└───────────────────┬─────────────────────────────────────────────────┘
                    │  HTTP/2
                    ▼
┌───────────────────────────────────────┐
│  FCM brokers                          │
│  ├─ APNs (iOS)  sandbox/production    │
│  └─ FCM/GCM (Android)                 │
└─────┬───────────────────────┬─────────┘
      ▼                       ▼
┌──────────────────┐   ┌────────────────────┐
│  iOS device      │   │  Android device    │
│  AppDelegate     │   │  Default Activity  │
│  → FCM plugin    │   │  → FCM plugin      │
│  → notification  │   │  → channel route   │
│     _service     │   │     6 channels     │
│  → local notif   │   │  → local notif     │
│  → setBadge()    │   │  → setBadge()      │
└──────────────────┘   └────────────────────┘
```

---

## 3. Code-inventaris

### 3.1 Flutter (lib/)

| Laag | Bestand | Verantwoordelijkheid |
|---|---|---|
| Platform iOS | `ios/Runner/AppDelegate.swift` | Manual APNs hook (`Messaging.messaging().apnsToken = deviceToken`) — nodig omdat `FirebaseAppDelegateProxyEnabled = false` |
| Platform iOS | `ios/Runner/Info.plist` | `UIBackgroundModes = fetch, remote-notification`, `FirebaseAppDelegateProxyEnabled = false` |
| Platform iOS | `ios/Runner/Runner.entitlements` | `aps-environment = production` |
| Platform Android | `android/app/src/main/AndroidManifest.xml` | `POST_NOTIFICATIONS`, `VIBRATE`, geen custom `FirebaseMessagingService` (default plugin) |
| Service | `lib/services/notification_service.dart` | FCM init, permissies, token opslag/refresh, foreground → local notif, 6 Android channels, app-icoon badge |
| Service split | `lib/services/notification_service_io.dart` / `_web.dart` | Platform-specifieke imports |
| State | `lib/providers/auth_provider.dart` | Login → `saveTokenToFirestore` + `listenForTokenRefresh`. **Bug: logout doet géén token cleanup.** |
| Read tracking | `lib/services/local_read_tracker.dart` | `lastRead_<key>` in `SharedPreferences`. Install-baseline = `DateTime.now()` op verse install. |
| Count engine | `lib/services/unread_count_service.dart` | Parallelle Firestore `count()` queries per categorie. Cap: 10 ops, 5 sessies, 8s timeout. |
| Badge state | `lib/providers/unread_count_provider.dart` | 60s timer, 5min SP cache, schrijft counts terug, update app-icoon. **Bug: map-overwrite.** |
| App lifecycle | `lib/main.dart` | Background handler, foreground handlers, tap-routing, lifecycle hooks. **Bug: geen `medical_certificate` case.** |

### 3.2 Cloud Functions (functions/)

| Bestand | Trigger | Doel | Targeting |
|---|---|---|---|
| `utils/badge-helper.js` | (shared) | Token verzameling, increment/decrement, `sendNotificationsWithBadge` | — |
| `utils/constants.js` | (shared) | `FIRESTORE_BATCH_LIMIT`, `EVENT_EXPIRY_GRACE_DAYS` | — |
| `notifications/onNewAnnouncement.js` | `announcements/{id}` create | Broadcast | Alle `app_installed=true` |
| `notifications/onNewAnnouncementReply.js` | `announcements/{id}/replies/{r}` create | Reply notificatie | **P2:** thread participants |
| `notifications/onNewEventMessage.js` | `operations/{op}/messages/{m}` create | Event chat | **P1:** alleen `inscriptions` |
| `notifications/onEventStatusChange.js` | `operations/{op}` update (`statut`) | Decrement counts bij sluiten | ⚠️ **Stuk** — gebruikt dood `read_by` veld |
| `notifications/onNewTeamMessage.js` | `team_channels/{ch}/messages/{m}` create | Team chat | Members met juiste rol |
| `notifications/onNewSessionMessage.js` | `piscine_sessions/{s}/messages/{m}` create | Pool chat | Per `group_type` (accueil/encadrants/niveau) |
| `notifications/onNewOperation.js` | `operations/{op}` create | Nieuwe sortie | Broadcast (P1.2) |
| `notifications/onPiscineTaskAssigned.js` | `piscine_sessions/{s}` update | Task assignment | Diff van assigned members (P2.1) |
| `notifications/onMedicalCertStatusChange.js` | `members/{m}/medical_certificates/{c}` update | Approval/reject | Persoonlijk |
| `notifications/sessionReminder.js` | scheduled (cron) | Daily reminder | Participants van morgen |

---

## 4. De push-pijplijn van A tot Z

### 4.1 Device-registratie (eerste login)

**iOS boot — `AppDelegate.swift`:**
1. `application:didFinishLaunchingWithOptions` vraagt APNs-autorisatie (`.alert .badge .sound`) en roept `registerForRemoteNotifications()`.
2. Apple geeft een APNs-token terug → manual hook `Messaging.messaging().apnsToken = deviceToken`. Zonder deze override (omdat `FirebaseAppDelegateProxyEnabled = false`) zou Firebase het token nooit krijgen.
3. `UIBackgroundModes = [fetch, remote-notification]` is aanwezig — nodig voor stille `content-available` wake-ups.
4. Entitlement `aps-environment = production` — **let op:** dev-builds vereisen een `DebugProfile.entitlements` met `development`.

**Android boot:**
1. Runtime permission `POST_NOTIFICATIONS` via `FirebaseMessaging.instance.requestPermission()` (Android 13+).
2. Geen expliciete `FirebaseMessagingService` — leunt op de default plugin.

**Flutter init — `NotificationService.initialize()`:**
1. Android: 6 channels aangemaakt (`announcements`, `event_messages`, `medical_certificates`, `team_messages`, `piscine_messages`, `piscine_tasks`), allemaal `Importance.high`.
2. iOS+Android: `FlutterLocalNotificationsPlugin.initialize()` met `onDidReceiveNotificationResponse` als tap-handler.
3. `requestPermission()` → indien `authorized` → `getToken()`.
4. `setupForegroundNotifications()` koppelt `FirebaseMessaging.onMessage`.

**Login — `auth_provider.dart`:**
- `authStateChanges.listen` detecteert ingelogde user → `saveTokenToFirestore(clubId, uid)` schrijft:
  - `fcm_tokens` ← `arrayUnion([token])` (multi-device)
  - `fcm_token` ← zelfde (legacy fallback)
  - `fcm_token_updated_at` ← server timestamp
  - `notifications_enabled = true`
  - + tracking velden: `app_installed`, `app_platform`, `app_version`, `app_build_number`, `device_model`, `device_os_version`, locale, timezone
- `listenForTokenRefresh(clubId, uid)` subscribet `onTokenRefresh`.
- Bij `didChangeAppLifecycleState(resumed)` opnieuw `_refreshFcmToken()` als vangnet.

### 4.2 Server kant: bericht binnen → push uit

Voorbeeld: admin plaatst een announcement.

1. CalyCompta schrijft `clubs/calypso/announcements/{id}`.
2. `onNewAnnouncement` triggert in `europe-west1`. Flow:
   1. Query `clubs/calypso/members where app_installed == true`.
   2. `collectTokensAndMembers(memberDocs, senderId)`:
      - Skip `senderId` (geen self-notify)
      - Skip `notifications_enabled === false`
      - Detecteer stale tokens (`fcm_token_updated_at` > 30 dagen)
      - Bouw `tokens[]`, `tokenToMember`, `memberTokenGroups` (memberId → tokens), `recipientIds[]`
   3. Bouw payload met `notification.title/body`, `data.{type, club_id, ...}`, `android.notification.channelId = 'announcements'`, `apns.headers.apns-priority = '10'`, `apns.payload.aps.alert + sound + 'content-available': 1`. Voor `type === 'urgent'`: `interruption-level = 'time-sensitive'`.
   4. **Volgorde is bewust:** eerst `incrementUnreadCounts(clubId, recipientIds, 'announcements')` — `FieldValue.increment(1)` voor `unread_counts.announcements` én `unread_counts.total`. Pas dán `sendNotificationsWithBadge()`.
   5. `sendNotificationsWithBadge` per memberId parallel:
      - `getBadgeCount(clubId, memberId)` → leest `unread_counts.total`
      - Maakt payload met `apns.payload.aps.badge = newBadge`
      - `admin.messaging().sendEachForMulticast({tokens, ...payload})`
      - Bij `messaging/invalid-registration-token` of `registration-token-not-registered` → `arrayRemove(failedToken)`

> **Android krijgt géén `badge` veld** in de payload. Android badges komen client-side via `app_badge_plus`.

### 4.3 Client kant: drie staten

**A. App op de voorgrond**
- `FirebaseMessaging.onMessage` vuurt. **Twee** listeners:
  1. `NotificationService._handleForegroundMessage` → bouwt channel uit `data['type']` en toont local notification.
  2. `_MyAppState._setupNotificationTapHandlers` → 2s delay → `_refreshUnreadCounts()` + 1s later → `_updateBadgeFromUnreadCounts()`. De delay wacht op Firestore consistency.

**B. App in background (niet gekilled)**
- iOS/Android tonen automatisch de systeemnotificatie (top-level `notification` object).
- iOS badge gezet via `aps.badge` (per-member berekend door server).
- Android: notificatie naar het juiste channel; geen automatische badge — `app_badge_plus` zet hem zodra app geopend wordt.

**C. App gekilled (cold start via tap)**
- `FirebaseMessaging.instance.getInitialMessage()` geeft het bericht terug.
- 500ms delay → `_handleNotificationTap(message)`.
- `firebaseMessagingBackgroundHandler` (top-level) heeft het bericht eerder gelogd.

### 4.4 Tap-routing — `main.dart._handleNotificationTap`

| `data['type']` | Bestemming |
|---|---|
| `event_message`, `new_operation` | `OperationDetailScreen` |
| `announcement`, `announcement_reply` | `AnnouncementDetailScreen` (na fetch doc) |
| `team_message` | `TeamChatScreen` |
| `session_message` | `SessionChatScreen` met juiste `SessionChatGroup` |
| `piscine_task_assigned` | `SessionDetailScreen` |
| `medical_certificate` | ⚠️ **Niet gedekt** — fallback naar default warning log |

Alle Firestore reads in deze flow hebben **5s timeout** om ANR te voorkomen.

---

## 5. Het badge-systeem in detail

### 5.1 Drie waarheidsbronnen

**Bron #1 — `LocalReadTracker` (client only).** Wrapper rond `SharedPreferences`. Keys zoals `lastRead_announcements`, `lastRead_operation_<id>`, `lastRead_team_equipe_accueil`, `lastRead_session_<id>_<group>`. Bij eerste app-start: `_installBaseline = DateTime.now()` → alle berichten van vóór de install gelden als gelezen. Fallback voor bestaande installs: `DateTime(2024, 1, 1)`. Pure lokaal: device A lezen weet device B niet van.

**Bron #2 — `unread_counts` map in member doc.** Geschreven door:
- **Cloud Functions** via `incrementUnreadCounts` → `FieldValue.increment(1)` (atomic) per categorie en op `total`.
- **De client** via `_syncCountsToFirestore` → ⚠️ **overwrite van de hele map** (zie bug #1 en #5).

**Bron #3 — In-memory `UnreadCountProvider` velden.** Vier counters (`_announcements`, `_eventMessages`, `_teamMessages`, `_sessionMessages`). Getter `total` = som van de vier. `medicalCertificates` getter = hardcoded 0. Gelezen door UI widgets via `Provider.of<UnreadCountProvider>`. Geschreven door cache-load (TTL 5 min) en `refresh()` (60s timer of op events).

### 5.2 Het count-pad (`UnreadCountService.refreshAllCounts`)

Voor elke categorie parallel:
```dart
final lastRead = _tracker.getLastRead('announcements') ?? _epoch;
final ts = Timestamp.fromDate(lastRead);
final results = await Future.wait([
  _firestore.collection('clubs/$clubId/announcements')
      .where('created_at', isGreaterThan: ts).get().timeout(8s),
  _firestore.collection('clubs/$clubId/announcements')
      .where('last_reply_at', isGreaterThan: ts).get().timeout(8s),
]);
return uniqueIds.length;
```

Voor event_messages: `query.count().get()` aggregation (efficiënt qua bandbreedte, betaald als 1 read). Performance guards: `_maxOperationsToCount = 10`, `_maxSessionsToCount = 5`, `_queryTimeout = 8s`.

### 5.3 Hoe het app-icoon badge gezet wordt

**Pakket:** `app_badge_plus: ^1.2.8`. iOS gebruikt `UIApplication.setApplicationIconBadgeNumber`; Android roept launcher-specifieke API's aan.

**⚠️ Android caveat:** `app_badge_plus` werkt op Samsung One UI, Xiaomi MIUI, Huawei EMUI, Oppo, Vivo. **Het werkt NIET op stock Pixel / AOSP / GrapheneOS** — daar geeft `isSupported() == false` en krijgen users alleen een notification dot bij actieve notifs. Dit is een Android platform-limitatie, geen CalyMob bug.

**Plekken waar de badge gezet wordt:**
1. `UnreadCountProvider._updateBadge(total)` na elke geslaagde refresh (alleen als de som veranderd is) — via `addPostFrameCallback` om main thread niet te blokkeren.
2. `main.dart._updateBadgeFromUnreadCounts()` bij lifecycle events en na foreground pushes.
3. Bij background push op iOS: gezet via `aps.badge` in de payload door de server.
4. Er bestaat een `clearBadge()` in `NotificationService`, maar die wordt **nergens aangeroepen**. De badge gaat alleen naar 0 als alle tellers 0 worden.

### 5.4 Een typische dag in de klok

```
09:00:00  App cold start
          ├─ LocalReadTracker.init()
          ├─ NotificationService.initialize() (channels + permissies)
          └─ AuthProvider auto-login
               ├─ saveTokenToFirestore + listenForTokenRefresh
               └─ UnreadCountProvider.listen()
                    ├─ _loadCachedCounts() (instant UI uit cache)
                    ├─ refresh() (Firestore queries parallel)
                    │    ├─ 3 announcements + 1 event_message
                    │    ├─ _syncCountsToFirestore (⚠️ map overwrite)
                    │    └─ _updateBadge(4)
                    └─ Timer.periodic(60s)

09:01:00  Tap "Annonces" → AnnouncementDetailScreen
          └─ _markAsRead() → LocalReadTracker.markAsRead('announcements')
             + unreadProvider.refresh()  ✅ (fix is in place)

09:02:02  Iemand plaatst nieuwe announcement
          └─ Cloud Function:
              1. increment → unread_counts.total = 1 (atomic)
              2. getBadgeCount → 1
              3. APNs push met badge=1
09:02:03  Foreground push:
          └─ onMessage → 2s delay → refresh()
09:02:05  refresh() loopt:
          ├─ count query → announcements: 1
          └─ _syncCountsToFirestore OVERWRITES — ⚠️ HIER ZIT DE RACE
              als CF in tussentijd opnieuw incrementte, is dat verloren

14:00:00  App resume
          └─ didChangeAppLifecycleState(resumed)
              ├─ _refreshUnreadCounts()
              ├─ _updateBadgeFromUnreadCounts()
              └─ _refreshFcmToken()
```

---

## 6. Token lifecycle

### 6.1 Huidige werking

1. **Login:** `saveTokenToFirestore` → `arrayUnion` op `fcm_tokens`, schrijf `fcm_token_updated_at`, `app_version`, `app_build_number`.
2. **Token refresh:** `listenForTokenRefresh` luistert op `onTokenRefresh` stream van FCM SDK → schrijft nieuwe token via dezelfde flow.
3. **App resume:** `_refreshFcmToken` herschrijft de huidige token (vangnet).
4. **Logout:** ⚠️ **Bug — `removeTokenFromFirestore` wordt NIET aangeroepen.** Het token blijft op het member-doc hangen → gebruiker A krijgt notificaties die voor gebruiker B bedoeld zijn als ze hetzelfde toestel delen.
5. **Stale tokens (>30 dagen oud):** worden alleen gelogd, niet verwijderd. Cleanup gebeurt pas wanneer FCM een `messaging/registration-token-not-registered` error teruggeeft tijdens een send.
6. **App-version change:** ⚠️ **Bug — wordt niet gedetecteerd.** Als Apple/Google het token rotaten tijdens een app-update terwijl de listener niet draait, raakt het token los van het device. Historisch heeft Jan dit zelf ervaren ("vroeger ook een probleem met de token als ik van versie veranderde").

### 6.2 Best practices uit Firebase docs (web research)

- **Sla `app_version` op naast het token.** Bij elke launch: vergelijk huidige versie met opgeslagen versie. Bij verschil: `await _messaging.deleteToken()` → `getToken()` → schrijf nieuwe token + verwijder oude via `arrayRemove`.
- **Gebruik `arrayUnion`/`arrayRemove`** in plaats van full array overwrites. Multi-device support is dan transparant.
- **Verwijder tokens proactief op `messaging/registration-token-not-registered`** — al goed.
- **Monitor delivery degradation:** als `failureCount > successCount` in een batch, log een `error` in plaats van `info` voor zichtbaarheid in Cloud Functions logs / Sentry.
- **Token TTL ~270 dagen** voor inactieve apps — daarna invalidert FCM ze automatisch.

---

## 7. iOS vs Android — verschillen

| Aspect | iOS | Android |
|---|---|---|
| Toestemmingsmodel | UNUserNotificationCenter (`.alert .badge .sound`) | Runtime `POST_NOTIFICATIONS` (Android 13+), `VIBRATE` |
| Token delivery | APNs → `AppDelegate.didRegisterForRemoteNotificationsWithDeviceToken` → manual hook | Firebase Installations ID → auto via plugin |
| Badge weergave | **Native** via `aps.badge` (server bepaalt) + `app_badge_plus` lokaal | **Launcher-afhankelijk**, `app_badge_plus` best-effort |
| Achtergrondverwerking | `content-available: 1` + `UIBackgroundModes` → iOS wekt app | `firebaseMessagingBackgroundHandler` via isolate |
| Notificatiekanalen | n.v.t. | 6 channels expliciet aangemaakt |
| Server priority | `apns-priority: 10` | `android.priority: 'high'\|'max'` |
| Time-sensitive | `interruption-level: 'time-sensitive'` (urgent only) | n.v.t. |
| Firebase Proxy | **Uitgeschakeld** → manual hook nodig | n.v.t. |
| Badge reset | `aps.badge = 0` (gebeurt nooit) of `app_badge_plus.updateBadge(0)` | `app_badge_plus.updateBadge(0)` (vooral useless op Pixel) |

---

## 8. Targeting & user preferences

(Bron: `docs/guides/NOTIFICATION_REFACTOR_PLAN.md`, gestart 2026-03-21 na user feedback "On reçoit trop de notifications".)

### 8.1 Phase 1 — Impact maximaal, effort minimaal

**P1.1 — `onNewEventMessage` filter op `inscriptions`.** Voorheen broadcast naar **alle** members; nu alleen naar wie ingeschreven staat op de operation. Lost ~80% van het bruit op.

**P1.2 — Nieuwe `onNewOperation` Cloud Function.** Trigger op `operations/{op}` create. Filtert op `event_category in ['plongee', 'sortie']` en `type === 'evenement'`. Notificeert alle `app_installed=true` members met titel "🤿 Nouvelle sortie : ...".

### 8.2 Phase 2 — Gerichte notificaties

**P2.1 — `onPiscineTaskAssigned`.** Trigger op `piscine_sessions/{s}` update. Diff oude vs nieuwe `tasks` map → identificeer nieuwe assignees → notify alleen die. Nieuw Android channel `piscine_tasks` + nieuw tap-type `piscine_task_assigned`.

**P2.2 — `onNewAnnouncementReply` filter op thread participants.** Voorheen broadcast; nu alleen naar:
1. De originele auteur van de annonce
2. Iedereen die al gerepliceerd heeft in de thread
3. Behalve de auteur van de huidige reply

### 8.3 Phase 3 — Granulaire user preferences

**Nieuw Firestore-veld:** `clubs/{clubId}/members/{memberId}.notification_preferences`:

```javascript
notification_preferences: {
  new_events: true,           // Nieuwe sorties
  event_messages: true,       // Messages van events waaraan ik deelneem
  piscine_tasks: true,        // Pool task assignments
  // announcements → NIET in preferences — altijd actief
  announcement_replies: true, // Replies op threads waaraan ik deelneem
  team_messages: true,        // Team channel messages
  session_messages: true,     // Pool session messages
  session_reminders: true,    // Daily pool reminder
  medical_certificates: true, // Medical certificate status
}
```

**Default:** alles `true`. Backward compatible: `undefined` = `true`.

**Mapping Cloud Function → preferenceKey:**

| Cloud Function | preferenceKey |
|---|---|
| `onNewOperation` | `new_events` |
| `onNewEventMessage` | `event_messages` |
| `onPiscineTaskAssigned` | `piscine_tasks` |
| `onNewAnnouncement` | _(geen — altijd actief)_ |
| `onNewAnnouncementReply` | `announcement_replies` |
| `onNewTeamMessage` | `team_messages` |
| `onNewSessionMessage` | `session_messages` |
| `sessionReminder` | `session_reminders` |
| `onMedicalCertStatusChange` | `medical_certificates` |

**Filter helper** (`badge-helper.js → filterByPreference`) is al geïmplementeerd.

**Flutter UI:** `lib/screens/profile/notification_preferences_screen.dart` (nog te maken). Toggle voor "Annonces du club" is grijs/disabled met onderschrift "Les annonces importantes sont toujours envoyées".

---

## 9. Bekende bugs en root causes

### Bug A — Race tussen client overwrite en server increment ⭐

**Bestand:** `lib/providers/unread_count_provider.dart` r. 176-204
**Bestand:** `functions/src/utils/badge-helper.js` (`incrementUnreadCounts`)

```dart
// PROBLEEM:
await memberRef.update({
  'unread_counts': {                                    // ← FULL MAP OVERWRITE
    'announcements': announcements,
    'event_messages': eventMessages,
    'team_messages': teamMessages,
    'session_messages': sessionMessages,
    'total': newTotal,                                  // ← client berekend
    'last_updated': FieldValue.serverTimestamp(),
  },
});
```

**Wat fout gaat:**
- Overschrijft `medical_certificates` (wordt nergens client-side geteld) → die teller verdwijnt.
- Overschrijft elke parallelle `FieldValue.increment()` van een Cloud Function → verloren badge-update.
- Zet `total` zelf, terwijl de Cloud Function diezelfde `total` met `FieldValue.increment(1)` bijwerkt → systematische drift.
- Gebeurt elke 60s en bij elke `markAsRead`.

**Best practice (Firebase docs):** gebruik veld-transformaties (`FieldValue.increment`) en dot-notation updates. Nooit een full-map overwrite voor counters.

### Bug B — `updateBadgeFromFirestore` dubbeltelling

**Bestand:** `lib/services/notification_service.dart` r. 568-587

```dart
final unreadCounts = data['unread_counts'] as Map<String, dynamic>? ?? {};
int total = 0;
for (final value in unreadCounts.values) {
  if (value is int) total += value;     // ← telt OOK het 'total'-veld op
}
```

Alle 4 categorieën worden opgeteld + het al bestaande `total`-veld → 2× de werkelijke waarde. Momenteel dead code (geen call site), maar een landmijn.

### Bug C — FCM token leak op logout + missende version-change rotation

**Bestand:** `lib/providers/auth_provider.dart` r. 151-179

`logout()` roept `_authService.logout()` aan, maar **niet** `removeTokenFromFirestore()`. Het oude token blijft op het member-document hangen.

**Bovendien:** geen explicit version-change check. De `onTokenRefresh` listener kan tijdens een update gemist worden, en dan raken we de token-rotatie kwijt. Historisch heeft Jan dit zelf ervaren.

### Bug D — Reinstall reset baseline maar niet `unread_counts`

`LocalReadTracker.init()` zet `_installBaseline = NOW` zodat oude berichten als gelezen gelden. Maar het Firestore `unread_counts.total` van vóór de uninstall **leeft door** op het server-side member-document. De eerste push na herinstall stuurt dat oude badge-getal mee in `aps.badge` → klacht 4.

### Bug E — `onEventStatusChange` gebruikt verouderde `read_by`

**Bestand:** `functions/src/notifications/onEventStatusChange.js` r. 71-75

```js
const unreadCount = messages.filter(msg => {
  const readBy = msg.read_by || [];
  return !readBy.includes(participantId);
}).length;
```

`read_by` wordt sinds de migratie naar `LocalReadTracker` niet meer gevuld. Decrement is altijd te hoog. Beschermd door clamp in `decrementUnreadCounts`, maar werkt niet meer correct → badge kan plots naar 0 springen terwijl er nog ongelezen items zijn.

### Risico F — Android badge launcher-afhankelijk

`app_badge_plus` werkt op Samsung/Xiaomi/Huawei/Oppo/Vivo, niet op stock AOSP/Pixel. Op Pixel zien users alleen een notification dot bij actieve notifs — geen numeriek bolletje. Geen officiële Android API hiervoor. Klacht 1 op Pixels is grotendeels een platform-limitatie.

### Risico G — Stale tokens worden gelogd maar niet opgeruimd

`badge-helper.js` logt warnings voor tokens > 30 dagen oud, maar verwijdert ze niet. Pas wanneer FCM een `messaging/registration-token-not-registered` error teruggeeft worden ze via `arrayRemove` weggehaald. Sommige stale tokens blijven actief terwijl ze nooit een notificatie meer afleveren.

### Risico H — Geen `medical_certificate` tap-handler

Notificatie komt aan, maar tappen doet niets (default warning case in switch).

### Risico I — Dubbele foreground listeners + 2s delay heuristiek

Twee listeners op `FirebaseMessaging.onMessage` (één in `notification_service.dart`, één in `main.dart`). De 2s delay om Firestore consistency af te wachten kan falen bij trage netwerken. Beter: snapshot listener op het eigen member-doc.

### Risico J — APNs entitlement hardcoded `production`

Dev-builds via `flutter run` op fysiek toestel kunnen pushes missen omdat APNs token bij verkeerde Apple server geregistreerd wordt. Verifieer dat `DebugProfile.entitlements` met `aps-environment = development` bestaat voor Debug.

---

## 10. Het fix-plan

(In detail in `docs/NOTIFICATIONS_FIX_PLAN.md`. Hier de samenvatting in volgorde van executie.)

### Fix #2 — Stop met map-overwrite, gebruik dot-notation
**Bestand:** `lib/providers/unread_count_provider.dart`

Vervang `_syncCountsToFirestore` met per-field updates, schrijf `total` NIET meer vanuit de client:

```dart
await memberRef.update({
  'unread_counts.announcements': announcements,
  'unread_counts.event_messages': eventMessages,
  'unread_counts.team_messages': teamMessages,
  'unread_counts.session_messages': sessionMessages,
  'unread_counts.last_synced': FieldValue.serverTimestamp(),
});
```

Cloud Functions blijven `unread_counts.total` beheren via `FieldValue.increment`. Veiligheidsnet in `getBadgeCount`: bij ontbrekend/negatief `total` → som van categorie-velden.

### Fix #3 — Repareer `updateBadgeFromFirestore` dubbeltelling
**Bestand:** `lib/services/notification_service.dart`

Lees enkel `unread_counts.total`:
```dart
final total = (unreadCounts['total'] as num?)?.toInt() ?? 0;
await setBadge(total.clamp(0, 9999));
```

### Fix #4 — Logout cleanup van FCM token
**Bestand:** `lib/providers/auth_provider.dart`

In `logout()` (en `deleteAccount()`) vóór `_authService.logout()`:
```dart
final uid = _currentUser?.uid;
if (uid != null) {
  await _notificationService.removeTokenFromFirestore(
    FirebaseConfig.defaultClubId, uid);
}
_notificationService.stopListeningForTokenRefresh();
```

### Fix #5 — Detecteer app-version change en force token refresh
**Bestand:** `lib/services/notification_service.dart`

In `saveTokenToFirestore`:
```dart
final isVersionChange = previousVersion != null &&
    (previousVersion != appInfo['version'] ||
     previousBuild != appInfo['buildNumber']);

if (isVersionChange) {
  try {
    final oldToken = await _messaging.getToken();
    await _messaging.deleteToken();
    if (oldToken != null) {
      await memberRef.update({
        'fcm_tokens': FieldValue.arrayRemove([oldToken]),
      });
    }
  } catch (e) { debugPrint('⚠️ Force rotation failed (non-fatal): $e'); }
}
// Daarna gewoon getToken() opnieuw + arrayUnion
```

### Fix #6 — Reset `unread_counts` + `cancelAll` bij verse install
**Bestanden:** `lib/services/local_read_tracker.dart` + `lib/providers/auth_provider.dart`

`LocalReadTracker` exposet een `installBaseline` getter. Na de eerste login na verse install:
```dart
if (LocalReadTracker().installBaseline != null) {
  await FirebaseFirestore.instance
      .collection('clubs').doc(FirebaseConfig.defaultClubId)
      .collection('members').doc(user.uid)
      .update({
    'unread_counts.announcements': 0,
    'unread_counts.event_messages': 0,
    'unread_counts.team_messages': 0,
    'unread_counts.session_messages': 0,
    'unread_counts.medical_certificates': 0,
    'unread_counts.total': 0,
    'unread_counts.last_synced': FieldValue.serverTimestamp(),
  });
  await _notificationService.clearBadge();
  await FlutterLocalNotificationsPlugin().cancelAll();
}
```

### Fix #7 — "Marquer tout comme lu" knop in Settings
**Bestand:** `lib/screens/profile/settings_screen.dart`

ListTile met `Icons.mark_email_read`. Op tap:
1. Confirmatie dialog (FR)
2. `LocalReadTracker.markAllAsRead()` (nieuwe helper, zet wildcard "now" baseline)
3. Reset Firestore counters via dot-notation set naar 0
4. `notificationService.clearBadge()` + `FlutterLocalNotificationsPlugin().cancelAll()`
5. `unreadProvider.refresh()`

### Fix #8 — Cloud Function `onEventStatusChange` repareren
**Bestand:** `functions/src/notifications/onEventStatusChange.js`

**Beslissing: delete the function.** De event_messages teller wordt sowieso al meegerekend door de client-side `count()` query op alleen open operations. Closed events worden niet meer gequeryd → count gaat vanzelf naar 0. Comment de export uit in `functions/index.js` en laat het bestand staan voor historische context.

### Fix #9 — Tap-handler voor `medical_certificate`
**Bestand:** `lib/main.dart`

```dart
case 'medical_certificate':
  _navigatorKey.currentState!.push(
    MaterialPageRoute(builder: (_) => const MedicalCertificationScreen()),
  );
  break;
```

### Fix #10 — Stale-token cleanup + Sentry warning
**Bestand:** `functions/src/utils/badge-helper.js`

- Verlaag risico op over-pruning: `STALE_TOKEN_DAYS` van 30 → 60.
- Bij `failureCount > successCount && total > 3`: `console.error` ipv info, zichtbaar in Sentry/Functions logs.

```js
if (totalFailure > totalSuccess && totalSuccess + totalFailure > 3) {
  console.error(`🚨 NOTIF DELIVERY DEGRADED: ${totalFailure} failures vs ${totalSuccess} successes — check token freshness`);
}
```

---

### Fix #11 — Custom notification sounds per categorie ⭐ (nieuw)

**Doel:** elke categorie een herkenbaar geluid (zodat je zonder kijken weet of het een aankondiging, een event-bericht, een team-message of een dringende notif is).

**Sound files (te leveren door Jan, anders gebruiken we royalty-free defaults):**

| Categorie | iOS bestand (.caf) | Android raw resource | Karakter |
|---|---|---|---|
| Announcements (gewoon) | `announcement.caf` | `announcement` | Korte ding |
| Announcements urgent | `urgent.caf` | `urgent` | Insistent dubbele ping |
| Event messages | `event_msg.caf` | `event_msg` | Soft tinkle |
| Team messages | `team_msg.caf` | `team_msg` | Tweetje |
| Session messages (piscine) | `session_msg.caf` | `session_msg` | Water-drupje |
| Piscine task assigned | `piscine_task.caf` | `piscine_task` | Whistle |
| Medical certificate | `medical.caf` | `medical` | Soft chime |

**Specs:** ≤ 30 seconden, mono, 44.1 kHz / 16-bit. iOS accepteert `.caf`, `.aiff`, `.wav`. Android `.mp3`, `.ogg`, `.wav`.

**Stap 1 — Sound files toevoegen**

```bash
# iOS — drop in Xcode project (Runner target)
ios/Runner/Sounds/announcement.caf
ios/Runner/Sounds/urgent.caf
... etc
# Verify "Target Membership" = Runner in Xcode

# Android — drop in raw resource folder
android/app/src/main/res/raw/announcement.mp3
android/app/src/main/res/raw/urgent.mp3
... etc
# CRITICAL: ook een keep.xml om R8 te beletten ze te strippen
android/app/src/main/res/raw/keep.xml
```

`keep.xml` content:
```xml
<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools"
    tools:keep="@raw/announcement,@raw/urgent,@raw/event_msg,@raw/team_msg,@raw/session_msg,@raw/piscine_task,@raw/medical" />
```

**Stap 2 — Android channels updaten met sounds**

Channels zijn **immutable na creatie**. We moeten dus nieuwe channel ID's gebruiken (`announcements_v2`, etc.) en de oude channels later laten verzwakken.

Bestand: `lib/services/notification_service.dart`, in `_createNotificationChannels()`:

```dart
const channels = [
  AndroidNotificationChannel(
    'announcements_v2',
    'Annonces',
    description: 'Annonces du club',
    importance: Importance.high,
    sound: RawResourceAndroidNotificationSound('announcement'),
    enableVibration: true,
  ),
  AndroidNotificationChannel(
    'announcements_urgent_v2',
    'Annonces urgentes',
    description: 'Annonces urgentes du club',
    importance: Importance.max,
    sound: RawResourceAndroidNotificationSound('urgent'),
    enableVibration: true,
  ),
  AndroidNotificationChannel(
    'event_messages_v2',
    'Discussions d\'événements',
    importance: Importance.high,
    sound: RawResourceAndroidNotificationSound('event_msg'),
  ),
  AndroidNotificationChannel(
    'team_messages_v2',
    'Messages d\'équipe',
    importance: Importance.high,
    sound: RawResourceAndroidNotificationSound('team_msg'),
  ),
  AndroidNotificationChannel(
    'session_messages_v2',
    'Messages de piscine',
    importance: Importance.high,
    sound: RawResourceAndroidNotificationSound('session_msg'),
  ),
  AndroidNotificationChannel(
    'piscine_tasks_v2',
    'Tâches de piscine',
    importance: Importance.high,
    sound: RawResourceAndroidNotificationSound('piscine_task'),
  ),
  AndroidNotificationChannel(
    'medical_certificates_v2',
    'Certificats médicaux',
    importance: Importance.high,
    sound: RawResourceAndroidNotificationSound('medical'),
  ),
];

final plugin = FlutterLocalNotificationsPlugin();
final androidImpl = plugin.resolvePlatformSpecificImplementation<
    AndroidFlutterLocalNotificationsPlugin>();

// Maak nieuwe channels aan
for (final channel in channels) {
  await androidImpl?.createNotificationChannel(channel);
}

// Verwijder de oude (zonder sound) — gebruikers behouden hun eigen overrides
// alleen op de _v2 channels
for (final oldId in [
  'announcements', 'event_messages', 'medical_certificates',
  'team_messages', 'piscine_messages', 'piscine_tasks',
]) {
  try {
    await androidImpl?.deleteNotificationChannel(oldId);
  } catch (_) {}
}
```

**Stap 3 — Cloud Functions payload updaten**

Bestand: `functions/src/utils/badge-helper.js` — nieuwe helper:

```js
const SOUND_MAP = {
  announcements: { ios: 'announcement.caf', android: 'announcement', channel: 'announcements_v2' },
  announcements_urgent: { ios: 'urgent.caf', android: 'urgent', channel: 'announcements_urgent_v2' },
  event_messages: { ios: 'event_msg.caf', android: 'event_msg', channel: 'event_messages_v2' },
  team_messages: { ios: 'team_msg.caf', android: 'team_msg', channel: 'team_messages_v2' },
  session_messages: { ios: 'session_msg.caf', android: 'session_msg', channel: 'session_messages_v2' },
  piscine_tasks: { ios: 'piscine_task.caf', android: 'piscine_task', channel: 'piscine_tasks_v2' },
  medical_certificates: { ios: 'medical.caf', android: 'medical', channel: 'medical_certificates_v2' },
};

function applySound(payload, category) {
  const sound = SOUND_MAP[category];
  if (!sound) return payload;
  // iOS
  payload.apns = payload.apns || { payload: { aps: {} } };
  payload.apns.payload = payload.apns.payload || { aps: {} };
  payload.apns.payload.aps = payload.apns.payload.aps || {};
  payload.apns.payload.aps.sound = sound.ios;
  // Android
  payload.android = payload.android || { notification: {} };
  payload.android.notification = payload.android.notification || {};
  payload.android.notification.channelId = sound.channel;
  payload.android.notification.sound = sound.android; // ook hier zodat het zonder channel werkt
  return payload;
}

module.exports.applySound = applySound;
```

In elke `onNew*.js` Cloud Function:
```js
const { applySound } = require('../utils/badge-helper');
// ... bestaand basePayload bouwen ...
applySound(basePayload, 'announcements'); // of 'event_messages', etc.
```

**Stap 4 — Foreground notifications (`notification_service.dart`)**

`_handleForegroundMessage` moet ook de juiste channel + sound gebruiken bij het tonen van de lokale notificatie:

```dart
final type = message.data['type'] ?? '';
final channelId = _channelIdForType(type);  // bv. 'event_messages_v2'

final androidDetails = AndroidNotificationDetails(
  channelId,
  _channelNameFor(channelId),
  importance: Importance.high,
  priority: Priority.high,
  // sound wordt automatisch overgenomen van het channel
);
```

**Stap 5 — Version bump verplicht**

Omdat we channels migreren is een **version bump nodig** (`1.4.3+125` → `1.5.0+126`, want minor) en moeten we documenteren dat users na de update mogelijks even hun notification settings moeten checken (per-channel mute states gaan verloren).

**Stap 6 — Sound files leveren**

Vraag aan Jan:
- Heb je eigen sound files (van Calypso club, gerelateerd aan duiken)?
- Of mag ik royalty-free notification sounds zoeken op zapsplat / freesound.org?
- Of moet ik ze genereren (bv. via een audio synth of beschikbare CC0 packs)?

---

### Fix #12 — Self-notif suppression als de juiste screen al open is

**Probleem:** als je in `EventDiscussionTab` zit en iemand stuurt een bericht, krijg je nog steeds een lokale notif terwijl je het bericht gewoon ziet binnenrollen. Zelfde voor team chat, session chat, etc.

**Oplossing:** een lichte `NotificationContextService` die bijhoudt welk scherm/contextkey actief is.

Bestand: `lib/services/notification_context.dart` (nieuw):
```dart
class NotificationContext {
  static String? _activeContext;
  static String? get active => _activeContext;
  static void enter(String key) => _activeContext = key;
  static void exit(String key) {
    if (_activeContext == key) _activeContext = null;
  }
}
```

In elk relevant scherm `initState` / `dispose`:
```dart
@override
void initState() {
  super.initState();
  NotificationContext.enter('event_${widget.operationId}');
}
@override
void dispose() {
  NotificationContext.exit('event_${widget.operationId}');
  super.dispose();
}
```

In `notification_service.dart._handleForegroundMessage`:
```dart
final type = message.data['type'];
final id = message.data['operation_id'] ?? message.data['session_id'] ?? '';
final contextKey = '${type == 'event_message' ? 'event' : type}_$id';
if (NotificationContext.active == contextKey) {
  // user kijkt al naar deze conversatie — geen lokale notif tonen
  // wel: badge counter updaten
  await UnreadCountProvider.instance?.refresh();
  return;
}
// ... gewone flow ...
```

---

### Fix #13 — `onNewBugReport` Cloud Function (Jan-only ping)

Uit `docs/plan-bug-reporting.md` sectie 3.3.

**Bestand:** `functions/src/notifications/onNewBugReport.js` (nieuw)

```js
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const JAN_USER_ID = 'jan-uid-here'; // zet de echte UID van Jan

exports.onNewBugReport = onDocumentCreated({
  document: 'clubs/{clubId}/bug_reports/{reportId}',
  region: 'europe-west1',
}, async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const janDoc = await admin.firestore()
    .collection('clubs').doc(event.params.clubId)
    .collection('members').doc(JAN_USER_ID)
    .get();
  const tokens = janDoc.data()?.fcm_tokens || [];
  if (tokens.length === 0) return;

  await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: '🐛 Nouveau bug report',
      body: `${data.user_name || 'Anonyme'} : ${(data.message || '').substring(0, 80)}`,
    },
    data: {
      type: 'bug_report',
      report_id: event.params.reportId,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    },
    apns: { payload: { aps: { sound: 'default', 'content-available': 1 } } },
    android: { notification: { channelId: 'announcements_urgent_v2' } },
  });
});
```

In `functions/index.js`:
```js
exports.onNewBugReport = require('./src/notifications/onNewBugReport').onNewBugReport;
```

> **Voorwaarde:** vereist eerst de bug-reporting feature uit `docs/plan-bug-reporting.md`. Pas in dezelfde release uitrollen.

---

## 11. Best practices uit web research

Tijdens dit onderzoek doorgenomen Firebase/Apple/community best-practice docs (zie sectie 14 voor links):

1. **Gebruik atomaire FieldValue transforms voor counters.** `FieldValue.increment()` is server-side atomair en race-safe. Het lezen-en-terugschrijven van een teller breekt deze garantie.
2. **Gebruik dot-notation voor partial map updates.** `'unread_counts.total': FieldValue.increment(1)` verandert alleen één veld; map-overwrites wissen onbedoeld parallelle writes.
3. **Sla `app_version` op naast het FCM token.** Bij elke launch: vergelijk → bij verschil force `deleteToken()` + nieuwe `getToken()`. Apple en Google kunnen tokens rotaten tijdens grote updates en je `onTokenRefresh` listener kan dat missen.
4. **APNs `aps.badge` is per-user.** Stuur het juiste getal mee per device. De client kan het badge-getal niet betrouwbaar vanuit de payload reconstrueren.
5. **Verwijder tokens bij `messaging/registration-token-not-registered`** en `messaging/invalid-registration-token`. Dit is de enige gecertifieerde manier om dood-tokens te weten te komen.
6. **`app_badge_plus` is launcher-afhankelijk op Android.** Documenteer dit in de app FAQ; bouw geen UI-beloften die op stock Pixel niet kunnen waargemaakt worden.
7. **Gebruik snapshot-listeners ipv timer + delay** voor Firestore consistency wachten. Een snapshot listener op het eigen member-document is goedkoper en correcter dan een 2s delay.
8. **Token TTL ~270 dagen** voor inactieve apps — daarna invalidert FCM ze automatisch (zie sectie 11.1).
9. **Logout = expliciete cleanup.** `removeTokenFromFirestore` + `stopListeningForTokenRefresh` + (optioneel) `_messaging.deleteToken()`.
10. **Monitor delivery degradation.** Een batch met meer failures dan successes is een rode vlag voor stale tokens of een misgeconfigureerde APNs cert.

### 11.1 Harde limieten en TTL's die we moeten kennen

Dit zijn de Firebase/APNs limieten die in de code-basis zelf NIET zichtbaar zijn maar wel impact hebben:

| Limiet | Waarde | Bron | Impact CalyMob |
|---|---|---|---|
| `sendEachForMulticast` max tokens per call | **500** | Firebase Admin SDK docs | Geen probleem — wij sturen per member apart, max 1–3 tokens per call |
| HTTP/2 concurrency in `sendEachForMulticast` | praktische crash boven **~50–100 tokens** | firebase-admin-node issue #2488, #2943 | Geen probleem zolang we per-member sturen |
| FCM HTTP v1 quota | **600 000 quota tokens / 1-minuut bucket** | Firebase docs | Met ~100 leden + 12 functies hebben we marge x1000+ |
| FCM token TTL bij inactiviteit | **~270 dagen**, daarna automatische invalidatie | FCM token management docs | Stale tokens > 60 dagen worden door ons gelogd, > 270 dagen verwijdert FCM zelf |
| Notificatie payload max grootte | **4 KB** total payload | FCM docs | Wij zitten ~600 bytes — ruim binnen limiet |
| Notification channels mutability (Android) | **immutable na creatie** | Android docs | Sound/importance wijzigen vereist nieuw channel ID met `_v2` suffix |
| Apple "Critical Alerts" entitlement | apart aanvragen bij Apple | Apple docs | Niet aangevraagd — `time-sensitive` is genoeg voor onze urgent announcements |
| Android background restrictions | OEM-specifiek (Xiaomi/Huawei doden FCM agressief) | OEM docs | Workaround = battery optimization disable in app settings |

**Wat dit ons leert:**
- Onze keuze om `sendEachForMulticast` per member te roepen ipv één bulk-call is correct: het beschermt ons tegen de HTTP/2 crash en geeft ons per-member badges. Het kost wel meer quota-tokens, maar bij 100 leden × 12 functies × ~10 events/dag = ~12 000 calls/dag, wat triviaal is op 600 K/minuut.
- We hoeven geen batching te bouwen voor het 500-device limit zolang Calypso onder de 100 leden blijft.
- Token expiration moeten we proactief opvangen (Fix #5 + Fix #10) want passief wachten op de 270-dagen TTL is te traag.

### 11.2 Onze design choices, expliciet gemaakt

Een paar architectuurkeuzes lijken raar als je ze niet kent. Hier de rationale:

1. **`FirebaseAppDelegateProxyEnabled = false` op iOS.** We willen volledige controle over `apnsToken` (nodig voor sandbox/production switching, deep link routing). Manual hook in `AppDelegate.swift` is verplicht.
2. **Per-member `sendEachForMulticast` ipv bulk multicast.** Per-member badges (`aps.badge`) zijn anders niet correct te zetten. Plus: HTTP/2 stress weg.
3. **Twee parallelle token-velden (`fcm_token` + `fcm_tokens[]`).** `fcm_tokens` is de bron van waarheid; `fcm_token` is legacy fallback voor oude code-paden in CalyCompta die nog niet gemigreerd zijn.
4. **`LocalReadTracker` ipv server-side `read_by` arrays.** Schaalt beter (Firestore array writes worden duur boven 100 lezers per bericht). Wel: cross-device leesstatus gaat verloren — bewust geaccepteerd.
5. **Foreground push handelt 2 listeners af** (`notification_service.dart` + `main.dart`). Dit is onbedoeld (technische schuld); Fix #12 consolideert dit.
6. **Geen `FirebaseMessagingService` subclass op Android.** We laten de default plugin het werk doen omdat we via `firebaseMessagingBackgroundHandler` (top-level Dart) alle background routing in Dart kunnen houden.
7. **6 Android channels expliciet aangemaakt.** Per categorie een channel zodat users individueel kunnen muten via Android settings én zodat we per channel een eigen sound kunnen instellen (Fix #11).

---

## 12. Verification & roll-out

### Verification checklist (na alle fixes)

1. `flutter analyze` — geen nieuwe errors.
2. `cd functions && npm run lint` — geen nieuwe errors.
3. **Manual smoke test** op een testtoestel:
   - Vers installeren → login → check dat badge = 0 op het app-icoon.
   - Stuur een testaankondiging vanuit CalyCompta → badge verschijnt (iOS), notificatie pop-up.
   - Hoor je het juiste **announcement-geluid** (Fix #11)?
   - Stuur een team message → ander geluid?
   - Open de aankondiging → badge gaat naar 0 binnen 1 seconde.
   - Open `EventDiscussionTab`, stuur vanuit een ander account een event-message → géén lokale notif (Fix #12), wel zie je het bericht binnenkomen.
   - Logout → check Firestore: `fcm_tokens` array bevat dit token niet meer.
   - Login terug → badge blijft 0 (geen rebound).
   - Bump version naar 1.5.0+126 → herinstall → check dat oude tokens uit array verdwijnen, nieuwe wordt toegevoegd.
   - Push een aankondiging → komt door op het nieuwe token.
4. Cloud Functions logs checken op stale-token warnings na 1 dag draaien.
5. **iOS Critical Alerts smoke test:** stuur een `urgent` announcement → check `interruption-level: time-sensitive` werkt zelfs in Focus mode.

### Roll-out plan

- **Branch:** `fix/notifications-and-badges`
- **Stap 1:** Cloud Functions deployen (Fix #8, #10, server-side van Fix #11 = `applySound` helper, Fix #13 indien bug reporting al bestaat). Backwards compatible: clients zonder `_v2` channels vallen terug op de default channel.
- **Stap 2:** Client patch + minor bump (`1.5.0+126`), build via `./scripts/build_release.sh --bump minor` (minor omdat we channels migreren). Bevat Fix #2, #3, #4, #5, #6, #7, #9, #11 (client side), #12.
- **Test:** eerst intern (Jan + 2 testers), daarna staged Play Store + TestFlight rollout.

---

## 12bis. Open verbeteringen / niet-blokkerend

Dingen die niet in de huidige fix-batch hoeven, maar nuttig zijn voor later:

### Klein

- **Battery optimization disable prompt op Android.** Sommige OEM's (Xiaomi, Huawei, Vivo) doden FCM agressief. Een eenmalige prompt met deeplink naar `Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` lost dat op.
- **In-app FAQ over Android-launcher badge limiet.** Documenteer voor Pixel-users dat de numerieke badge niet werkt — Android limiet, geen CalyMob bug.
- **Local notifications optionele preview-clear.** Bij `markAsRead` op een conversatie ook de bijhorende lokale notifs uit het notification center halen via `flutterLocalNotificationsPlugin.cancel(notificationId)`.

### Middelgroot

- **Snapshot listener op het eigen member-document** ipv 60s `Timer.periodic` voor `unread_counts`. Real-time updates en goedkoper qua battery.
- **Notification preferences screen (P3 uit refactor plan).** Per-categorie toggle in `lib/screens/profile/notification_preferences_screen.dart`. Server-side filter via `filterByPreference` is al klaar.
- **Granulaire mute-opties:** "Mute deze conversatie 1 uur / tot morgen / voor altijd". Vereist een `muted_conversations` map op het member-doc plus filter in elk Cloud Function.

### Groot

- **Apple Critical Alerts entitlement aanvragen** (apart bij Apple). Maakt urgent announcements luidruchtig zelfs in Do Not Disturb. Vereist business justification; voor een duikclub die ook noodweer-cancellaties stuurt potentieel verdedigbaar.
- **Reactions / read receipts met Firestore aggregations** ipv local read tracker. Zou de cross-device sync van `markAsRead` herstellen (klacht die LocalReadTracker bewust negeerde).
- **Analytics dashboard voor notif delivery** in CalyCompta admin: per categorie de slaagratio, gemiddelde latency, % stale tokens. Helpt operationeel monitoren.

---

## 13. Code-wegwijzer

| Wat je zoekt | Bestand + regels |
|---|---|
| Push permissie vragen | `lib/services/notification_service.dart` r. 58-66 |
| FCM token opslaan | `lib/services/notification_service.dart` r. 286-343 |
| Token refresh listener | `lib/services/notification_service.dart` r. 97-120 |
| Token verwijderen (niet aangeroepen) | `lib/services/notification_service.dart` r. 432-464 |
| Foreground push → lokale notif | `lib/services/notification_service.dart` r. 129-188 |
| Android channels (6) | `lib/services/notification_service.dart` r. 191-269 |
| Background handler (top-level) | `lib/services/notification_service.dart` r. 591-597 |
| `updateBadgeFromFirestore` (Bug B) | `lib/services/notification_service.dart` r. 568-587 |
| Login init notificaties | `lib/providers/auth_provider.dart` r. 37-65 |
| Logout (Bug C — geen cleanup) | `lib/providers/auth_provider.dart` r. 151-179 |
| Tap-routing | `lib/main.dart` r. 236-381 |
| Lifecycle badge refresh | `lib/main.dart` r. 402-471 |
| Token re-save bij resume | `lib/main.dart` r. 420-435 |
| Badge cache + 60s timer | `lib/providers/unread_count_provider.dart` r. 54-170 |
| Sync naar Firestore (Bug A) | `lib/providers/unread_count_provider.dart` r. 176-204 |
| Count() queries | `lib/services/unread_count_service.dart` (alles) |
| Install baseline | `lib/services/local_read_tracker.dart` r. 30-44 |
| AppDelegate APNs hook | `ios/Runner/AppDelegate.swift` r. 36-64 |
| iOS background modes | `ios/Runner/Info.plist` (`UIBackgroundModes`) |
| iOS entitlement | `ios/Runner/Runner.entitlements` (`aps-environment`) |
| Android permission | `android/app/src/main/AndroidManifest.xml` r. 32 |
| Cloud Function: badge-helper | `functions/src/utils/badge-helper.js` (alles) |
| `incrementUnreadCounts` | `functions/src/utils/badge-helper.js` r. 20-52 |
| `getBadgeCount` | `functions/src/utils/badge-helper.js` r. 61-81 |
| `collectTokensAndMembers` | `functions/src/utils/badge-helper.js` r. 93-153 |
| `sendNotificationsWithBadge` | `functions/src/utils/badge-helper.js` r. 166-238 |
| `decrementUnreadCounts` | `functions/src/utils/badge-helper.js` r. 248-283 |
| `filterByPreference` (P3) | `functions/src/utils/badge-helper.js` r. 293-303 |
| Increment volgorde voorbeeld | `functions/src/notifications/onNewAnnouncement.js` r. 105-109 |
| Bug E (read_by dood) | `functions/src/notifications/onEventStatusChange.js` r. 71-75 |
| Invalid token cleanup | `functions/src/utils/badge-helper.js` r. 208-225 |

---

## 14. Bron-documenten

Dit master document is een consolidatie van de volgende bestaande docs in `CalyMob/docs/`:

| Bron | Datum | Bijdrage aan dit doc |
|---|---|---|
| `NOTIFICATIONS_EN_BADGES_RAPPORT.md` | 8 apr 2026 | Architectuur, code-inventaris, push-pijplijn, badge-systeem, iOS/Android verschillen, bug-analyse, code-wegwijzer |
| `NOTIFICATIONS_FIX_PLAN.md` | 8 apr 2026 | Het 10-fix staged plan in sectie 10 |
| `guides/NOTIFICATION_REFACTOR_PLAN.md` | 21 mrt 2026 | P1/P2/P3 targeting plan en `notification_preferences` schema in sectie 8 |
| `setup/PLAN_PUSH_NOTIFICATIONS.md` | 2024 | Originele setup van `fcm_tokens` storage en Cloud Function patroon |

**Nieuw materiaal in dit doc** (niet uit bestaande bronnen):
- Web research naar Firebase/APNs best-practices van 2025 (sectie 11)
- Force token rotation bij version change (Fix #5) — gebaseerd op Jan's feedback over historische token-problemen
- Reset `unread_counts` op verse install (Fix #6) — sluit gat tussen `LocalReadTracker` en server state
- Marquer-tout-comme-lu escape hatch (Fix #7)

### Externe bronnen / best practices (web)

- [Best practices for FCM registration token management — Firebase docs](https://firebase.google.com/docs/cloud-messaging/manage-tokens)
- [Receive messages in Apple platform apps — Firebase docs](https://firebase.google.com/docs/cloud-messaging/ios/receive-messages)
- [Incrementing Values Atomically with Cloud Firestore — Firebase blog](https://firebase.blog/posts/2019/03/increment-server-side-cloud-firestore/)
- [app_badge_plus pub.dev](https://pub.dev/packages/app_badge_plus) — Android badge support is launcher-afhankelijk
- [Lifecycle of FCM device tokens — Medium](https://medium.com/@chunilalkukreja/lifecycle-of-fcm-device-tokens-61681bb6fbcf)

---

## 📌 Volgende stappen voor Jan

1. **Lees dit document** als referentie en controleer of de architectuur/bugs zoals beschreven kloppen met je verwachting.
2. **Goedkeuring vragen voor het fix-plan in sectie 10.** Specifiek: ben je akkoord dat we `onEventStatusChange` slopen ipv repareren?
3. **Eens akkoord:** ik begin de fixes uit te voeren in de volgorde die in sectie 10 staat (Cloud Functions eerst, daarna client). Per fix: code wijziging + `flutter analyze` + commit + push.
4. **Build & release** via `./scripts/build_release.sh --bump patch` zodra alles op `develop` getest is.

*Einde master document. Bestanden en regelnummers verwijzen naar de working tree op 8 april 2026 (CalyMob 1.4.2+124).*
