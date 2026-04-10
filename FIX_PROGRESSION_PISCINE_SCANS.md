# Fix: piscine scans niet zichtbaar in formation/progression

**Datum:** 2026-04-08
**Probleem:** Scans in het zwembad (CalyMob piscine-modus) verschenen niet in
`https://caly.club/formation/progression` onder "Présences cette saison".

## Root cause

De mobiele scanner schreef in piscine-modus naar een andere Firestore collection
dan die de progression-pagina las:

| Bron (CalyMob) | Pad |
| --- | --- |
| Event-modus scan | `clubs/{cid}/attendance` (via `AttendanceService.recordAttendance`) |
| **Piscine-modus scan** | **`clubs/{cid}/piscine_sessions/{sid}/attendees/`** (via `PiscineSessionService.addAttendee`) |

De web `attendanceService.getAttendanceForMember` las alleen uit
`clubs/{cid}/attendance`, dus piscine-scans bleven onzichtbaar in de progression
fiche. Geen Cloud Function mirrort de ene collection naar de andere.

## Oplossing (Optie A — web leest beide bronnen)

Gekozen boven mobile dual-write of een backend mirror omdat:
- gisteren's scans meteen zichtbaar worden, geen migratie nodig
- geen nieuwe mobile release nodig (App Store review vermeden)
- geen data-duplicatie of sync-complexiteit

### Code-wijzigingen (reeds toegepast in deze repo)

1. **`src/services/attendanceService.ts`**
   - Nieuwe helper `piscineAttendeeToAttendance()` zet een
     `piscine_sessions/*/attendees` doc om naar een `AttendanceRecord`
     (mapt `memberId`→`membre_id`, `memberName`→prenom+nom split,
     `scannedAt`→`checked_in_at`, en zet `operation_titre = 'Piscine'`
     zodat de UI het "Piscine" badge toont).
   - `getAttendanceForMember()` doet nu twee queries parallel:
     - bestaande `collection('clubs/{cid}/attendance') where membre_id == X`
     - nieuwe `collectionGroup('attendees') where memberId == X`, gefilterd
       op clubId via het doc-pad.
   - Records worden gemergd + gededupliceerd op `(membre_id, day, origin)`
     waarbij `origin = operation_id || piscine_session_id || doc.id`.
   - Veld `piscine_session_id?: string` toegevoegd aan `AttendanceRecord`.
   - De collectionGroup query is *non-fatal*: als de rules/index nog niet
     zijn gedeployed valt het terug op alleen event-scans met een warning
     in de console (dus de fiche breekt nooit).

2. **`src/components/piscine/formation/MemberProgressionFiche.tsx`**
   - `enrichAttendancesWithThemes` bouwt nu ook een `sessionById` map en
     probeert thema-lookup in deze volgorde: `piscine_session_id` →
     `operation_id` → datum-fallback. Piscine scans krijgen dus een
     directe, exacte thema-match via het sessie-ID uit het attendee-pad.

## Wat JIJ nog moet doen in de CalyCompta repo

### 1. Firestore rules bijwerken — **verplicht**

De `collectionGroup('attendees')` query heeft een rule nodig die van
toepassing is op `{path=**}/attendees/{aid}`. Open
`CalyCompta/firestore.rules` en zoek naar de bestaande piscine_sessions rule.
Voeg binnen het `match /databases/{database}/documents { ... }` blok een
collection-group rule toe (op hoog niveau, dus niet genest):

```
// Collection-group read for piscine attendees (used by formation/progression)
// to query across all piscine_sessions/*/attendees subcollections.
// Beveiligd: alleen leden van het club dat in het pad staat mogen lezen.
match /{path=**}/attendees/{attendeeId} {
  allow read: if request.auth != null
    && exists(/databases/$(database)/documents/clubs/$(path[1])/members/$(request.auth.uid));
}
```

> Let op: `path[1]` is de clubId (uit `clubs/{clubId}/piscine_sessions/...`).
> Dit staat los van de bestaande geneste rules onder
> `match /clubs/{clubId}/piscine_sessions/{sessionId} { ... }` — die blijven
> werken voor directe reads binnen een sessie.

Deploy:
```
cd ../CalyCompta
firebase deploy --only firestore:rules
```

### 2. Firestore single-field collection-group index — **verplicht**

De query `collectionGroup('attendees').where('memberId', '==', X)` heeft een
single-field collection-group index exemption nodig. Twee opties:

**Optie 2a (aanbevolen — snelste):** laat Firestore de link genereren.
Open `https://caly.club/formation/progression` en klik op een lid. De query
zal één keer falen met een console error die een klikbare URL bevat zoals
`https://console.firebase.google.com/.../indexes?create_exemption=...`.
Klik die link → "Save" → wacht ±30 seconden → herlaad de pagina.

**Optie 2b (via code):** voeg in `CalyCompta/firestore.indexes.json` aan
`fieldOverrides` toe:
```json
{
  "collectionGroup": "attendees",
  "fieldPath": "memberId",
  "indexes": [
    {
      "queryScope": "COLLECTION_GROUP",
      "order": "ASCENDING"
    }
  ]
}
```
Dan: `firebase deploy --only firestore:indexes`.

### 3. Verificatie

1. Open `https://caly.club/formation/progression`
2. Klik een lid open dat gisteren (2026-04-07) in het zwembad heeft gescand
3. Scroll naar "Présences cette saison"
4. Je zou nu de piscine-scan moeten zien met het "Piscine" badge en (indien
   thema was ingesteld voor dat niveau op die sessie) de `🎯 Thema-naam`.

Als de scans nog niet verschijnen:
- Open DevTools → Console, zoek naar `[AttendanceService]`
- Als je ziet: *"collectionGroup(attendees) query failed"* → rules of index
  zijn nog niet correct gedeployed.
- Als geen warning maar nog altijd leeg → check dat de scans écht van gisteren
  zijn en dat het seizoen goed wordt berekend (`getSeasonStart()`).

## Rollback

Als het iets breekt: revert de twee bestanden in `CalyMob/src/`. De
collectionGroup query is al non-fatal, dus zelfs zonder rules/index doet
de pagina exact wat ze vóór de fix deed (alleen event scans tonen).
