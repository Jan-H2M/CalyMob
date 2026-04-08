# CalyMob — Notificaties & Badge-systeem

**Technisch onderzoeksrapport**
Auteur: onderzoek uitgevoerd op de huidige master branch
Datum: 8 april 2026
Scope: push-notificaties (iOS + Android) en het systeem achter de rode ongelezen-badges

---

## 1. Samenvatting in één paragraaf

CalyMob gebruikt **Firebase Cloud Messaging (FCM)** voor push-notificaties, aangestuurd door **12 Cloud Functions (Gen 2, Node 20, regio `europe-west1`)** die reageren op Firestore-schrijfacties. De rode bolletjes (badges) zitten op twee plaatsen tegelijk: **server-side** in een `unread_counts` map op elk member-document, en **client-side** via een **`LocalReadTracker`** die per conversatie een `lastRead` timestamp bijhoudt in `SharedPreferences`. De client herberekent elke 60 seconden de tellers uit Firestore `count()` queries, schrijft ze terug naar het member-document (om APNs-badges correct te houden) en zet het app-icoon-badge via het `app_badge_plus` pakket. Het systeem werkt, maar bevat **vijf reële bugs** en **drie architecturele risico’s** die hieronder uitvoerig worden behandeld.

---

## 2. Architectuuroverzicht

### 2.1 Gelaagdheid

```
┌─────────────────────────────────────────────────────────────────────┐
│  CalyCompta web (admin) + CalyMob Flutter client                    │
│  — schrijven berichten / events / certificaten in Firestore         │
└───────────────────┬─────────────────────────────────────────────────┘
                    │  Firestore write
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Firebase Firestore  (project: calycompta, club: calypso)           │
│  - clubs/{clubId}/announcements                                     │
│  - clubs/{clubId}/operations/{opId}/messages                        │
│  - clubs/{clubId}/team_channels/{ch}/messages                       │
│  - clubs/{clubId}/piscine_sessions/{s}/messages                     │
│  - clubs/{clubId}/members/{id}/medical_certificates                 │
│  - clubs/{clubId}/members/{id}   ← unread_counts map + fcm_tokens   │
└───────────────────┬─────────────────────────────────────────────────┘
                    │  onDocumentCreated / onDocumentUpdated triggers
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Cloud Functions Gen2  (europe-west1, Node 20)                      │
│  - onNewAnnouncement          - onNewTeamMessage                    │
│  - onNewAnnouncementReply     - onNewSessionMessage                 │
│  - onNewEventMessage          - onNewOperation                      │
│  - onEventStatusChange        - onPiscineTaskAssigned               │
│  - onMedicalCertStatusChange  - sessionReminder (scheduled)         │
│  - onMedicalCertCreated                                             │
│                                                                     │
│  Alles deelt badge-helper.js:                                       │
│    1. collectTokensAndMembers()   (filter stale, dedup)             │
│    2. incrementUnreadCounts()     (Firestore FieldValue.increment)  │
│    3. sendNotificationsWithBadge()                                  │
│       - per member badge berekend via getBadgeCount()               │
│       - sendEachForMulticast met dynamische APNs `badge`            │
│       - invalid tokens → arrayRemove cleanup                        │
└───────────────────┬─────────────────────────────────────────────────┘
                    │  HTTP/2
                    ▼
┌───────────────────────────────────────┐
│  FCM brokers                          │
│  - APNs (iOS)  sandbox/prod           │
│  - FCM/GCM (Android)                  │
└─────┬───────────────────────┬─────────┘
      ▼                       ▼
┌──────────────────┐   ┌────────────────────┐
│  iOS device      │   │  Android device    │
│  AppDelegate     │   │  Default Activity  │
│  → FCM plugin    │   │  → FCM plugin      │
│  → notification  │   │  → notification    │
│     _service     │   │     _service       │
│  → local notif   │   │  → channel route   │
│  → setBadge()    │   │  → setBadge()      │
└──────────────────┘   └────────────────────┘
```

### 2.2 Betrokken bestanden (Flutter)

| Laag | Bestand | Verantwoordelijkheid |
|---|---|---|
| Platform config (iOS) | `ios/Runner/AppDelegate.swift` | Registreert APNs, handelt `didRegisterForRemoteNotificationsWithDeviceToken`, forward naar Firebase Messaging |
| Platform config (iOS) | `ios/Runner/Info.plist` | `UIBackgroundModes = fetch, remote-notification`, `FirebaseAppDelegateProxyEnabled = false` |
| Platform config (iOS) | `ios/Runner/Runner.entitlements` | `aps-environment = production` |
| Platform config (Android) | `android/app/src/main/AndroidManifest.xml` | `POST_NOTIFICATIONS`, `VIBRATE` |
| Flutter service | `lib/services/notification_service.dart` | FCM init + permissies, token opslag, token refresh, foreground message → local notification, channel aanmaak, app-icoon badge |
| Helpers platform split | `lib/services/notification_service_io.dart` / `_web.dart` | `isIOS` / `isAndroid` detectie |
| State | `lib/providers/auth_provider.dart` | Roept `saveTokenToFirestore` + `listenForTokenRefresh` aan bij login |
| Badge backend | `lib/services/local_read_tracker.dart` | Per-conversatie `lastRead` timestamps in `SharedPreferences` |
| Badge backend | `lib/services/unread_count_service.dart` | Firestore `count()` queries per categorie, gebruik makend van LocalReadTracker |
| Badge state | `lib/providers/unread_count_provider.dart` | 60s timer, cache, schrijft counts terug naar Firestore + update app-icoon badge |
| App-level integratie | `lib/main.dart` | Background handler, foreground handlers, notification-tap routing, app lifecycle hooks |

### 2.3 Betrokken bestanden (Cloud Functions)

| Bestand | Trigger | Doel |
|---|---|---|
| `functions/src/utils/badge-helper.js` | (shared) | Core: token verzameling, unread increment/decrement, `sendNotificationsWithBadge` |
| `functions/src/utils/constants.js` | (shared) | `FIRESTORE_BATCH_LIMIT`, `EVENT_EXPIRY_GRACE_DAYS` |
| `onNewAnnouncement.js` | `announcements/{id}` create | Stuur broadcast naar alle `app_installed` members |
| `onNewAnnouncementReply.js` | `announcements/{id}/replies/{r}` create | Alleen naar de originele auteur + eerdere repliërs |
| `onNewEventMessage.js` | `operations/{op}/messages/{m}` create | Alleen naar `inscriptions` van het event; skip verlopen events |
| `onEventStatusChange.js` | `operations/{op}` update (`statut`) | Decrement unread wanneer event sluit |
| `onNewTeamMessage.js` | `team_channels/{ch}/messages/{m}` create | Naar members met rol `accueil` of `encadrant(s)` |
| `onNewSessionMessage.js` | `piscine_sessions/{s}/messages/{m}` create | Afhankelijk van `group_type` (accueil / encadrants / niveau) |
| `onNewOperation.js` | `operations/{op}` create | Broadcast bij nieuwe duik/evenement |
| `onPiscineTaskAssigned.js` | `piscine_sessions/{s}` update | Diff oud/nieuw → notify nieuwe gebruikers bij een taak |
| `onMedicalCertStatusChange.js` | `members/{m}/medical_certificates/{c}` update | Approval/reject → persoonlijke notificatie |
| `sessionReminder.js` | scheduled | Dagelijkse herinnering aan komende piscine sessies |

---

## 3. De push-notificatie-pijplijn, stap voor stap

### 3.1 Registratie van een device (eerste keer inloggen)

1. **iOS boot** (`AppDelegate.swift`)
   - `application:didFinishLaunchingWithOptions` vraagt APNs-autorisatie (`.alert, .badge, .sound`) en roept `registerForRemoteNotifications()` aan.
   - Zodra Apple het APNs-token teruggeeft, wordt het via `Messaging.messaging().apnsToken = deviceToken` aan Firebase gegeven. **Belangrijk detail**: `FirebaseAppDelegateProxyEnabled = false` in `Info.plist`, dus zonder deze override-methode zou Firebase het token nooit krijgen.
   - `UIBackgroundModes = [fetch, remote-notification]` is aanwezig — nodig voor stille (content-available) wake-ups.
   - Entitlement `aps-environment = production` — **let op**: voor dev-builds moet Xcode automatisch switchen via een debug.entitlements of provisioning profile.

2. **Android boot**
   - Runtime permission `POST_NOTIFICATIONS` wordt opgevraagd via `FirebaseMessaging.instance.requestPermission()` in `NotificationService.initialize()`.
   - Er is **geen expliciete `FirebaseMessagingService` subklasse** in de Android-manifest — de app leunt volledig op de default FCM service die het Flutter-plugin mee registreert.

3. **Flutter initialisatie** (`main.dart` → `NotificationService.initialize()`)
   - Android: zes notificatiekanalen worden aangemaakt: `announcements`, `event_messages`, `medical_certificates`, `team_messages`, `piscine_messages`, `piscine_tasks` — allemaal `Importance.high`.
   - iOS/Android: `FlutterLocalNotificationsPlugin.initialize()` met `onDidReceiveNotificationResponse` als tap-handler.
   - `requestPermission()` → als `authorized`, haalt meteen een FCM token op.
   - `setupForegroundNotifications()` koppelt `FirebaseMessaging.onMessage` aan `_handleForegroundMessage`.

4. **Login** (`auth_provider.dart`)
   - `authStateChanges.listen((user) { ... })` detecteert een ingelogde user en roept:
     - `saveTokenToFirestore(clubId, user.uid)` — schrijft in `clubs/{clubId}/members/{uid}`:
       - `fcm_tokens` ← `FieldValue.arrayUnion([token])` (multi-device)
       - `fcm_token` ← zelfde token (legacy fallback)
       - `fcm_token_updated_at` ← server timestamp
       - `notifications_enabled = true`
       - Ook `app_installed = true`, `app_platform`, `app_version`, `device_model`, `device_os_version`, locale, timezone, schermresolutie, enz. (tracking-velden)
     - `listenForTokenRefresh(clubId, user.uid)` — subscriped op `FirebaseMessaging.onTokenRefresh` om geroteerde tokens op te slaan.
   - Bij logout wordt **enkel** `stopListeningForTokenRefresh()` aangeroepen. **Het token wordt NIET uit Firestore verwijderd** — zie Bug #4.

5. **App resume hook** (`main.dart` → `didChangeAppLifecycleState`)
   - Op `AppLifecycleState.resumed` roept `_refreshFcmToken()` nogmaals `saveTokenToFirestore` aan. Dit is een vangnet voor tokens die tijdens background-tijd geroteerd zijn.

### 3.2 Een berichtje komt binnen — de eerste helft (server)

Voorbeeld: een admin plaatst een announcement vanuit CalyCompta.

1. CalyCompta schrijft een document in `clubs/calypso/announcements/{id}`.
2. `onNewAnnouncement` triggert (Gen2, region `europe-west1`). Flow in `onNewAnnouncement.js`:
   1. Query `clubs/calypso/members` waar `app_installed == true`.
   2. `collectTokensAndMembers(memberDocs, senderId)` — uit `badge-helper.js`:
      - sluit `senderId` uit (niet jezelf notifieren)
      - sluit members met `notifications_enabled === false` uit
      - detecteert “stale” tokens (`fcm_token_updated_at` > 30 dagen oud) en logt ze als warning
      - bouwt:
        - `tokens` (flat list, gededupliceerd)
        - `tokenToMember` map (token → `{memberId}`)
        - `memberTokenGroups` map (memberId → `[tokens]`) **← hier zit de kern van per-member badge logica**
        - `recipientIds`
   3. Bouwt een basepayload met:
      - `notification.title` + `.body` (top-level)
      - `data` met `type`, `club_id`, `announcement_id`, `click_action`
      - `android.notification.channelId = 'announcements'`, `priority: max|high`
      - `apns.headers.apns-priority = '10'`
      - `apns.payload.aps.alert` **+** `sound: 'default'` **+** `'content-available': 1`
      - voor `type === 'urgent'`: `aps.interruption-level = 'time-sensitive'`
   4. **Volgorde is bewust**: eerst `incrementUnreadCounts(clubId, recipientIds, 'announcements')` op alle ontvangers (Firestore `FieldValue.increment(1)` voor zowel `unread_counts.announcements` als `unread_counts.total`), **daarna** pas `sendNotificationsWithBadge(...)`. Zo is de badge al up-to-date op het moment dat de push verstuurd wordt.
   5. `sendNotificationsWithBadge` in `badge-helper.js`:
      - Voor elke memberId parallel (`Promise.all`):
        - `getBadgeCount(clubId, memberId)` → leest `unread_counts.total` uit het member-doc
        - Bouwt een nieuwe payload waar `apns.payload.aps.badge = newBadge`
        - `admin.messaging().sendEachForMulticast({ tokens: memberTokens, ...payload })`
        - Voor elke falende response met `messaging/invalid-registration-token` of `registration-token-not-registered`: verwijdert het token uit `fcm_tokens` via `arrayRemove(failedToken)` (let op: **één token**, geen array — dit was de root cause van de bug die in februari werd gefixt, zie `NOTIFICATION_FIX_LOG.md`).

**Let op**: de **Android** payload krijgt géén `badge` veld van deze functie. Android toont badges via de launcher op basis van het aantal actieve notifications of een counted-shortcut API; omdat CalyMob `app_badge_plus` client-side gebruikt, verloopt de badge op Android vooral via de Flutter kant.

### 3.3 Een berichtje komt binnen — de tweede helft (client)

Er zijn **drie staten** waarin de telefoon een push kan ontvangen:

**A. App op de voorgrond**
- `FirebaseMessaging.onMessage` vuurt.
- Er zitten **twee** handlers op deze stream:
  1. `NotificationService._handleForegroundMessage` (in `notification_service.dart`): bouwt aan de hand van `message.data['type']` een kanaal (`event_messages`, `team_messages`, …) en toont een **lokale notificatie** via `flutter_local_notifications`. Payload is de volledige `message.data` als JSON — die wordt later door `_handleLocalNotificationTap` gebruikt voor routing.
  2. `_MyAppState._setupNotificationTapHandlers` (in `main.dart`): logt de message en plant na 2 seconden een `_refreshUnreadCounts()` + 1 seconde later een `_updateBadgeFromUnreadCounts()`. De 2s delay is bedoeld om Firestore-consistency af te wachten (Cloud Function moet eerst `unread_counts` geïncrementeerd hebben).

**B. App op de achtergrond (niet gekilled)**
- iOS/Android tonen de standaard systeemnotificatie automatisch (want de payload bevat een top-level `notification` object).
- De badge wordt op iOS direct gezet via `aps.badge` — dit werkt omdat `sendNotificationsWithBadge` per member een actueel getal meestuurt.
- Op Android wordt de notificatie naar het bijpassende channel geroute via `android.notification.channelId`. Geen automatische badge — die komt van `app_badge_plus` zodra de app weer open gaat.

**C. App gekilled (cold start via tap)**
- `FirebaseMessaging.instance.getInitialMessage()` in `_setupNotificationTapHandlers()` geeft het bericht terug.
- Er wordt 500ms gewacht, daarna `_handleNotificationTap(message)` voor routing.
- In de tussentijd heeft `firebaseMessagingBackgroundHandler` (top-level functie in `notification_service.dart`) het bericht gelogd.

**Tap-routing** (`main.dart` → `_handleNotificationTap`)
- Leest `data['type']` en routeert op basis van het type:
  - `event_message`, `new_operation` → `OperationDetailScreen`
  - `announcement`, `announcement_reply` → haalt het doc op, dan `AnnouncementDetailScreen`
  - `team_message` → `TeamChatScreen`
  - `session_message` → `SessionChatScreen` met de juiste `SessionChatGroup`
  - `piscine_task_assigned` → `SessionDetailScreen`
- **Alle Firestore reads in deze flow hebben een 5-seconde timeout** om ANR te voorkomen bij trage netwerken.
- **Niet gedekt**: `medical_certificate` heeft geen route. De push komt wel aan, maar tappen doet niets (navigation fallback = default warning log).

---

## 4. Het badge / “rode bolletjes” systeem in detail

Dit is het stuk waar CalyMob het meest complex wordt, omdat er **drie parallelle waarheden** zijn die gesynchroniseerd moeten blijven:

1. **App-icoon badge** (het rode bolletje op het home-screen icoon)
2. **In-app badges** (de rode bolletjes op knoppen zoals “Annonces”, “Événements”, “Piscine”)
3. **Server-side `unread_counts` map** (gebruikt door Cloud Functions om APNs het juiste badgegetal mee te geven)

### 4.1 Waarheidsbron #1: `LocalReadTracker` (client only)

Bestand: `lib/services/local_read_tracker.dart`

- Wrapper rond `SharedPreferences` met keys van de vorm `lastRead_<identifier>`, bv.:
  - `lastRead_announcements`
  - `lastRead_operation_<opId>`
  - `lastRead_team_equipe_accueil`
  - `lastRead_session_<sessionId>_<groupType>`
- **Install baseline detectie**: bij de eerste start van de app (key `localReadTracker_initialized` bestaat nog niet) wordt `_installBaseline` op `DateTime.now()` gezet. Dat zorgt ervoor dat alle berichten van **vóór** de installatie als “gelezen” worden beschouwd — anders zou een nieuwe user meteen 500 ongelezen meldingen zien.
- **Fallback voor bestaande installaties**: als er geen baseline is, wordt `DateTime(2024, 1, 1)` gebruikt (`_defaultEpoch` in `UnreadCountService`).
- `markAsRead(key)` wordt op specifieke plekken aangeroepen:
  - `announcement_detail_screen.dart` → `markAsRead('announcements')` bij scherm open
  - `event_discussion_tab.dart` → via `messageProvider.markAsRead(...)` bij tab open
  - `team_chat_screen.dart` en `session_chat_screen.dart` zijn vergelijkbaar
- `resetAll()` wordt aangeroepen bij `UnreadCountProvider.clear()` (logout-pad).

**Kracht**: zuiver lokaal, geen netwerkverkeer nodig om een conversatie als gelezen te markeren. **Zwakte**: als de user op device A een bericht leest, weet device B daar niets van.

### 4.2 Waarheidsbron #2: `unread_counts` map in Firestore member doc

Geschreven door twee partijen:
- **Cloud Functions** via `badge-helper.incrementUnreadCounts` — gebruikt `FieldValue.increment(1)` (atomisch):
  ```js
  batch.update(memberRef, {
    [`unread_counts.${category}`]: FieldValue.increment(1),
    'unread_counts.total': FieldValue.increment(1),
    'unread_counts.last_updated': FieldValue.serverTimestamp(),
  });
  ```
- **De client** via `UnreadCountProvider._syncCountsToFirestore`:
  ```dart
  await memberRef.update({
    'unread_counts': {
      'announcements': announcements,
      'event_messages': eventMessages,
      'team_messages': teamMessages,
      'session_messages': sessionMessages,
      'total': newTotal,
      'last_updated': FieldValue.serverTimestamp(),
    },
  });
  ```

**Opvallend**: de client doet een **overwrite** van de hele `unread_counts` map (niet merge, niet per-field update). Dit heeft forse implicaties — zie Bug #1 en Bug #5 hieronder.

### 4.3 Waarheidsbron #3: de in-memory tellers in `UnreadCountProvider`

- Vier velden: `_announcements`, `_eventMessages`, `_teamMessages`, `_sessionMessages`.
- Getter `total` = som van de vier (getter `medicalCertificates` geeft **hardgecodeerd 0** terug).
- Gelezen door UI-widgets (`landing_screen.dart`, badge indicators op knoppen) via `Provider.of<UnreadCountProvider>`.
- Geschreven door:
  - `_loadCachedCounts()` bij start — leest uit `SharedPreferences` (keys `unread_cache_*`), TTL = 5 minuten
  - `refresh()` elke 60 seconden via `Timer.periodic` of op specifieke events (app resume, foreground push received, markAsRead)

### 4.4 Hoe een teller gelezen wordt — het count-pad

`UnreadCountService.refreshAllCounts(clubId, roles)` roept vier functies parallel aan. Voor announcements bijvoorbeeld:

```dart
final lastRead = _tracker.getLastRead('announcements') ?? _epoch;
final ts = Timestamp.fromDate(lastRead);

final results = await Future.wait([
  _firestore.collection('clubs/$clubId/announcements')
      .where('created_at', isGreaterThan: ts)
      .get().timeout(8s),
  _firestore.collection('clubs/$clubId/announcements')
      .where('last_reply_at', isGreaterThan: ts)
      .get().timeout(8s),
]);

final unreadIds = <String>{};
for (final doc in results[0].docs) unreadIds.add(doc.id);
for (final doc in results[1].docs) unreadIds.add(doc.id);
return unreadIds.length;
```

Voor **event messages** wordt echter niet per document gequeryd maar via aggregation `query.count().get()` — dat bespaart bandbreedte, maar verhoogt Firestore kosten (elk `count()` is één “read” voor de factuur).

**Performance-guards**:
- `_maxOperationsToCount = 10` en `_maxSessionsToCount = 5` — enkel de N meest recente open events / sessies worden geteld om ANR te voorkomen bij users met veel geschiedenis.
- `_queryTimeout = 8 seconden` op elke losse query.

### 4.5 Hoe het app-icoon badge gezet wordt

Het pakket is **`app_badge_plus: ^1.2.8`**. Op iOS gebruikt het `UIApplication.setApplicationIconBadgeNumber`; op Android roept het de launcher-specifieke badge-API aan (werkt op Samsung One UI, Xiaomi MIUI, Huawei EMUI; **werkt NIET op stock Pixel / AOSP** — daar krijgen users enkel een dot als er actieve notifications zijn).

Plekken waar de badge gezet wordt:
1. `UnreadCountProvider._updateBadge(total)` na elke geslaagde refresh (alleen als de som veranderd is). Deze roept `AppBadgePlus.updateBadge(count)` aan **binnen een `addPostFrameCallback`** zodat de main thread niet hangt.
2. `main.dart` `_updateBadgeFromUnreadCounts()` bij app-lifecycle events (`resumed`, `paused`) en na foreground-pushes.
3. Bij push in background: iOS zet het via `aps.badge` in de payload, zie 3.2.
4. Er is een **`clearBadge()`** in `NotificationService`, maar die wordt nergens aangeroepen — dus de badge gaat alleen naar 0 als alle tellers daadwerkelijk 0 worden.

### 4.6 De volgorde van gebeurtenissen tijdens een typische dag

Scenario: je opent de app om 9:00, leest één announcement, komt om 14:00 terug.

```
09:00:00  App cold start
          ├─ main() init → LocalReadTracker().init()
          ├─ NotificationService.initialize()  (channels + permissies)
          ├─ runApp → MyApp initState
          │    └─ _updateBadgeFromUnreadCounts() (via Provider, total=0 nog)
          └─ LoginScreen → auto-login → AuthProvider.currentUser set
               ├─ saveTokenToFirestore()
               ├─ listenForTokenRefresh()
               └─ LandingScreen postFrame → UnreadCountProvider.listen()
                    ├─ _loadCachedCounts()   (instant UI update vanuit cache)
                    ├─ refresh()              (Firestore queries parallel)
                    │    ├─ toont 3 announcements + 1 event_message
                    │    ├─ _syncCountsToFirestore (schrijft map)
                    │    └─ _updateBadge(4)   (app icoon = 4)
                    └─ Timer.periodic(60s, refresh)

09:00:05  UI toont badges: Annonces=3, Événements=1

09:01:00  Je tapt "Annonces" → AnnouncementsScreen
          tapt de eerste announcement → AnnouncementDetailScreen
          ├─ initState → _markAsRead()
          │    └─ LocalReadTracker.markAsRead('announcements')
          └─ (maar refresh gebeurt nog niet — wachten op 60s timer)

09:02:00  Timer tick → refresh()
          ├─ count queries: announcements=0 (lastRead net bijgewerkt)
          ├─ event_messages=1
          └─ _updateBadge(1)

09:02:00  Je leest meteen het event bericht → LocalReadTracker.markAsRead('operation_xxx')
09:02:02  Intussen: iemand anders plaatst een nieuwe announcement
          └─ Cloud Function onNewAnnouncement:
              1. incrementUnreadCounts voor jou (Firestore: announcements=1, total=1)
              2. sendNotificationsWithBadge: leest unread_counts.total=1
              3. APNs push met badge=1
09:02:03  Je telefoon krijgt de push, app staat op voorgrond:
          └─ onMessage listener (notification_service) → lokale notif
          └─ onMessage listener (main.dart) → 2s delay → refresh()
                                            → 3s delay → _updateBadgeFromUnreadCounts()
09:02:05  refresh() loopt:
          ├─ count() query voor announcements: 1 (nieuw bericht > lastRead)
          ├─ _syncCountsToFirestore OVERSCHRIJFT de map met
          │  {announcements: 1, event_messages: 0, ..., total: 1}
          │  ✅ dit is hier nog correct want client en server eens
          └─ _updateBadge(1)

14:00:00  App resume
          └─ didChangeAppLifecycleState(resumed)
              ├─ _refreshUnreadCounts()
              ├─ _updateBadgeFromUnreadCounts()
              └─ _refreshFcmToken()
```

Ziet er gezond uit — **totdat** er een tweede categorie in het spel komt of een race condition.

---

## 5. iOS vs Android: de verschillen op één plek

| Aspect | iOS | Android |
|---|---|---|
| Toestemmingsmodel | UNUserNotificationCenter met `.alert .badge .sound` | Runtime `POST_NOTIFICATIONS` (Android 13+) + `VIBRATE` |
| Token delivery | APNs → `AppDelegate.didRegisterForRemoteNotificationsWithDeviceToken` → Firebase Messaging | Firebase Installations ID → auto via FCM plugin |
| Badge weergave | **Native** via `aps.badge` in payload (server bepaalt het getal) + `app_badge_plus` lokaal | Launcher-afhankelijk, `app_badge_plus` doet best-effort |
| Achtergrondverwerking | `content-available: 1` + `UIBackgroundModes = remote-notification` → iOS wekt de app kort | FCM data-messages worden door `firebaseMessagingBackgroundHandler` afgehandeld via isolate |
| Notificatiekanalen | n.v.t. (iOS heeft geen channels) | 6 kanalen expliciet aangemaakt in `_createNotificationChannel()` |
| Priority op server | `apns-priority: 10` (urgent) | `android.priority: 'high'` / `'max'` |
| Time-sensitive | `interruption-level: 'time-sensitive'` (alleen bij `announcement.type === 'urgent'`) | n.v.t. |
| Firebase App Delegate Proxy | **Uitgeschakeld** (`FirebaseAppDelegateProxyEnabled = false`) — manuele hook nodig | n.v.t. |
| Permission flow | Blokkerend dialog bij `initialize()` | Blokkerend dialog op Android 13+, stilzwijgend enabled op ouder |
| Badge reset | Wanneer `aps.badge` met `0` wordt meegestuurd (gebeurt nooit expliciet) of via `app_badge_plus.updateBadge(0)` | `app_badge_plus.updateBadge(0)` (vooral useless op Pixel) |

---

## 6. Gevonden bugs en risico’s

### Bug #1 — **Client sync overschrijft `unread_counts` zonder `medical_certificates` / extra velden**
**Bestand**: `lib/providers/unread_count_provider.dart` r. 176-204

`_syncCountsToFirestore` schrijft een volledig nieuwe `unread_counts` map met alleen de vier categorieën die de client kent. Gevolgen:

1. Als de Cloud Function `onMedicalCertStatusChange` (bestaat) of `onMedicalCertCreated` ooit een `unread_counts.medical_certificates = N` zet, dan wordt die **bij de volgende client refresh (max 60s later) weggeveegd**.
2. Hetzelfde geldt voor eventuele nieuwe categorieën die men later toevoegt aan Cloud Functions zonder de Flutter client te updaten.
3. Omdat `total` client-side enkel de som van de vier bekende categorieën is, wordt `unread_counts.total` op Firestore ook verlaagd, en bij de volgende push zal `sendNotificationsWithBadge → getBadgeCount` een te laag getal teruggeven voor de APNs badge.

**Fix** (eenvoudig): per-field update in plaats van map-overwrite:
```dart
await memberRef.update({
  'unread_counts.announcements': announcements,
  'unread_counts.event_messages': eventMessages,
  'unread_counts.team_messages': teamMessages,
  'unread_counts.session_messages': sessionMessages,
  'unread_counts.last_updated': FieldValue.serverTimestamp(),
});
// total laten berekenen via getBadgeCount dat ook medical_certificates meeneemt:
// OF totaal opnieuw berekenen door eerst read, daarna server-truth som.
```
Beter nog: lees eerst de huidige map, merge `medical_certificates` en eventuele onbekende keys, en schrijf het terug. Of laat de client `total` helemaal met rust en laat alleen de Cloud Function dat veld bijhouden.

---

### Bug #2 — **`NotificationService.updateBadgeFromFirestore` telt het totaal dubbel**
**Bestand**: `lib/services/notification_service.dart` r. 568-587

```dart
final unreadCounts = data['unread_counts'] as Map<String, dynamic>? ?? {};
int total = 0;
for (final value in unreadCounts.values) {
  if (value is int) total += value;
}
await setBadge(total);
```

`unread_counts` bevat `announcements`, `event_messages`, `team_messages`, `session_messages`, **en `total`**. Alle vier de categorieën worden opgeteld, daarna wordt `total` er nog eens bovenop gelegd → **2× de werkelijke waarde**. Alleen `last_updated` (Timestamp, geen int) wordt overgeslagen.

**Status**: Deze methode is momenteel **dead code** — er is geen call-site in `lib/` die `updateBadgeFromFirestore` aanroept. De badge gaat via `UnreadCountProvider.total`. Maar het is een landmijn die bij de eerste “laten we dit handig hergebruiken”-refactor ontploft.

**Fix**: ofwel deze methode weghalen, ofwel corrigeren tot `total = unreadCounts['total'] as int? ?? 0`.

---

### Bug #3 — **`onEventStatusChange` gebruikt verouderde `read_by` logica**
**Bestand**: `functions/src/notifications/onEventStatusChange.js` r. 71-75

```js
const unreadCount = messages.filter(msg => {
  const readBy = msg.read_by || [];
  return !readBy.includes(participantId);
}).length;
```

Het project is naar `LocalReadTracker` gemigreerd; `read_by` wordt **niet meer door de client bijgehouden** (zie comment in `event_message_service.dart` r. 193: “markMessagesAsRead verwijderd → LocalReadTracker.markAsRead('operation_$opId')”). Gevolgen wanneer een event op `ferme`/`annule` gezet wordt:

- `readBy` is altijd een lege array → `unreadCount == messages.length` voor elke participant.
- `decrementUnreadCounts(clubId, participantId, 'event_messages', unreadCount)` probeert dat aantal af te trekken.
- Gelukkig bevat `decrementUnreadCounts` een `Math.min(amount, currentValue)` guard, dus het gaat niet onder 0. Maar in de praktijk betekent dit dat je **alle event_messages van die user genuleerd worden**, ook voor andere open events, elke keer dat er een event gesloten wordt. Je badge kan plots naar 0 springen terwijl er nog andere ongelezen berichten zijn.

**Fix**: deze decrement is fundamenteel onverenigbaar met `LocalReadTracker`. Opties:
- **Optie A**: de Cloud Function helemaal laten vallen. Events die sluiten, laten hun unread_counts gewoon staan; de client refresht binnen 60s en schoont het dan zelf op (want `countUnreadEventMessages` filtert al op `statut = 'ouvert'`).
- **Optie B**: houdt `read_by` weer bij in de client (in batch-writes bij scherm-open). Werkt tegen de migratie in.
- **Aanbevolen**: Optie A. Verwijder `onEventStatusChange` of laat hem alleen `unread_counts.event_messages = 0` forceren voor de betreffende participants (simpeler en ongevaarlijker).

---

### Bug #4 — **FCM token wordt NIET verwijderd bij logout**
**Bestand**: `lib/providers/auth_provider.dart` r. 151-179

```dart
Future<void> logout() async {
  await _sessionService.deleteSession();
  await _authService.logout();
  _currentUser = null;
  ...
}
```

Er staat **geen** aanroep naar `_notificationService.removeTokenFromFirestore(clubId, user.uid)`. Gevolgen:

- Als gebruiker A uitlogt en gebruiker B op hetzelfde toestel inlogt, behoudt member A in Firestore het FCM token van dit toestel. Zelfs als user B dezelfde app opnieuw registreert, krijgt user A mogelijk nog steeds pushes — afhankelijk van of het token geroteerd is.
- Bij gedeelde familiedevices (bij een duikclub niet ondenkbaar) → lekkage van berichten tussen accounts.
- `notifications_enabled` blijft ook op `true` voor user A.

**Fix**: in `logout()` vóór `_authService.logout()`:
```dart
final user = _currentUser;
if (user != null) {
  await _notificationService.removeTokenFromFirestore(
    FirebaseConfig.defaultClubId, user.uid);
}
_notificationService.stopListeningForTokenRefresh();
```

---

### Bug #5 — **Race condition tussen server-increment en client-overwrite**
**Bestanden**: `badge-helper.js` (`incrementUnreadCounts`) + `unread_count_provider.dart` (`_syncCountsToFirestore`)

Scenario:

```
t=0    Cloud Function: increment → unread_counts.event_messages = 2
t=1s   Client 60s timer trigger → refresh():
       - countUnreadEventMessages queryt Firestore
       - indien de Firestore snapshot cache nog niet synced is, telt hij misschien 1
t=2s   _syncCountsToFirestore → overwrite met event_messages: 1
```

De atomische `increment` wordt dus **stilzwijgend verloren**. Dit kan iedere 60 seconden gebeuren bij elke concurrent write. Gecombineerd met Bug #1 (overwrite i.p.v. merge) is dit een structurele inconsistency.

**Fix**: zoals bij Bug #1 — per-field update, en bij voorkeur géén overwrite van `total` vanaf de client. Laat de source of truth voor `total` bij Firestore (Cloud Functions incrementen het, client leest het voor de badge via `getBadgeCount`).

Alternatief: gebruik een Firestore transaction die eerst reads en dan vergelijkt.

---

### Risico A — **Android badge is launcher-afhankelijk**
Op stock Android (Pixel, most OxygenOS builds, GrapheneOS) toont de launcher géén numeriek badge via `app_badge_plus`. Users krijgen enkel een dot bij actieve notifications. Dit is geen bug in CalyMob, maar **de UI-copy beloften (rode bolletjes) kloppen niet overal**. Overweeg een in-app FAQ-item.

### Risico B — **Stale token warnings leiden niet tot actie**
`badge-helper.collectTokensAndMembers` logt members met een FCM token > 30 dagen oud, maar **stuurt toch een push**. Dood-gewaande tokens blijven maandenlang opstapelen. Er is geen TTL of proactieve cleanup-job.

**Fix**: ofwel stop met pushen naar stale tokens (preventief) ofwel draai een scheduled function die na 90 dagen tokens hard verwijdert.

### Risico C — **APNs dev/prod entitlement hardcoded op `production`**
Dev-builds die via `flutter run` op een fysiek toestel gedraaid worden, kunnen pushes missen omdat het APNs token bij de verkeerde Apple server wordt geregistreerd. Xcode kiest normaal automatisch tussen debug/production via het provisioning profile, maar de entitlements override kan dat blokkeren. **Verifieer** of er een `DebugProfile.entitlements` met `aps-environment = development` bestaat voor Debug configuraties.

### Risico D — **Geen notificatie-route voor `medical_certificate` type**
De Cloud Function `onMedicalCertStatusChange` stuurt een push; `main.dart._handleNotificationTap` kent dit type **niet** en valt in de `default: debugPrint(warning)` case. De user krijgt de melding, maar tap doet niets.

**Fix**: case toevoegen die naar de `ProfileScreen` / medische certificaten tab navigeert.

### Risico E — **Dubbele stream-listeners op `FirebaseMessaging.onMessage`**
In `notification_service.dart` → `setupForegroundNotifications()` wordt `_handleForegroundMessage` gekoppeld. In `main.dart` → `_setupNotificationTapHandlers()` wordt een **tweede** listener toegevoegd die een badge-refresh plant. Dit is op zich correct (streams ondersteunen meerdere listeners), maar bij een hot restart tijdens development kunnen de listeners zich opstapelen. Tevens is de 2-seconden delay in `main.dart` een heuristiek die kan falen als Firestore latentie > 2s is.

**Fix**: consolidate in één listener die explicit `await`s tot increment zichtbaar is (via snapshot listener op het eigen member-doc i.p.v. delay-en-hopen).

---

## 7. Aanbevelingen, in volgorde van impact

1. **Fix #1 en #5 samen**: schakel `_syncCountsToFirestore` over naar per-field updates en stop met het client-side overschrijven van `unread_counts.total`. Laat de server de bron van waarheid voor `total` zijn. **Grootste impact op betrouwbaarheid van de badge.**
2. **Fix #4**: FCM token verwijderen bij logout. Klein werk, groot veiligheids-/privacywin.
3. **Fix #3**: `onEventStatusChange` herschrijven of slopen. Verhelpt plotselinge badge-drops wanneer events sluiten.
4. **Fix #2**: `updateBadgeFromFirestore` verwijderen (of repareren). Voorkomt toekomstige bugs.
5. **Risico D**: tap-handler voor `medical_certificate` toevoegen — 10 minuten werk, veel beter UX.
6. **Risico E**: één enkel foreground-listener, geschreven met snapshot-listener i.p.v. delays.
7. **Risico B**: scheduled cleanup van stale tokens > 90 dagen.
8. **Risico A**: FAQ-tekst voor Android-users dat badges niet op alle launchers werken.
9. **Unit-test toevoegen** die verifieert dat `unread_counts.total` consistent blijft na een sequence van (server-increment, client-refresh, server-increment). Dit is het soort bug dat alleen met integratietests gevonden wordt.
10. **Overweeg een monitoring hook** (Crashlytics log of Sentry event) in `badge-helper.sendNotificationsWithBadge` wanneer `failureCount > successCount`. Nu kom je het pas tegen bij handmatig logs doorzoeken.

---

## 8. Appendix: samenvattende code-wegwijzer

| Wat je zoekt | Bestand + regel |
|---|---|
| Push permissie vragen | `lib/services/notification_service.dart` r. 58-66 |
| FCM token opslaan | `lib/services/notification_service.dart` r. 286-343 |
| Token refresh listener | `lib/services/notification_service.dart` r. 97-120 |
| Foreground push → lokale notificatie | `lib/services/notification_service.dart` r. 129-188 |
| Android channels | `lib/services/notification_service.dart` r. 191-269 |
| Background handler (top-level) | `lib/services/notification_service.dart` r. 591-597 |
| Login-init van notificaties | `lib/providers/auth_provider.dart` r. 37-65 |
| Tap-routing | `lib/main.dart` r. 236-381 |
| Lifecycle badge refresh | `lib/main.dart` r. 402-471 |
| Badge cache + timer | `lib/providers/unread_count_provider.dart` r. 54-170 |
| Sync naar Firestore (bug #1/#5) | `lib/providers/unread_count_provider.dart` r. 176-204 |
| Count queries | `lib/services/unread_count_service.dart` alles |
| Install baseline | `lib/services/local_read_tracker.dart` r. 30-44 |
| AppDelegate APNs hook | `ios/Runner/AppDelegate.swift` r. 36-64 |
| iOS background modes | `ios/Runner/Info.plist` (`UIBackgroundModes`) |
| iOS entitlement | `ios/Runner/Runner.entitlements` (`aps-environment`) |
| Android permission | `android/app/src/main/AndroidManifest.xml` r. 32 |
| Cloud Function: badge logica | `functions/src/utils/badge-helper.js` alles |
| Cloud Function: increment volgorde | `functions/src/notifications/onNewAnnouncement.js` r. 105-109 |
| Cloud Function: bug in decrement | `functions/src/notifications/onEventStatusChange.js` r. 71-75 |
| Invalid token cleanup | `functions/src/utils/badge-helper.js` r. 208-225 |

---

*Einde rapport. Bestanden en regelnummers verwijzen naar de working tree op 8 april 2026.*
