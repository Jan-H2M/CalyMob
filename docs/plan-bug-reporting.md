# Plan: In-App Bug Reporting — CalyMob & CalyCompta

## Probleem

CalyMob en CalyCompta hebben geen manier voor gebruikers om bugs te melden vanuit de app. Bugs worden nu ad hoc gemeld (mondeling, email, support formulier) zonder structuur, zonder context (device info, screenshots), en zonder opvolging. Er is geen centraal overzicht van openstaande bugs.

Jan gebruikt Linear voor VetGenius, maar Calypso-projecten (CDC ASBL) moeten **volledig gescheiden** blijven — H2M/VetGenius mag dit niet zien.

## Doel

Een systeem waarbij:
1. Elke gebruiker van CalyMob of CalyCompta een bug kan melden vanuit de app
2. Automatisch context wordt meegestuurd (device, OS, app versie, screenshot, sessie-replay)
3. Bug reports centraal binnenkomen in een apart Linear workspace
4. Jan het overzicht behoudt via Linear Kanban of via Claude/Cowork

---

## Architectuur

```
┌─────────────────────────────────────────────────────┐
│                    GEBRUIKER                         │
│                                                     │
│  CalyMob (Flutter)         CalyCompta (React/Web)   │
│  ┌──────────────────┐     ┌──────────────────┐     │
│  │ Settings →        │     │ Settings →        │     │
│  │ "Bug melden" knop │     │ "Bug melden" knop │     │
│  │      ↓            │     │      ↓            │     │
│  │ Icoontje verschijnt│    │ Icoontje verschijnt│    │
│  │ (tijdelijk overlay)│    │ (tijdelijk overlay)│    │
│  │      ↓            │     │      ↓            │     │
│  │ Gebruiker navigeert│    │ Gebruiker navigeert│    │
│  │ naar bug-scherm   │     │ naar bug-pagina   │     │
│  │      ↓            │     │      ↓            │     │
│  │ Tik op icoontje:  │     │ Klik op icoontje: │     │
│  │ 1. Auto-screenshot│     │ 1. Auto-screenshot│     │
│  │ 2. Formulier      │     │ 2. Formulier      │     │
│  │ 3. Verstuur → weg │     │ 3. Verstuur → weg │     │
│  └────────┬─────────┘     └────────┬─────────┘     │
│           │                         │                │
└───────────┼─────────────────────────┼────────────────┘
            │                         │
            ▼                         ▼
┌─────────────────────────────────────────────────────┐
│              FIRESTORE (bestaand project)             │
│                                                     │
│  Collection: bug_reports                             │
│  ┌─────────────────────────────────────────────┐   │
│  │ {                                             │   │
│  │   id: auto                                    │   │
│  │   app: "CalyMob" | "CalyCompta"               │   │
│  │   title: "App crasht bij camera"              │   │
│  │   description: "Als ik op scan druk..."       │   │
│  │   priority: "blocking" | "annoying" | "minor" │   │
│  │   status: "open" | "in_progress" | "done"     │   │
│  │   reporter: { uid, name, email }              │   │
│  │   device: { model, os, appVersion, browser }  │   │
│  │   screenshotUrl: "gs://..."  (Firebase Storage)│  │
│  │   sentryReplayId: "replay_abc123"             │   │
│  │   sentryEventUrl: "https://sentry.io/..."     │   │
│  │   linearIssueId: "CAL-23" (na sync)           │   │
│  │   createdAt: timestamp                        │   │
│  │ }                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Cloud Function: onBugReportCreated (trigger)       │
│  → Maakt Linear issue aan in apart workspace        │
│  → Stuurt push notificatie naar Jan                  │
└─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────┐
│          LINEAR (nieuw apart workspace)               │
│          "Calypso" — gescheiden van VetGenius         │
│                                                     │
│  Team: Calypso                                       │
│  Projecten: CalyMob, CalyCompta                      │
│  Labels: bug, feature, improvement                   │
│  Workflow: Backlog → To Do → In Progress → Done      │
│                                                     │
│  Kanban board met alle bug reports                    │
│  + Sentry replay link bij elke issue                 │
└─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────┐
│          SENTRY (bestaand)                            │
│                                                     │
│  Session Replay = de "video"                         │
│  CalyCompta: AL ACTIEF (10% sessies, 100% errors)   │
│  CalyMob: AAN TE ZETTEN (2 regels config)           │
│                                                     │
│  Bij bug report → replay ID meegestuurd              │
│  → Jan kan exact terugkijken wat gebruiker deed      │
└─────────────────────────────────────────────────────┘
```

---

## Fases

### Fase 1 — Fundament (dag 1-2)

**1.1 Nieuw Linear workspace aanmaken**
- Workspace "Calypso" — volledig gescheiden van VetGenius
- Team: Calypso
- Projecten: CalyMob, CalyCompta
- Labels: `bug`, `feature`, `improvement`
- Statussen: Backlog, To Do, In Progress, Done
- Alleen Jan heeft toegang

**1.2 Sentry Session Replay activeren in CalyMob**
- Twee regels toevoegen aan `SentryFlutter.init()` in `lib/main.dart`:
```dart
options.experimental.replay.sessionSampleRate = 0.1;
options.experimental.replay.onErrorSampleRate = 1.0;
```
- CalyCompta: al actief, niks te doen

**1.3 Firestore data model**
- Collection `bug_reports` aanmaken (geen schema nodig, Firestore is schemaless)
- Security rules: authenticated users mogen schrijven, alleen admin mag lezen/updaten
- Firebase Storage pad: `bug_reports/{reportId}/screenshot.png`

---

### Fase 2 — In-App UI (dag 3-5)

**UX Flow (zelfde voor beide apps):**

```
Settings scherm
    │
    ├── "Bug melden" knop
    │       │
    │       ▼
    │   ÉCRAN D'INSTRUCTIONS (overlay/dialog):
    │   ┌─────────────────────────────────┐
    │   │  🐛 Signaler un bug             │
    │   │                                 │
    │   │  1. Une petite icône va         │
    │   │     apparaître sur votre écran  │
    │   │                                 │
    │   │  2. Allez à l'écran où vous     │
    │   │     avez constaté le problème   │
    │   │                                 │
    │   │  3. Appuyez sur l'icône pour    │
    │   │     prendre une capture et      │
    │   │     décrire le problème         │
    │   │                                 │
    │   │       [ Commencer ]             │
    │   └─────────────────────────────────┘
    │       │
    │       ▼
    │   Bug Report Modus ACTIEF
    │   → Klein 🐛 icoontje verschijnt als overlay
    │   → Gebruiker navigeert terug naar het scherm met de bug
    │       │
    │       ▼
    │   Gebruiker tikt op 🐛 icoontje
    │   → Screenshot wordt AUTOMATISCH genomen (vóór modal)
    │   → Bottom sheet/modal opent met formulier
    │   → Screenshot preview zichtbaar in formulier
    │       │
    │       ▼
    │   Gebruiker vult in en verstuurt
    │   → "Bedankt!" bevestiging
    │   → Icoontje VERDWIJNT (modus uit)
    │
    ├── ANNULEREN: na 60 sec inactiviteit of terug naar Settings
    │   → Icoontje verdwijnt automatisch
```

**2.1 CalyMob (Flutter) — Bug Report Modus**

Technisch:
- In Settings scherm: knop "Signaler un bug" → activeert bug report modus
- Bug report modus = globale state (via Provider of eenvoudige ValueNotifier)
- Wanneer actief: `Overlay.of(context).insert()` → toont klein 🐛 icoontje
  - Draggable (gebruiker kan het verschuiven als het in de weg zit)
  - Semi-transparant, klein (36x36px)
  - Auto-timeout na 60 seconden → verdwijnt + modus uit
- `RepaintBoundary` wrapper rond de hele app (in `MyApp`)
- Bij tik op icoontje:
  1. `RepaintBoundary.toImage()` → screenshot van huidig scherm (vóór modal)
  2. Open bottom sheet met formulier
  3. Screenshot preview bovenaan het formulier
- Formulier velden (TOUT EN FRANÇAIS):
  - "Quel est le problème ?" (titre) — obligatoire
  - "Plus de détails" (description) — optionnel
  - Gravité: 🔴 Bloquant / 🟡 Gênant / 🔵 Mineur (3 boutons)
  - Aperçu de la capture d'écran (déjà prise, l'utilisateur peut la supprimer)
- Auto-collecté (affiché comme petit label gris):
  - Modèle d'appareil + version OS (via `device_info_plus` package)
  - Version de l'app (via `package_info_plus`)
  - User ID + nom (depuis AuthProvider)
  - Sentry replay ID (via `Sentry.lastEventId` ou `SentryId`)
  - Route/écran actuel
- Après envoi:
  1. Upload capture d'écran vers Firebase Storage
  2. Écriture dans Firestore `bug_reports` collection
  3. Confirmation: "Merci ! Nous allons examiner votre signalement."
  4. Icône disparaît → mode désactivé

**2.2 CalyCompta (React/Web) — Bug Report Modus**

Technisch:
- In Settings pagina: knop "Signaler un bug" → activeert bug report modus
- Bug report modus = React context/state (globaal in App.tsx)
- Wanneer actief: klein 🐛 icoontje als fixed-position overlay
  - Draggable (via CSS `position: fixed` + drag handler)
  - Semi-transparant, klein
  - Auto-timeout na 60 seconden
- Bij klik op icoontje:
  1. `html2canvas` → screenshot van huidig scherm (vóór modal)
  2. Open modal met formulier
  3. Screenshot preview bovenaan
- Mêmes champs de formulaire que CalyMob (tout en français)
- Auto-collecté:
  - Navigateur + OS (via `navigator.userAgent`)
  - Version de l'app (depuis variable d'environnement)
  - User ID + nom (depuis Firebase Auth context)
  - Sentry replay ID (via `Sentry.getReplay()?.getReplayId()`)
  - URL/route actuelle
- Après envoi: upload + Firestore write → icône disparaît

---

### Fase 3 — Automatisering (dag 5-6)

**3.1 Cloud Function: Firestore → Linear**
- Trigger: `onCreate` op `bug_reports` collection
- Functie:
  1. Lees nieuwe bug report document
  2. Maak Linear issue aan via API:
     - Titel: `[CalyMob] App crasht bij camera`
     - Beschrijving: gebruiker beschrijving + device info + Sentry replay link
     - Project: CalyMob of CalyCompta (op basis van `app` veld)
     - Priority: mapping (blocking→urgent, annoying→high, minor→low)
     - Label: `bug`
  3. Update Firestore document met `linearIssueId`
- Linear API key opslaan als Firebase secret (niet in code)

**3.2 Cloud Function: Automatische crash-prompt**
- Bij een crash die Sentry vangt:
  - Na app-restart tonen: "Er ging iets mis vorige keer. Wil je dit melden?"
  - Pre-fill formulier met crash info uit Sentry
  - Implementatie: flag opslaan in SharedPreferences (Flutter) / localStorage (web)

**3.3 Push notificatie naar Jan**
- Bij nieuwe bug report: FCM notificatie naar Jan's device
- Optioneel: ook een Sentry alert rule die triggert op nieuwe feedback

---

### Fase 4 — Beheer via Claude/Cowork (doorlopend)

**4.1 Workflow via Claude**
- Jan zegt: "wat staat er open voor CalyMob?" → Claude checkt Linear
- Jan zegt: "die camera bug is opgelost" → Claude update Linear status
- Jan zegt: "toon me de replay van BUG-003" → Claude geeft Sentry replay link
- Jan zegt: "maak een overzicht van bugs deze week" → Claude genereert samenvatting

**4.2 Wekelijks overzicht**
- Optioneel: scheduled task via Cowork die elke maandag een bug-overzicht stuurt

---

## Wat er NIET in scope is (v1)

- Gebruiker kan eigen bug report status bekijken (geen "mijn meldingen" scherm)
- Admin dashboard in CalyCompta zelf (Linear is het dashboard)
- Automatische duplicate detection
- Bug report zonder ingelogd te zijn (alleen authenticated users)
- In-app chat/reactie op bug reports

---

## Benodigde wijzigingen per project

### CalyMob (Flutter)
| Bestand | Wijziging |
|---------|-----------|
| `pubspec.yaml` | Toevoegen: `device_info_plus`, `package_info_plus` (als nog niet aanwezig) |
| `lib/main.dart` | Sentry replay config (2 regels) + `RepaintBoundary` wrapper |
| `lib/widgets/bug_report_widget.dart` | **NIEUW** — floating icoontje + bottom sheet formulier |
| `lib/services/bug_report_service.dart` | **NIEUW** — Firestore write + Storage upload |
| `firestore.rules` | Toevoegen: `bug_reports` collection regels |

### CalyCompta (React)
| Bestand | Wijziging |
|---------|-----------|
| `package.json` | Toevoegen: `html2canvas` |
| `src/App.tsx` | BugReportWidget component toevoegen |
| `src/components/BugReportWidget.tsx` | **NIEUW** — floating widget + modal formulier |
| `src/services/bugReportService.ts` | **NIEUW** — Firestore write + Storage upload |
| `firestore.rules` | Toevoegen: `bug_reports` collection regels |

### Firebase Cloud Functions
| Bestand | Wijziging |
|---------|-----------|
| `functions/src/bugReportToLinear.ts` | **NIEUW** — onCreate trigger → Linear API |
| `functions/src/index.ts` | Export nieuwe function |
| `functions/package.json` | Toevoegen: Linear SDK of `node-fetch` |

### Linear (nieuw workspace)
| Item | Details |
|------|---------|
| Workspace | "Calypso" — gratis plan is voldoende voor solo |
| Team | Calypso |
| Projecten | CalyMob, CalyCompta |
| Labels | bug, feature, improvement |

---

## Open vragen

1. **Linear workspace**: heb je al een apart Linear account/email voor Calypso, of gebruiken we hetzelfde account met een nieuw workspace?
2. **Firebase project**: delen CalyMob en CalyCompta hetzelfde Firebase project, of zijn het aparte projecten?
3. **Screenshot privacy**: moeten we gevoelige data (namen, bedragen) automatisch blurren in screenshots, of is dat niet nodig voor een club-app?
4. ~~**Taal**~~: ✅ BEANTWOORD — Alles in het Frans. UI, instructies, formulier, bevestigingen.
5. **Timeout**: is 60 seconden goed voor auto-annulering van de bug report modus, of langer?

---

## Tijdsinschatting

| Fase | Werk | Geschatte tijd |
|------|------|---------------|
| 1 — Fundament | Linear workspace + Sentry config + Firestore model | 1-2 uur |
| 2 — In-App UI | Flutter widget + React widget | 4-6 uur |
| 3 — Automatisering | Cloud Function + crash prompt + notificatie | 2-3 uur |
| 4 — Beheer | Claude workflow setup | 30 min |
| **Totaal** | | **~8-12 uur** |
