# Notification Fix Log - CalyMob Push Notifications

> Tracking document voor het oplossen van push notification problemen in CalyMob/CalyCompta.
> Gestart: 14 februari 2026

---

## Probleem (gerapporteerd 14/02/2026)

**Symptoom**: Wanneer een announcement (bericht) wordt aangemaakt in CalyCompta (web admin), komt het bericht aan in CalyMob (Flutter app), maar:
1. Geen push notificatie op de telefoon
2. Badge teller gaat niet omhoog

---

## Onderzoek

### Stap 1: Code-analyse

**CalyCompta (React web admin)**:
- `src/services/annonceService.ts` — Maakt announcements aan in `clubs/{clubId}/announcements`
- `src/pages/PushNotificationsPage.tsx` — UI voor "Annonces du club"
- Bij `createAnnonce()` wordt een Firestore document aangemaakt, wat de Cloud Function triggert

**CalyMob Cloud Functions**:
- `functions/src/notifications/onNewAnnouncement.js` — Triggert op `clubs/{clubId}/announcements/{announcementId}`
- `functions/src/utils/badge-helper.js` — Gedeelde logica voor tokens, badges en notificatie-verzending
- `functions/index.js` — Exporteert alle Cloud Functions

**CalyMob Flutter**:
- `lib/services/notification_service.dart` — FCM token management, foreground notifications, badge updates

### Stap 2: Firebase Console verificatie

- **Cloud Function `onNewAnnouncement`**: IS deployed, had 1 request in laatste 24u
- **Firestore `unread_counts`**: WORDT correct geïncrementeerd (announcements: 4, total: 5)
- **Conclusie**: Function triggert wél, badge increment werkt, maar FCM send faalt

### Stap 3: Cloud Function Logs (Google Cloud Logs Explorer)

**Cruciale logregels gevonden**:
```
Error sending to member rgKBwst...: Element at index 0 is not a valid array element. Nested arrays are not supported.
Notifications sent: 15 success, 43 failures
```

**74% van alle notificaties faalde!**

---

## Root Cause Analyse

### Bug 1: `arrayRemove([failedToken])` — Extra array brackets (KRITIEK)

**Bestand**: `functions/src/utils/badge-helper.js`, regel ~197

```javascript
// BUG - extra brackets wrappen de token in een array:
fcm_tokens: admin.firestore.FieldValue.arrayRemove([failedToken])

// Gevolg:
// 1. Firestore gooit "Nested arrays are not supported" error
// 2. Deze error wordt gevangen door de outer try/catch
// 3. ALLE tokens van die member worden als failure geteld
// 4. Ongeldige tokens worden NOOIT verwijderd → probleem stapelt zich op
```

**Impact**: Eén verlopen token per member veroorzaakt dat ALLE notificaties voor die member falen. De cascading failure verklaart waarom 43 van 58 notificaties faalden.

### Bug 2: Geen bescherming tegen nested arrays in `fcm_tokens`

**Bestand**: `functions/src/utils/badge-helper.js`, regel ~107

```javascript
// KWETSBAAR - als fcm_tokens [[token]] bevat i.p.v. [token]:
memberData.fcm_tokens.forEach(token => {
```

Als door welke reden dan ook een nested array in `fcm_tokens` terechtkomt, crasht de hele token-verzameling.

---

## Toegepaste Fixes

### Fix 1: Token flattening in `collectTokensAndMembers()`

```javascript
// OUD:
memberData.fcm_tokens.forEach(token => {

// NIEUW:
const flatTokens = memberData.fcm_tokens
  .flat(Infinity)
  .filter(t => typeof t === 'string' && t.length > 0);
flatTokens.forEach(token => {
```

### Fix 2: Correcte `arrayRemove` in `sendNotificationsWithBadge()`

```javascript
// OUD (bug):
fcm_tokens: admin.firestore.FieldValue.arrayRemove([failedToken])

// NIEUW:
fcm_tokens: admin.firestore.FieldValue.arrayRemove(failedToken)
```

### Deployment

- **Methode**: Google Cloud Shell (VirtioFS lock verhinderde lokale deployment)
- **Stappen**:
  1. Repo gekloond in Cloud Shell: `git clone https://github.com/Jan-H2M/CalyMob.git`
  2. `npm install` in `functions/`
  3. Fixes toegepast via `sed`
  4. Cloud Billing API ingeschakeld: `gcloud services enable cloudbilling.googleapis.com`
  5. `firebase deploy --only functions` — **alle functies succesvol gedeployed**
- **Datum/tijd**: 14/02/2026 ~10:51 CET

### Firestore Cleanup

- Script uitgevoerd via Cloud Shell om nested arrays in `fcm_tokens` te fixen
- **Resultaat**: 115 members, 10 met tokens (alle al correct), 105 zonder tokens
- Geen corrupte data gevonden in Firestore op dat moment

---

## Test Resultaten (14/02/2026)

### Voor de fix (10:16 CET)
```
Notifications sent: 15 success, 43 failures
Errors: "Element at index 0 is not a valid array element. Nested arrays are not supported."
```

### Na de fix (10:54 CET)
```
Announcement notifications sent: 8 success, 13 failures
"Removing invalid token from member..." (tokens worden correct opgeruimd)
Geen "Nested arrays" errors meer!
```

**Verbetering**:
- ❌ "Nested arrays" errors → ✅ Volledig opgelost
- ❌ Token cleanup werkte niet → ✅ Ongeldige tokens worden nu verwijderd
- De 13 failures zijn verlopen FCM tokens die nu correct worden opgeruimd
- Bij volgende berichten zullen deze failures niet meer optreden

---

## Bekende Openstaande Punten

### 1. Badge teller op iOS
- `unread_counts` wordt correct geïncrementeerd in Firestore
- APNs badge wordt meegestuurd in de push payload
- **Te verifiëren**: Wordt de badge correct weergegeven na ontvangst van de notificatie?

### 2. Verlopen FCM tokens
- 13 tokens waren verlopen → worden nu opgeruimd
- Members die de app lang niet geopend hebben verliezen hun token
- **Mogelijk**: Token refresh mechanisme in de Flutter app controleren

### 3. Fix naar GitHub pushen
- De fix is gedeployed via Cloud Shell maar moet nog naar GitHub gepusht worden
- Lokaal bestand: `CalyMob/functions/src/utils/badge-helper.js` (via rename geplaatst)
- Backup origineel: `CalyMob/functions/src/utils/badge-helper-OLD.js`

### 4. Andere notification functies controleren
- `onNewAnnouncementReply` — gebruikt dezelfde `badge-helper.js` → gefixt
- `onNewSessionMessage` — gebruikt dezelfde `badge-helper.js` → gefixt
- `onNewEventMessage` — te controleren of deze ook `badge-helper.js` gebruikt

---

## Betrokken Bestanden

| Bestand | Gewijzigd | Beschrijving |
|---------|-----------|--------------|
| `functions/src/utils/badge-helper.js` | ✅ Ja | Twee fixes: flatten tokens + arrayRemove |
| `functions/src/notifications/onNewAnnouncement.js` | Nee | Gebruikt badge-helper, profiteert van fix |
| `functions/src/notifications/onNewAnnouncementReply.js` | Nee | Idem |
| `functions/index.js` | Nee | Exports ongewijzigd |
| `lib/services/notification_service.dart` | Nee | Flutter-side, geen wijzigingen nodig |

---

## Technische Details

### Architectuur Push Notifications
```
CalyCompta (web) → createAnnonce() → Firestore write
                                         ↓
                              onNewAnnouncement (Cloud Function)
                                         ↓
                              badge-helper.js:
                              1. collectTokensAndMembers() ← FIX 1
                              2. incrementUnreadCounts()
                              3. sendNotificationsWithBadge() ← FIX 2
                                         ↓
                              FCM → APNs/Android → CalyMob
```

### Firebase Project
- **Project ID**: `calycompta`
- **Region**: `europe-west1`
- **Runtime**: Node.js 20 (2nd Gen Cloud Functions)
- **Firestore pad**: `clubs/calypso/announcements/{id}`
- **Members pad**: `clubs/calypso/members/{id}`

### Club ID
- Firestore: `calypso` (niet `calypso_dive_club` zoals in sommige config)
