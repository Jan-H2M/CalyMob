# CalyMob — Plan: Communication Hub Uitbreiding

**Datum:** 10 april 2026  
**Status:** Herwerkt voorstel, afgestemd op de huidige codebase  
**Basis:** review van Flutter app, Firestore rules, unread/badge flow en Cloud Functions

---

## 1. Doel

De knop "Communication" op het landing screen wordt de centrale ingang voor:

- club announcements
- permanente team channels

Deze uitbreiding bouwt voort op de bestaande `team_channels`-structuur in Firestore en op de bestaande unread/badge-infrastructuur.

Belangrijke productkeuzes:

- announcements blijven een aparte formele stroom
- event discussions blijven gekoppeld aan een operatie
- piscine session chats blijven gekoppeld aan een sessie
- team channels blijven ook zichtbaar in de Piscine hub als snelkoppeling

---

## 2. Huidige baseline in de repo

Dit is belangrijk omdat het oorspronkelijke voorstel op enkele punten niet overeenkwam met de huidige implementatie.

### 2.1 Navigatie en badges

- De knop "Communication" op het landing screen gaat vandaag rechtstreeks naar `AnnouncementsScreen`.
- De badge op die knop toont vandaag alleen `unreadProvider.announcements`.
- Team message unread counts bestaan al, maar zitten niet op die knop.

### 2.2 Team channels

- Er bestaan vandaag 3 team channel types:
  - `equipe_accueil`
  - `equipe_encadrants`
  - `equipe_gonflage`
- De huidige filtering gebeurt vooral client-side op basis van `clubStatuten`.
- De huidige Firestore rules laten nog te veel toe op server-side niveau; roltoegang is daar nog niet hard afgedwongen.

### 2.3 Chatmodellen

- Team channel messages gebruiken vandaag snake_case:
  - `sender_id`
  - `sender_name`
  - `message`
  - `attachments`
  - `created_at`
- Event messages ondersteunen vandaag al replies via:
  - `reply_to_id`
  - `reply_to_preview`
- Team channel messages ondersteunen vandaag nog geen replies.
- Piscine session chats hebben nog een eenvoudigere flow dan event discussions.

### 2.4 Notificaties en unread counts

- `onNewTeamMessage` ondersteunt vandaag in de praktijk alleen accueil versus encadrants.
- `UnreadCountService` berekent team unread counts vandaag als 1 totaal over alle zichtbare team channels.
- `notification_preferences.team_messages` bestaat al en geldt vandaag voor alle team channels samen.
- De Android notification channel `team_messages` bestaat al.

### 2.5 Teststatus

- De unread count tests zijn bruikbaar als basis.
- De testfile `test/services/team_channel_service_test.dart` is vandaag deels verouderd en verwacht nog `read_by`-gedrag dat niet meer overeenkomt met het huidige model.

---

## 3. Scope van dit document

Dit document beschrijft de aanbevolen implementatie voor:

1. een nieuwe Communication hub
2. uitbreiding van team channels van 3 naar 6
3. correcte server-side toegangscontrole
4. correcte badge- en notification-integratie
5. een gefaseerde aanpak voor extra chatfeatures

Niet in scope voor fase 1:

- per-channel notification preferences
- per-channel unread velden op `members/{memberId}.unread_counts`
- message editing
- reply support voor team channels
- samenvoegen van event, session en team chats tot 1 generiek chatsysteem

---

## 4. Gewenste team channels

### 4.1 Kanaallijst

| Kanaal | Document ID | `type` waarde | Zichtbaar voor | Doel |
|--------|-------------|---------------|----------------|------|
| General | `general` | `general` | alle leden | vrije clubchat |
| CA | `equipe_ca` | `ca` | CA | bestuurscommunicatie |
| Encadrants | `equipe_encadrants` | `encadrants` | encadrants | coordinatie leiders |
| Accueil | `equipe_accueil` | `accueil` | accueil | coordinatie onthaal |
| Gonflage | `equipe_gonflage` | `gonflage` | gonflage | coordinatie gonflage |
| Bureau | `bureau` | `bureau` | BS | financiele coordinatie |

### 4.2 Toegangsregel

- Een gebruiker ziet alleen de kanalen waarvoor hij roltoegang heeft.
- Admin en superadmin zien alle kanalen.
- "General" is zichtbaar voor alle clubleden.

### 4.3 Rolnormalisatie

De huidige codebase gebruikt vandaag een mix van rolcodes en tekstwaarden zoals:

- `CA`
- `Encadrant`
- `encadrant`
- `Accueil`
- `accueil`
- `Gonflage`
- `gonflage`

Voor deze feature moet 1 normalisatielaag gebruikt worden in:

- `MemberProvider`-afgeleide checks
- `TeamChannelService`
- `UnreadCountService`
- `onNewTeamMessage`
- Firestore rules

Aanbevolen genormaliseerde waarden:

- `member`
- `ca`
- `encadrant`
- `accueil`
- `gonflage`
- `bs`

Mapping van ruwe waarden naar genormaliseerde waarden:

| Ruwe waarde | Genormaliseerd |
|------------|----------------|
| `M`, `membre`, `member` | `member` |
| `CA`, `ca` | `ca` |
| `E`, `Encadrant`, `encadrant`, `encadrants` | `encadrant` |
| `A`, `Accueil`, `accueil` | `accueil` |
| `G`, `Gonflage`, `gonflage` | `gonflage` |
| `BS`, `bs`, `Banque Signature` | `bs` |

Opmerking:

- Als in de effectieve data `M`, `E`, `A` en `G` niet gebruikt worden, mag de implementatie beperkt blijven tot de waarden die echt in Firestore voorkomen.
- De normalisatie moet dit vooraf expliciet opvangen, in plaats van die aanname te verspreiden over meerdere bestanden.

---

## 5. UI en navigatie

### 5.1 Communication hub

Voeg een nieuw scherm toe: `CommunicationHubScreen`.

Structuur:

- bovenaan: 1 kaart of lijstitem voor announcements
- daaronder: lijst van zichtbare team channels
- per rij: naam, icoon, korte beschrijving, unread badge

Gedrag:

- tap op announcements opent bestaand `AnnouncementsScreen`
- tap op team channel opent bestaand `TeamChatScreen`

### 5.2 Landing screen

De knop "Communication" op het landing screen:

- navigeert naar `CommunicationHubScreen`
- toont badge = `announcements + teamMessages`

Dit is **wel** een codewijziging; de huidige code toont vandaag alleen announcements op die knop.

### 5.3 Piscine hub

De bestaande team channels mogen in de Piscine hub blijven staan als snelkoppeling.

Beslissing voor dit plan:

- Communication hub wordt de primaire ingang
- Piscine hub houdt de snelkoppelingen voorlopig ook

Zo vermijden we een grotere navigatiewijziging in dezelfde release.

---

## 6. Firestore model

### 6.1 Channel document

Gebruik voor `clubs/{clubId}/team_channels/{channelId}`:

```javascript
{
  name: "General",
  type: "general",
  description: "Vrije clubchat",
  created_at: Timestamp
}
```

### 6.2 Team message document

Gebruik **snake_case**, in lijn met de huidige code:

```javascript
{
  sender_id: "uid123",
  sender_name: "Jan",
  message: "Tekst van het bericht",
  created_at: Timestamp,
  attachments: [
    {
      type: "image",        // image | pdf | video
      url: "https://...",
      filename: "foto.jpg",
      size: 12345,
      storage_path: "clubs/calypso/team_channels/general/attachments/..."
    }
  ],
  reactions: {
    "👍": ["uid1", "uid3"],
    "❤️": ["uid2"]
  },
  poll: null
}
```

Belangrijk:

- `senderId`, `senderName`, `replyToId` en `replyToPreview` horen **niet** in dit team channel schema zolang de code snake_case verwacht.
- Team channels hebben vandaag nog geen replymodel; dat blijft buiten scope voor deze uitbreiding.

### 6.3 Poll object

Ook hier snake_case aanhouden:

```javascript
{
  poll: {
    question: "Waar gaan we duiken zaterdag?",
    options: [
      { id: "opt1", text: "Vodelée", votes: ["uid1", "uid3"] },
      { id: "opt2", text: "Barrage de l'Eau d'Heure", votes: ["uid2"] },
      { id: "opt3", text: "La Gombe", votes: [] }
    ],
    allow_multiple: false,
    closed_at: null
  }
}
```

### 6.4 Event en session chats

Als reactions, polls en video later ook naar event discussions en piscine session chats gaan:

- behoud hun bestaande basisstructuur
- voeg nieuwe velden ook daar in snake_case toe
- forceer geen replyvelden in team/session als ze daar functioneel niet nodig zijn

---

## 7. Backend en Flutter wijzigingen

### 7.1 Nieuwe bestanden

Verplicht voor fase 1:

- `lib/screens/communication/communication_hub_screen.dart`

Voor latere chatfeatures:

- `lib/widgets/message_reactions.dart`
- `lib/widgets/poll_widget.dart`
- `lib/models/poll.dart`

Optioneel voor video:

- `lib/widgets/video_attachment.dart`

### 7.2 Aan te passen bestanden

#### Fase 1

- `lib/models/team_channel.dart`
  - `TeamChannelType` uitbreiden met `general`, `ca`, `bureau`
  - `id`, `value`, `displayName`, `description`, `icon` uitbreiden
- `lib/services/team_channel_service.dart`
  - rolmapping uitbreiden
  - `sendMessage()` correct laten auto-creeren of, bij voorkeur, kanaalinitialisatie elders doen
- `lib/services/unread_count_service.dart`
  - team unread counts uitbreiden met `general`, `equipe_ca`, `bureau`
- `lib/screens/home/landing_screen.dart`
  - route wijzigen naar Communication hub
  - badge wijzigen naar `announcements + teamMessages`
- `lib/main.dart`
  - notification tap blijft naar `TeamChatScreen` gaan, maar parsing moet nieuwe channel types aankunnen
- `functions/src/notifications/onNewTeamMessage.js`
  - recipient mapping uitbreiden
- `firestore.rules`
  - server-side channel access invoeren
- `functions/index.js`
  - export uitbreiden als er een nieuwe maintenance function bijkomt

#### Fase 2 en later

- `lib/screens/teams/team_chat_screen.dart`
- `lib/widgets/attachment_picker.dart`
- `lib/widgets/attachment_display.dart`
- `lib/widgets/event_discussion_tab.dart`
- `lib/screens/piscine/session_chat_screen.dart` alleen als session parity mee in scope komt
- `lib/services/event_message_service.dart`
- `lib/services/session_message_service.dart`
- `lib/services/notification_service.dart`
- `pubspec.yaml`

### 7.3 Kanaalinitialisatie

Aanbeveling:

- maak de 6 channel docs eenmalig aan via admin script of gecontroleerde bootstrap
- laat gewone leden **niet** vrij channel docs aanmaken of muteren

Reden:

- vaste lijst in code
- minder race conditions
- veel eenvoudiger te beveiligen in Firestore rules

---

## 8. Firestore rules

### 8.1 Kernprincipe

De huidige repo vertrouwt voor team channels te veel op client filtering. Dat moet worden aangescherpt.

### 8.2 Gewenste regels

Voor `team_channels/{channelId}`:

- `read`: alleen leden met kanaaltoegang of admin
- `create/update/delete`: admin-only of deployment/bootstrap-only

Voor `team_channels/{channelId}/messages/{messageId}`:

- `read`: alleen leden met kanaaltoegang
- `create`: alleen leden met kanaaltoegang en `sender_id == request.auth.uid`
- `delete`: auteur of admin
- `update`:
  - auteur of admin voor toegelaten message-mutaties
  - aparte helpers voor reactions en poll-votes

### 8.3 Zelfde aandachtspunt voor andere chats

Als reactions of polls ook naar event messages en piscine session messages gaan, dan moeten hun rules ook mee evolueren.

Vandaag laten die rules in hoofdzaak alleen `read_by` updates toe.

### 8.4 Bestandsreferentie

De correcte file in deze repo is:

- `CalyMob/firestore.rules`

Niet:

- `CalyCompta/firestore.rules`

---

## 9. Push notificaties en badges

### 9.1 `onNewTeamMessage`

De bestaande Cloud Function moet worden uitgebreid naar een generieke kanaalmap.

Aanbevolen mapping:

```javascript
const CHANNEL_ROLE_MAP = {
  general: null,
  equipe_ca: ["ca"],
  equipe_encadrants: ["encadrant"],
  equipe_accueil: ["accueil"],
  equipe_gonflage: ["gonflage"],
  bureau: ["bs"],
};
```

Logica:

- `general`: notify alle relevante clubmembers met app-installatie en notification preference
- andere kanalen: notify alleen members met passende genormaliseerde rol
- sender wordt uitgesloten
- `notification_preferences.team_messages` blijft gelden voor alle team channels samen

### 9.2 Notification channel

Voor v1 blijft 1 Android notification channel voldoende:

- `team_messages`

Er zijn in deze fase geen aparte Android channels per team channel nodig.

### 9.3 Notification body

Ondersteun minimaal:

- gewone tekst
- attachment-only bericht
- poll-bericht
- video-bericht

Voorbeeld body fallback:

- tekst: eerste 100 chars
- attachment-only: `📎 Pièce jointe`
- video: `🎬 Vidéo`
- poll: `📊 Sondage: {question}`

### 9.4 Landing badge

Gebruik:

- `unreadProvider.announcements + unreadProvider.teamMessages`

### 9.5 Per-channel badges in de hub

Aanbevolen aanpak voor v1:

- behoud `team_messages` als totaal in `UnreadCountProvider`
- bereken per kanaal lokaal in het hubscherm via `count()` queries en `LocalReadTracker`

Dus:

- geen extra provider fields per kanaal
- geen extra `unread_counts.*` velden per kanaal op member docs

---

## 10. Extra chatfeatures

Deze functies zijn haalbaar, maar de scope moet gefaseerd worden omdat team chat, event discussion en session chat vandaag niet op dezelfde abstrahering zitten.

### 10.1 Aanbevolen fasering

#### Fase 2A — lichte UX-features

- tekst kopieren
- reactions

Start met:

- `TeamChatScreen`
- `EventDiscussionTab`

`SessionChatScreen` alleen meenemen als die parity expliciet mee in release scope moet.

### 10.2 Tekst kopieren

Laag risico.

Gebruik:

- long-press context menu
- `Clipboard.setData(...)`
- korte SnackBar

Opmerking:

- de tekstproperty heet in de huidige modellen meestal `message`, niet `text`

### 10.3 Emoji reactions

Data:

- `reactions: { emoji -> [uid, ...] }`

UI:

- chips onder bericht
- tap op chip toggelt eigen vote
- optionele `+` knop met emoji picker

Backend:

- service methods per chatsoort
- Firestore rules uitbreiden voor veilige reaction updates

Notificaties:

- geen extra push notifications voor reactions

### 10.4 Video delen

Huidige status:

- `attachment_picker.dart` ondersteunt vandaag alleen image en pdf
- `attachment_display.dart` ondersteunt vandaag alleen image en pdf

Aanpak:

- voeg `video` toe aan attachmenttypes
- voeg `storage_path` toe bij upload zodat cleanup later betrouwbaar is
- toon video thumbnail of video card met play affordance

Aanbeveling voor v1:

- eerst selectie, upload en playback
- grootte limiet client-side valideren
- compressie alleen toevoegen na korte spike, want native video-compress plugins verhogen risico op platformissues

### 10.5 Polls

Polls zijn functioneel nuttig, maar zwaarder dan copy/reactions.

Aanbevolen volgorde:

1. team channels
2. event discussions
3. session chats alleen indien echt nodig

Aandachtspunt:

- de security rules voor poll votes en poll closing moeten expliciet worden uitgewerkt
- notification body voor poll-berichten moet worden aangepast in de relevante Cloud Functions

### 10.6 Event en session notifications

Als video of polls ook naar event/session chats gaan, moeten ook deze functions inhoudelijk worden bijgewerkt:

- `functions/src/notifications/onNewEventMessage.js`
- `functions/src/notifications/onNewSessionMessage.js`

De recipientlogica verandert daar niet noodzakelijk, maar de notification body wel.

---

## 11. Automatische opruiming

### 11.1 Doel

Verwijder team messages, event messages en piscine session messages ouder dan 90 dagen.

Announcements blijven behouden.

### 11.2 Technische aanbeveling

Nieuwe attachments moeten `storage_path` opslaan naast `url`.

Waarom:

- download URLs zijn onhandig om later betrouwbaar naar een Storage path terug te vertalen
- cleanup wordt veel robuuster als het pad rechtstreeks in het document staat

### 11.3 Geplande scheduled function

Nieuwe scheduled function, bijvoorbeeld:

- `functions/src/maintenance/cleanupOldMessages.js`

Export via:

- `functions/index.js`

Trigger:

- dagelijkse `onSchedule(...)`

Gedrag:

- team channel messages ouder dan 90 dagen verwijderen
- event messages ouder dan 90 dagen verwijderen
- session messages ouder dan 90 dagen verwijderen
- announcements overslaan

Veiligheidsmaatregelen:

- batchlimiet per run
- logging per collectie/kanaal
- dry-run mode voor validatie
- alleen attachments verwijderen als `storage_path` beschikbaar is

### 11.4 Configuratie

Optioneel:

```javascript
{
  retention_days: 90,
  exclude_announcements: true,
  enabled: true
}
```

Pad:

- `clubs/{clubId}/settings/cleanup_config`

---

## 12. Aanbevolen implementatievolgorde

### Fase 1 — Hub en team channel uitbreiding

1. rolnormalisatie vastleggen
2. `TeamChannelType` uitbreiden naar 6 types
3. `CommunicationHubScreen` bouwen
4. landing screen route en badge aanpassen
5. `UnreadCountService` uitbreiden voor 6 team channels
6. `onNewTeamMessage` uitbreiden
7. Firestore rules server-side kanaaltoegang geven
8. 6 channel docs initialiseren
9. manueel testen van zichtbaarheid, posting, notifications en badges

### Fase 2 — lichte chatfeatures

10. copy-to-clipboard
11. reactions
12. event discussion parity

### Fase 3 — zwaardere chatfeatures

13. video attachments
14. polls
15. notification body fallbacks voor polls/video
16. session chat parity alleen indien nodig

### Fase 4 — maintenance

17. cleanup function
18. test- en releasepolish

---

## 13. Testplan

### 13.1 Automatische tests

Toevoegen of aanpassen:

- `test/services/team_channel_service_test.dart`
  - uitbreiden voor `general`, `ca`, `bureau`
  - verouderde `read_by`-verwachtingen verwijderen
- `test/services/unread_count_service_test.dart`
  - unread count over 6 channels
- tests voor rolnormalisatie
- tests voor `onNewTeamMessage`
  - juiste recipients per kanaal
  - `general` versus rolkanaal
- rules tests voor team channel toegang

### 13.2 Manuele tests

- user zonder speciale rol ziet alleen General
- user met `CA` ziet General + CA
- user met `encadrant` ziet General + Encadrants
- admin ziet alle 6 kanalen
- Communication knop toont juiste totaalbadge
- unread badge per kanaal reset correct na openen
- push op tap opent juiste team chat
- Piscine hub shortcuts blijven werken

### 13.3 Bekend aandachtspunt

De huidige session unread flow gebruikt nog geen aparte read key per niveau-chat.

Dat is geen blocker voor de Communication hub zelf, maar wel een aandachtspunt als session chat parity in scope komt.

---

## 14. Samenvatting van de aanbevolen richting

De richting van het oorspronkelijke voorstel blijft goed:

- maak Communication de centrale hub
- breid team channels uit naar 6
- behoud announcements en event discussions als aparte stromen

Maar voor een robuuste implementatie moeten deze correcties expliciet meegenomen worden:

1. gebruik snake_case in het berichtschema
2. voer roltoegang server-side af in Firestore rules
3. normaliseer `clubStatuten` op 1 plek
4. houd unread counts per kanaal lokaal in de hub, niet in member docs
5. faseer reactions, video en polls in plaats van alles tegelijk in 3 chatsoorten te forceren
6. sla `storage_path` op bij attachments zodat cleanup later betrouwbaar werkt

Dit maakt het plan uitvoerbaar binnen de huidige repo zonder onnodige regressies in unread counts, push notifications of Firestore security.
