# Carnet de Formation — Audit: Plan vs. Realiteit

**Datum:** 7 april 2026
**Bronnen:** 4 plandocumenten (Proposition, Plan, Tech Spec, Implementatieplan)
**Getoetst aan:** huidige code CalyMob (`main`) + CalyCompta (`main`)

---

## Samenvatting

Van de 5 geplande fasen zijn **Phase 1 t/m 4 grotendeels geïmplementeerd**. Phase 5 (go-live) is niet uitgevoerd. De feature branches zijn gemerged naar `main` in beide repos, maar de feature flag staat vermoedelijk nog op `false`. Er zijn enkele afwijkingen van het oorspronkelijke plan en een handvol ontbrekende onderdelen.

| Phase | Gepland | Status |
|-------|---------|--------|
| Phase 1 — Fundament | Feature flag, types, services, rules, indexes | ✅ Volledig |
| Phase 2 — Thema-catalogus | CRUD thema's, koppeling aan sessie | ✅ Volledig |
| Phase 3 — Observations | Observatie-UI, bottom sheet, bulk mode, Cloud Function | ✅ Volledig |
| Phase 4 — Dashboard & Parcours | Progressiedashboard, planning, parcours | ✅ Grotendeels |
| Phase 5 — Go-Live | Soft launch, feedback, flag aanzetten | ❌ Niet gestart |

---

## Phase 1 — Fundament: ✅ VOLLEDIG

### Feature Flag
| Item | Plan | Realiteit | Status |
|------|------|-----------|--------|
| Firestore document `settings/feature_flags` | `carnetFormationEnabled` + `carnetFormationAdminOnly` | Exact zo geïmplementeerd | ✅ |
| CalyMob `FeatureFlagService` | Stream-based, 3 methoden | `feature_flag_service.dart` — 47 regels, 3 methoden: `isCarnetFormationEnabled()`, `isCarnetFormationAdminOnly()`, `checkCarnetFormationEnabled()` | ✅ |
| CalyCompta `useFeatureFlags` hook | Conditionele rendering | `useFeatureFlags.ts` — 3 hooks: `useFeatureFlags()`, `useCarnetFormationEnabled()`, `useCarnetFormationGuard()` | ✅ |
| Conditionele menu/knoppen | Achter flag in beide apps | Home screen + session detail achter flag | ✅ |

### Types & Models
| Item | Plan | Realiteit | Status |
|------|------|-----------|--------|
| `SessionTheme` types (CalyCompta) | `sessionTheme.types.ts` | ✅ 75 regels, volledig met ThemeCategory enum | ✅ |
| `MemberObservation` types (CalyCompta) | `memberObservation.types.ts` | ✅ 66 regels, ObservationCategory + ObservationResult | ✅ |
| `SessionPlanning` types (CalyCompta) | `sessionPlanning.types.ts` | ✅ 25 regels | ✅ |
| `MemberObservation` model (CalyMob) | `member_observation.dart` | ✅ 90 regels, `fromFirestore()` + `toMap()` | ✅ |
| `SessionTheme` model (CalyMob) | `session_theme.dart` | ✅ 60 regels, read-only | ✅ |

### Services
| Item | Plan | Realiteit | Status |
|------|------|-----------|--------|
| `SessionThemeService` (CalyCompta) | CRUD + incrementUsage | ✅ 116 regels, alle methoden aanwezig | ✅ |
| `MemberObservationService` (CalyCompta) | Per member/session/niveau | ✅ 132 regels, alle queries + real-time subscriptions | ✅ |
| `SessionPlanningService` (CalyCompta) | CRUD per niveau/seizoen | ✅ 106 regels, upsert pattern | ✅ |
| `MemberObservationService` (CalyMob) | Stream + bulk | ✅ 74 regels, inclusief `addBulkObservations()` | ✅ |
| `SessionThemeService` (CalyMob) | Read-only | ✅ 43 regels | ✅ |

### Firestore Rules & Indexes
| Item | Plan | Realiteit | Status |
|------|------|-----------|--------|
| Rules voor `session_themes` | Read: leden, Write: admins | ✅ Aanwezig in `firestore.rules` (lijn 994) | ✅ |
| Rules voor `session_plannings` | Read: leden, Write: admins | ✅ Aanwezig (lijn 1003) | ✅ |
| Rules voor `member_observations` | Read: leden, Create: met observerId check, Update: auteur of admin, Delete: admin | ✅ Aanwezig (lijn 1010) | ✅ |
| 6 composite indexes | 4× member_observations, 1× session_themes, 1× session_plannings | ✅ Alle 6 aanwezig in `firestore.indexes.json` | ✅ |

---

## Phase 2 — Thema-catalogus: ✅ VOLLEDIG

| Item | Plan | Realiteit | Status |
|------|------|-----------|--------|
| `ThemeCatalogPage` | Overzichtspagina met filters | ✅ Aanwezig in CalyCompta | ✅ |
| `ThemeCard` | Kaart per thema | ✅ + extra `ThemeListRow` (niet in plan) | ✅+ |
| `ThemeDetailModal` | Detail met documenten | ✅ Aanwezig | ✅ |
| `ThemeForm` | Aanmaken/bewerken | ✅ Met validatie | ✅ |
| Document upload (Storage) | Firebase Storage integratie | ✅ Geïntegreerd in ThemeForm | ✅ |
| `ThemeSelector` dropdown | Dropdown in sessiekaart | ✅ Aanwezig | ✅ |
| Route `/piscine/themes` | Achter feature flag guard | ⚠️ Route is `/formation/themes` (zie afwijkingen) | ⚠️ |

---

## Phase 3 — Observations: ✅ VOLLEDIG

### CalyMob UI
| Item | Plan | Realiteit | Status |
|------|------|-----------|--------|
| `ObservationBottomSheet` | 3 tabs: LIFRAS / Thème / Libre | ✅ 470 regels, alle 3 modi, result selector, meerdere observaties per sessie | ✅ |
| `ExercisePickerWidget` | LIFRAS selectie gefilterd per niveau | ⚠️ 122 regels, **hardcoded** voor 1★ en 2★ — plan zei dynamisch laden | ⚠️ |
| `BulkEvaluationSheet` | Examen-mode | ✅ 298 regels, batch save | ✅ |
| `SessionEvaluationScreen` | Lijst presenten → evalueren | ✅ 191 regels, observatie-counter per lid | ✅ |
| "Évaluer" knop op `SessionDetailScreen` | Achter feature flag | ✅ Geïntegreerd | ✅ |

### CalyCompta UI
| Item | Plan | Realiteit | Status |
|------|------|-----------|--------|
| `ObservationsList` | Herbruikbaar component | ✅ Aanwezig | ✅ |
| `ObservationBadge` | Kleur-badge (acquis/en cours/à revoir) | ✅ Aanwezig | ✅ |
| Observaties in `SessionTimelineCard` | Achter feature flag | ✅ | ✅ |

### Cloud Function
| Item | Plan | Realiteit | Status |
|------|------|-----------|--------|
| `onObservationAcquis` | Auto-validatie LIFRAS bij "acquis" | ✅ 105 regels, deduplicatie, source tagging, volledige logging | ✅ |
| Export in `index.js` | Geregistreerd | ✅ Onder "CARNET DE FORMATION — PROGRESSION (Gen2)" | ✅ |

---

## Phase 4 — Dashboard & Parcours: ✅ GROTENDEELS

### CalyCompta Dashboard
| Item | Plan | Realiteit | Status |
|------|------|-----------|--------|
| `ProgressionDashboard` | Matrix leden × exercices per niveau | ✅ 413 regels | ✅ |
| `NiveauMatrix` | Specifiek matrix-component | ⚠️ Geïntegreerd in ProgressionDashboard (geen apart component) | ⚠️ |
| `ProgressBar` | Kleur-balk per lid | ❓ Niet als apart component gevonden | ❓ |
| `ExerciceDetailPopover` | Klik op cel → detail | ❓ Niet als apart component gevonden | ❓ |
| Route `/piscine/progression` | Feature flag guard | ⚠️ Route is `/formation/progression` | ⚠️ |

### CalyCompta Planning
| Item | Plan | Realiteit | Status |
|------|------|-----------|--------|
| `PlanningPage` | Jaarplanning per niveau | ⚠️ Stub-pagina (5-7 regels) als wrapper | ⚠️ |
| `SessionPlanningPage` | Bewerkbare tabel | ✅ 285 regels, werkend | ✅ |
| Route `/piscine/planning` | Feature flag guard | ⚠️ Route is `/formation/planning` | ⚠️ |

### Onglet Parcours
| Item | Plan | Realiteit | Status |
|------|------|-----------|--------|
| `MemberParcours` (CalyCompta) | Tab "Parcours" in fiche membre | ✅ `MemberProgressionFiche.tsx` — 547 regels, combineert LIFRAS + observaties + aanwezigheden | ✅ |
| Tab in `MembreDetailView` | Achter feature flag | ✅ | ✅ |
| `MyProgressionScreen` (CalyMob) | Eigen voortgang | ✅ 236 regels, stats + observatie-lijst | ✅ |
| Navigatie vanuit home screen | Achter feature flag | ✅ "Ma Progression" knop op home screen | ✅ |

### Navigatie
| Item | Plan | Realiteit | Status |
|------|------|-----------|--------|
| Submenu structuur | Planning sessions / Planning formation / Thèmes / Progression | ✅ `FormationLayout.tsx` met 4 tabs: Progression, Exercices, Planning, Thèmes | ✅ |
| Stub-pagina's | N.v.t. | ⚠️ ExercicesPage, PlanningPage, ProgressionPage, ThemesPage zijn stubs (5-7 regels elk) — wrappers rond de echte componenten | ⚠️ |

---

## Phase 5 — Go-Live: ❌ NIET GESTART

| Item | Plan | Realiteit | Status |
|------|------|-----------|--------|
| Feature branches mergen naar `main` | Beide repos | ✅ Gemerged in CalyMob en CalyCompta | ✅ |
| Deploy CalyCompta | Vercel (auto bij push) | ✅ Code staat op main | ✅ |
| Nieuwe CalyMob build | Naar stores | ❌ Geen specifieke formation-release gedaan | ❌ |
| Feature flag aanzetten | `carnetFormationEnabled: true` | ❌ Vermoedelijk nog `false` | ❌ |
| Soft launch met Geo & Pol | Testen + feedback | ❌ Niet gedaan | ❌ |
| Flag aan voor alle clubs | Volledige launch | ❌ Niet gedaan | ❌ |

---

## Raffinements (Optioneel): ❌ GEEN GEÏMPLEMENTEERD

| # | Feature | Prioriteit (plan) | Status |
|---|---------|-------------------|--------|
| R1 | Push notificatie bij nieuwe observatie | Medium | ❌ `onNewObservation.js` niet aangemaakt |
| R2 | PDF export progressie-dashboard | Medium | ❌ Niet geïmplementeerd |
| R3 | Observaties vanuit milieu naturel (plongées) | Hoog | ⚠️ Model ondersteunt het (`contextType: 'plongee'`), maar **geen UI-integratie** in operatie-schermen |
| R4 | Statistieken per encadrant | Laag | ❌ Niet geïmplementeerd |
| R5 | Import historische LIFRAS validaties | Hoog (eenmalig) | ❌ Niet geïmplementeerd |

---

## Belangrijke Afwijkingen van het Plan

### 1. Route-structuur gewijzigd
**Plan:** Routes onder `/piscine/` (themes, progression, planning)
**Realiteit:** Aparte `/formation/` route met eigen `FormationLayout.tsx` en 4 sub-tabs

Dit is een **bewuste designkeuze** — de formation is een eigen sectie geworden in plaats van een sub-sectie van Piscine. Het voordeel is duidelijkere navigatie; het nadeel is dat het minder geïntegreerd is met de bestaande piscine-flow (wat in de proposé juist als kracht werd beschreven).

### 2. ExercisePickerWidget is hardcoded
**Plan:** Dynamisch laden vanuit `exercices_lifras` collectie in Firestore
**Realiteit:** Hardcoded arrays voor alleen **1★ en 2★** (10 + 9 oefeningen)

**Ontbreekt:** 3★, 4★, AM, MC niveaus — dit zijn niveaus die de proposé expliciet noemt. De hardcoding maakt het onmogelijk om oefeningen centraal te updaten.

### 3. Geen MemberProgressionView materialisatie
**Plan (Proposition):** Cloud Function die een `MemberProgressionView` berekent na elke observatie
**Realiteit:** Progressie wordt on-the-fly berekend in `MemberProgressionFiche.tsx` (547 regels)

Dit is acceptabel voor kleine clubs maar kan performance-problemen geven bij grotere datasets.

### 4. Stub-pagina's als wrappers
Vier pagina's (ExercicesPage, PlanningPage, ProgressionPage, ThemesPage) bestaan als lege stubs van 5-7 regels. Het is onduidelijk of dit placeholder-wrappers zijn voor de echte componenten of onafgemaakte pagina's.

### 5. Thema-data populatie onduidelijk
Het plan beschreef een initieel script om thema's te laden. Er zijn sessies geweest waar thema's in Firestore zijn aangemaakt (6 thema's + later 23 thema's), maar het is onduidelijk of dit productie-data is of test-data.

---

## Wat Ontbreekt — Actielijst

### Hoge prioriteit (nodig voor go-live)
1. **Feature flag activeren** — `carnetFormationEnabled: true` in Firestore
2. **ExercisePickerWidget dynamisch maken** — laden vanuit `exercices_lifras` collectie i.p.v. hardcoded arrays, en alle niveaus ondersteunen (3★, 4★, AM, MC)
3. **Thema-data controleren** — zijn de 23+ thema's nog aanwezig en correct in Firestore?
4. **Testen met Geo en Pol** — soft launch per plan Phase 5
5. **Nieuwe CalyMob build** — release naar stores met formation-feature

### Medium prioriteit (verbetering)
6. **Observaties vanuit operatie-schermen** (R3) — UI-integratie in opérations/plongées zodat encadrants ook tijdens duiken in milieu naturel observaties kunnen noteren
7. **Push notificatie bij observatie** (R1) — `onNewObservation.js` Cloud Function
8. **Stub-pagina's opruimen** — verduidelijken of het wrappers of onafgemaakte pagina's zijn
9. **Route-integratie heroverwegen** — formation terugbrengen onder piscine of bewust houden als aparte sectie?

### Lage prioriteit (nice-to-have)
10. **PDF export** (R2) — progressie-dashboard exporteerbaar
11. **Import historische LIFRAS validaties** (R5) — eenmalig script
12. **Statistieken per encadrant** (R4)
13. **MemberProgressionView materialisatie** — voor performance bij groei

---

## Git Status

| Repo | Branch | Situatie |
|------|--------|----------|
| CalyMob | `feature/carnet-formation` → `main` | ✅ Gemerged, 3 formation-commits op main |
| CalyCompta | `feature/carnet-formation` → `main` | ✅ Gemerged (commit `45efb50`) |
| Firestore rules | `CalyCompta/firestore.rules` | ✅ 3 nieuwe rule-blokken toegevoegd |
| Firestore indexes | `CalyCompta/firestore.indexes.json` | ✅ 6 indexes toegevoegd |
| Cloud Functions | `CalyMob/functions/` | ✅ `onObservationAcquis` geregistreerd |

---

## Totaal Code Geschreven

| Repo | Bestanden | Regels |
|------|-----------|--------|
| CalyMob (Dart + JS) | 11 bestanden | ~1.736 regels |
| CalyCompta (TypeScript + TSX) | ~20+ bestanden | ~2.000+ regels |
| **Totaal** | **~31 bestanden** | **~3.700+ regels** |

---

*Gegenereerd op 7 april 2026 op basis van: Carnet-de-Formation-Proposition.docx, Carnet-de-Formation-Plan.docx, CARNET_DE_FORMATION_TECH.md, IMPLEMENTATIEPLAN_CARNET_DE_FORMATION.md, en de huidige codebase.*
