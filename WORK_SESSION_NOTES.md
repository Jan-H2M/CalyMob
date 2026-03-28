# CalyMob Push Notifications - Work Session Notes
**Datum:** 28 maart 2026
**Status:** Code changes klaar, deployment nog nodig

---

## WAT IS GEDAAN (afgewerkt)

### 1. Badge count sync (server ↔ client)
- **Probleem:** App icon badge toonde 55 terwijl echte unread count veel lager was
- **Oorzaak:** Server-side `unread_counts.total` op member doc werd nooit verlaagd wanneer user berichten las in de app
- **Fix:** `UnreadCountProvider` schrijft nu lokale counts terug naar Firestore member doc via `_syncCountsToFirestore()`
- **Bestand:** `lib/providers/unread_count_provider.dart`

### 2. "Nouveaux messages" divider in EVENT discussions ✅
- **Fix:** Fallback toegevoegd voor `_lastReadBeforeOpen` wanneer `getLastRead()` null retourneert (eerste keer openen)
- **Bestanden:**
  - `lib/screens/operations/operation_detail_screen.dart` (lijn ~1499)
  - `lib/widgets/event_discussion_tab.dart` (lijn ~75)
- **Pattern:** `tracker.getLastRead(key) ?? tracker.installBaseline ?? DateTime(2024)`

### 3. "Nouveaux messages" divider in ANNOUNCEMENT replies ✅ (NIEUW)
- **Probleem:** Divider werkte in events maar NIET in communicatie/announcements
- **Oorzaak:** `announcement_detail_screen.dart` had helemaal geen divider implementatie
- **Fix:** Zelfde pattern als events toegevoegd:
  - `_lastReadBeforeOpen` state variable
  - Timestamp opslaan VOOR `_markAsRead()` wordt aangeroepen
  - Divider tonen tussen oude en nieuwe replies in ListView
  - `_buildNewMessagesDivider()` widget
- **Bestand:** `lib/screens/announcements/announcement_detail_screen.dart`

### 4. Rode dot (badge) op landing screen voor Communication ✅ (NIEUW)
- **Probleem:** Rode dot werkte voor Events maar NIET voor Communication
- **Oorzaak:** `countUnreadAnnouncements()` in `UnreadCountService` checkte alleen `announcements.created_at > lastRead` — dit telt alleen NIEUWE aankondigingen, niet nieuwe REPLIES op bestaande aankondigingen
- **Fix (2 delen):**
  1. **Cloud Function** (`functions/src/notifications/onNewAnnouncementReply.js`): Update nu `last_reply_at` op het announcement document wanneer een reply wordt gepost
  2. **Count Service** (`lib/services/unread_count_service.dart`): `countUnreadAnnouncements()` doet nu TWEE queries (created_at + last_reply_at) en dedupliceert op doc ID

---

## WAT NOG MOET GEBEUREN

### KRITISCH — Deployment nodig:

1. **Firebase login vernieuwen:**
   ```bash
   firebase login --reauth
   ```
   Credentials waren verlopen op 28/3/2026.

2. **Cloud Functions deployen:**
   ```bash
   cd /Users/jan/Documents/GitHub/Calypso/CalyMob
   firebase deploy --only functions:onNewAnnouncementReply
   ```
   Dit deployt de `last_reply_at` update. ZONDER dit werkt de rode dot fix niet!

3. **Release build installeren op iPhone:**
   ```bash
   cd /Users/jan/Documents/GitHub/Calypso/CalyMob
   flutter run --release
   ```
   iOS build is al succesvol gemaakt (`build/ios/iphoneos/Runner.app` = 99.9MB).
   Je moet alleen nog `flutter run --release` doen met je iPhone aangesloten.

### TESTEN — na deployment:

4. **Test rode dot voor Communication:**
   - Stuur een test reply naar een bestaande aankondiging (bv. "Rappel cotisations")
   - Verwacht: rode dot verschijnt op Communication knop op landing screen
   - Test script: `functions/test-announcement-replies.js` (gebruikt `service-account-key.json`)

5. **Test "Nouveaux messages" divider in Communication:**
   - Open "Rappel cotisations" → verwacht rode divider "Nouveaux messages" tussen oude en nieuwe replies
   - Vergelijk met Events (Vodelée) waar het al werkte

### LATER / NICE TO HAVE:

6. **Test data opruimen in Firestore:**
   - Er zijn test replies van test_marie, test_luc, test_sophie in "Rappel cotisations"
   - En test messages in Vodelée event

7. **Certificat médical PDF-only beperking:**
   - Upload accepteert alleen PDF, geen andere bestanden
   - Gemeld door Jan, nog niet gefixed

8. **Verbose debug logging verwijderen:**
   - Sommige extra `debugPrint` statements staan nog in de code

---

## GEWIJZIGDE BESTANDEN (samenvatting)

| Bestand | Wijziging |
|---------|-----------|
| `lib/providers/unread_count_provider.dart` | Badge sync naar Firestore |
| `lib/services/unread_count_service.dart` | Twee queries voor announcement unread count |
| `lib/screens/announcements/announcement_detail_screen.dart` | "Nouveaux messages" divider |
| `lib/screens/operations/operation_detail_screen.dart` | Divider fallback fix |
| `lib/widgets/event_discussion_tab.dart` | Divider fallback fix |
| `functions/src/notifications/onNewAnnouncementReply.js` | last_reply_at update op announcement doc |
