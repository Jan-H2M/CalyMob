# 🔧 CalyMob — Notificaties & Badges Fix Plan

**Datum:** 8 april 2026
**Auteur:** Claude (na onderzoek + best-practices research)
**Versie basis:** 1.4.2+124
**Doel:** De vier klachten van gebruikers wegwerken en het systeem rustig laten draaien.

---

## 📋 De vier klachten (recap)

1. **Rode badge op het app-icoon verschijnt niet altijd** — soms geen bolletje, soms wel.
2. **Notificaties komen niet altijd door** — Jan ervaart dit ook op iOS.
3. **Badge blijft hangen na lezen** — pas later weg.
4. **Na herinstall komen oude notificaties terug** en kunnen niet collectief gewist worden.

---

## 🧠 Onderliggende root-causes (na audit)

### A. Race condition tussen client en Cloud Function op `unread_counts`

`UnreadCountProvider._syncCountsToFirestore()` schrijft elke 60s (en na elke `markAsRead`) **de hele map opnieuw**:

```dart
await memberRef.update({
  'unread_counts': {
    'announcements': announcements,
    'event_messages': eventMessages,
    'team_messages': teamMessages,
    'session_messages': sessionMessages,
    'total': newTotal,           // ← berekend client-side
    'last_updated': FieldValue.serverTimestamp(),
  },
});
```

Wat er fout gaat:

* Het overschrijft `medical_certificates` (wordt nergens client-side geteld) ⇒ die teller verdwijnt.
* Het overschrijft elke atomic `FieldValue.increment()` die de Cloud Function tegelijk doet ⇒ verloren badge-update.
* Het zet `total` zelf, terwijl de Cloud Function diezelfde `total` met `FieldValue.increment(1)` bijwerkt ⇒ systematische drift.

**Best practice (Firebase docs):** gebruik **veld-transformaties** (`FieldValue.increment`) en **dot-notation updates** zodat parallelle writes elkaar niet wissen. Gebruik nooit een full-map overwrite voor counters.

### B. Dubbeltelling in `NotificationService.updateBadgeFromFirestore`

```dart
final unreadCounts = data['unread_counts'] as Map<String, dynamic>? ?? {};
int total = 0;
for (final value in unreadCounts.values) {
  if (value is int) total += value;     // ← telt OOK het 'total'-veld op
}
```

Loopt over alle waarden, inclusief het al bestaande `total`-veld ⇒ effectief dubbel zo groot. Niet meer aangeroepen op de hot path, maar staat klaar als landmijn.

### C. FCM-token leakage tussen accounts en versies

* `AuthProvider.logout()` roept `_authService.logout()` aan, maar **niet** `removeTokenFromFirestore()`. Het oude FCM-token blijft op het member-document hangen.
* Bij een app-update verandert het FCM-token niet noodzakelijk, maar Apple/Google kunnen het wel rotaten. We hebben een `onTokenRefresh` listener, maar **geen explicit version-change check**: als de listener tijdens de update niet draait, missen we de rotatie.
* Probleem dat Jan beschreef: *"vroeger ook een probleem met de token als ik van versie veranderde"* ⇒ token raakt los van device.

**Best practice (Firebase docs):** sla `app_version` op naast het token; bij elke launch vergelijk de huidige versie met de opgeslagen versie en force een `getToken()` als ze verschillen.

### D. `LocalReadTracker` baseline reset, maar `unread_counts` niet

Bij een verse install zet de tracker `_installBaseline = NOW` zodat oude berichten niet meetellen. Maar het Firestore `unread_counts.total` van vóór de uninstall **leeft door** op het server-side member-document. De eerste push na herinstall stuurt dan dat oude badge-getal mee in `aps.badge` ⇒ klacht 4.

### E. Cloud Function `onEventStatusChange` gebruikt verouderde `read_by`

```js
const unreadCount = messages.filter(msg => {
  const readBy = msg.read_by || [];
  return !readBy.includes(participantId);
}).length;
```

`read_by` wordt sinds de migratie naar `LocalReadTracker` niet meer gevuld. ⇒ Decrement is altijd te hoog en kan de teller onder 0 trekken (al beschermd in `decrementUnreadCounts`, maar het werkt niet meer correct).

### F. Android badge ondersteuning is launcher-afhankelijk

`app_badge_plus` werkt op Samsung/Xiaomi/Huawei/Oppo/Vivo, maar **niet** op stock AOSP / Pixel. De plugin geeft `isSupported() == false`, dus het rode bolletje verschijnt simpelweg niet. Er is geen officiële Android API hiervoor (Android 8+ heeft enkel notification dots, een grafisch puntje gekoppeld aan een actieve notificatie). ⇒ klacht 1 op Pixel-toestellen is grotendeels een Android-limitatie.

### G. Stale FCM tokens worden gelogd maar niet opgeruimd

`badge-helper.js` logt warnings voor tokens > 30 dagen oud, maar verwijdert ze niet. Pas wanneer FCM een `messaging/registration-token-not-registered` error teruggeeft worden ze via `arrayRemove` weggehaald. Sommige stale tokens blijven actief terwijl ze nooit een notificatie meer afleveren.

---

## 🎯 Doel-architectuur (TL;DR)

1. **Cloud Functions zijn de single source of truth voor `unread_counts.total`** (via `FieldValue.increment(1)`).
2. **Client schrijft per-field met dot-notation, nooit een hele map.** Client schrijft `total` niet meer.
3. **Token lifecycle is strict:** ophalen bij login, opslaan met `app_version`, verwijderen bij logout, force-refresh bij version mismatch.
4. **Reinstall is een echte reset:** baseline = NOW + `unread_counts` op Firestore wordt ook gereset + `flutter_local_notifications.cancelAll()` + `clearBadge()`.
5. **Manual escape hatch:** "Marquer tout comme lu" knop in Settings die alle drie de bronnen resync't.

---

## 🛠️ Concrete fixes (in volgorde van executie)

### Fix #2 — Stop met de map-overwrite, gebruik dot-notation

**Bestand:** `lib/providers/unread_count_provider.dart`

Vervang `_syncCountsToFirestore` met:

```dart
Future<void> _syncCountsToFirestore(
  int announcements, int eventMessages, int teamMessages, int sessionMessages,
) async {
  if (_clubId == null || _userId == null) return;
  try {
    final memberRef = FirebaseFirestore.instance
        .collection('clubs').doc(_clubId!)
        .collection('members').doc(_userId!);

    // Per-field met dot-notation: overschrijft NOOIT de hele map.
    // 'total' wordt NIET geschreven door de client — Cloud Functions
    // beheren het via FieldValue.increment.
    await memberRef.update({
      'unread_counts.announcements': announcements,
      'unread_counts.event_messages': eventMessages,
      'unread_counts.team_messages': teamMessages,
      'unread_counts.session_messages': sessionMessages,
      'unread_counts.last_synced': FieldValue.serverTimestamp(),
    });
  } catch (e) {
    debugPrint('⚠️ Badge sync failed: $e');
  }
}
```

**Belangrijk vervolg in `badge-helper.js`:**
`getBadgeCount` blijft `unread_counts.total` lezen (CF-source), maar als safety-net voegen we een fallback toe die de som van alle category-velden gebruikt wanneer `total` ontbreekt of negatief is.

### Fix #3 — Repareer `updateBadgeFromFirestore` dubbeltelling

**Bestand:** `lib/services/notification_service.dart`

```dart
Future<void> updateBadgeFromFirestore(String clubId, String userId) async {
  try {
    final doc = await _firestore
        .collection('clubs/$clubId/members').doc(userId).get();
    final data = doc.data();
    if (data == null) return;

    final unreadCounts = data['unread_counts'] as Map<String, dynamic>? ?? {};

    // Lees ENKEL het total veld dat de Cloud Function bijhoudt
    final total = (unreadCounts['total'] as num?)?.toInt() ?? 0;
    await setBadge(total.clamp(0, 9999));
  } catch (e) {
    debugPrint('⚠️ Badge Firestore update failed (non-fatal): $e');
  }
}
```

### Fix #4 — Logout cleanup van FCM token

**Bestand:** `lib/providers/auth_provider.dart`

Voeg in `logout()` toe **vóór** `_authService.logout()`:

```dart
// Verwijder FCM token van Firestore zodat dit toestel
// geen notificaties meer krijgt voor deze (oude) account.
final uid = _currentUser?.uid;
if (uid != null) {
  await _notificationService.removeTokenFromFirestore(
    FirebaseConfig.defaultClubId,
    uid,
  );
}
_notificationService.stopListeningForTokenRefresh();
```

Hetzelfde in `deleteAccount()` (vóór de Auth-delete).

### Fix #5 — Detecteer app-version change en force token refresh

**Bestand:** `lib/services/notification_service.dart`

In `saveTokenToFirestore` checken we al `app_version` van het member-doc. Voeg daar toe: als de opgeslagen versie verschilt van de huidige, doen we **eerst** een `await _messaging.deleteToken()` gevolgd door `getToken()` om de FCM-server te dwingen een verse token te genereren. Dan halen we het oude token via `arrayRemove` weg en pushen we het nieuwe via `arrayUnion`.

```dart
// Detecteer version change
final previousVersion = doc.data()?['app_version'] as String?;
final previousBuild = doc.data()?['app_build_number'] as String?;
final isVersionChange = previousVersion != null &&
    (previousVersion != appInfo['version'] ||
     previousBuild != appInfo['buildNumber']);

if (isVersionChange) {
  debugPrint('🔄 App version changed: $previousVersion → ${appInfo['version']}');
  // Force token rotation: Apple/Google kunnen het oude token invalidaten
  // bij grote updates. Beter zelf forceren.
  try {
    final oldToken = await _messaging.getToken();
    await _messaging.deleteToken();
    if (oldToken != null) {
      // Verwijder het oude token uit de array zodat het niet
      // meer gebruikt wordt door de Cloud Functions.
      await memberRef.update({
        'fcm_tokens': FieldValue.arrayRemove([oldToken]),
      });
    }
  } catch (e) {
    debugPrint('⚠️ Force token rotation failed (non-fatal): $e');
  }
}
```

Daarna gewoon `getToken()` opnieuw + `arrayUnion`.

### Fix #6 — Reset `unread_counts` + cancelAll bij verse install

**Bestand:** `lib/services/local_read_tracker.dart` + `lib/main.dart`

`LocalReadTracker.init()` retourneert nu een bool die zegt of het een verse install was. In `main.dart` na `LocalReadTracker().init()` kijken we naar `installBaseline`: als die `now` is, plannen we (na login) een eenmalige reset van het Firestore-document.

Concreet in `auth_provider.dart` na de eerste login na verse install:

```dart
if (LocalReadTracker().installBaseline != null) {
  // Verse installatie: reset Firestore badge counters en lokale notificaties
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

Voeg een ListTile toe met `Icons.mark_email_read`. Op tap:

1. Confirmatie dialog (FR).
2. `LocalReadTracker.resetAll()` — wist alle keys.
3. Markeer **alle** keys opnieuw met `markAsRead()` voor de huidige conversaties die de user mag zien (announcements + open operations + team channels + sessions). Simpeler: zet 1 wildcard "now" timestamp die als baseline gebruikt wordt door de service. We voegen daar een helper voor toe: `LocalReadTracker.markAllAsRead()`.
4. Reset Firestore counters via dot-notation set naar 0.
5. `notificationService.clearBadge()` + `FlutterLocalNotificationsPlugin().cancelAll()`.
6. `unreadProvider.refresh()`.

### Fix #8 — Cloud Function `onEventStatusChange` repareren

**Bestand:** `functions/src/notifications/onEventStatusChange.js`

`read_by` is dood. Twee opties:

* **Optie A (snel):** delete the function. De event_messages teller wordt sowieso al meegerekend door de client-side count() query op alleen open operations. Closed events worden niet meer gequeryd ⇒ count gaat vanzelf naar 0.
* **Optie B (correct):** trek bij sluiten van het event de hele category teller in voor alle inscriptions met `FieldValue.increment(-X)` waar X een geldig bovengrens-getal is. Maar dat raakt potentieel andere events. Te risicovol.

**Beslissing: Optie A.** We commenten de export uit in `functions/index.js` en laten het bestand staan voor historische context.

### Fix #9 — Tap-handler voor `medical_certificate`

**Bestand:** `lib/main.dart`

Voeg in de switch in `_handleNotificationTap` een case toe:

```dart
case 'medical_certificate':
  _navigatorKey.currentState!.push(
    MaterialPageRoute(
      builder: (_) => const MedicalCertificationScreen(),
    ),
  );
  break;
```

Plus de import bovenaan.

### Fix #10 — Stale-token cleanup bij elke send + sentry-warning

**Bestand:** `functions/src/utils/badge-helper.js`

* Verlaag `STALE_TOKEN_DAYS` van 30 → 60 (we willen niet over-prunen, sommige users gebruiken de app maandelijks).
* Bij `messaging/registration-token-not-registered` of `invalid-registration-token` — al goed, laat staan.
* Voeg toe: bij `failureCount > successCount` log een **error** in plaats van enkel info, zodat het opvalt in Sentry/Functions logs.

```js
if (totalFailure > totalSuccess && totalSuccess + totalFailure > 3) {
  console.error(`🚨 NOTIF DELIVERY DEGRADED: ${totalFailure} failures vs ${totalSuccess} successes — check token freshness`);
}
```

---

## ✅ Verification checklist

Na alle fixes:

1. `flutter analyze` — geen nieuwe errors.
2. `cd functions && npm run lint` (of `eslint src/`) — geen nieuwe errors.
3. Manual smoke test op een testtoestel:
   * Vers installeren → login → check dat badge = 0 op het app-icoon.
   * Stuur een testaankondiging vanuit CalyCompta → badge verschijnt (iOS), notificatie pop-up.
   * Open de aankondiging → badge gaat naar 0 binnen 1 seconde.
   * Logout → check Firestore: `fcm_tokens` array bevat dit token niet meer.
   * Login terug → badge blijft 0 (geen rebound).
   * Bump version naar 1.4.3+125 → herinstall → check dat oude tokens uit array verdwijnen, nieuwe wordt toegevoegd.
   * Push een aankondiging → komt door op het nieuwe token.
4. Cloud Functions logs checken op stale-token warnings na 1 dag draaien.

---

## 🚀 Roll-out

* Branch: `fix/notifications-and-badges`
* Eerst Cloud Functions deployen (Fix #8, #10) — backwards compatible met oudere clients.
* Daarna client patch (Fix #2, #3, #4, #5, #6, #7, #9).
* Bump naar `1.4.3+125`, build via `./scripts/build_release.sh --bump patch`.
* Eerst intern testen (Jan + 2 testers), daarna staged Play Store + TestFlight rollout.

---

## 📚 Bronnen / best practices

* [Best practices for FCM registration token management — Firebase docs](https://firebase.google.com/docs/cloud-messaging/manage-tokens)
* [Receive messages in Apple platform apps — Firebase docs](https://firebase.google.com/docs/cloud-messaging/ios/receive-messages)
* [Incrementing Values Atomically with Cloud Firestore — Firebase blog](https://firebase.blog/posts/2019/03/increment-server-side-cloud-firestore/)
* [app_badge_plus pub.dev](https://pub.dev/packages/app_badge_plus) — Android badge support is launcher-afhankelijk.
* [Lifecycle of FCM device tokens — Medium](https://medium.com/@chunilalkukreja/lifecycle-of-fcm-device-tokens-61681bb6fbcf)
