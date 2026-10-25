# CALYMOB-23 — Firestore `permission-denied`

Initial analysis: 2026-10-18
Follow-up: 2026-10-25, app-side hardening for 1.27.1+531
Target: isolated CalyMob DEV worktree; no rules or production changes

## Confirmed production evidence

The initial read-only investigation could not open Sentry and therefore treated
the activity-detail listener as a high-confidence candidate only. **That
uncertainty is superseded on 2026-10-18 by the Sentry evidence supplied by Jan;
the earlier candidate analysis is retained below for context.**

- 37 events affecting 17 users since 2026-09-10.
- Latest event in the initial evidence sample: 2026-10-17 18:06 UTC.
- Release: CalyMob 1.26.0+225 on iOS.
- Viewer: plain member (`appRole=membre`, statute `Membre`, level P2).
- Route: the member opened operation `yVcImCPbjawXc8JINu1i` without being
  enrolled.
- Breadcrumbs: exercise lookup for P2, two participants, repeated
  `Erreur batch lookup member info: permission-denied`.
- Fatal event: unhandled `FirebaseException(permission-denied)` from
  `MethodChannelQuery.snapshots`.

This confirms two app-side reads that did not match the privacy rules:

1. operation detail queried other participants from the private
   `clubs/{clubId}/members` collection; ordinary members may read only their
   own private member document;
2. operation detail unconditionally listened to every
   `member_observations` document for the operation, while ordinary members
   may read only observations whose `memberId` is their own UID.

The same unhandled session-wide observation listener existed in the palanquée
and pool-session evaluation screens.

## Initial app fix (`b10c792`, 2026-10-18)

- Participant avatar/level decoration now reads `member_directory`, the
  club-readable privacy-safe projection, instead of private `members`.
- `MemberObservationService` exposes explicit full-session and own-session
  streams. Full-session reads are used only when the app-side gate mirrors
  `canReadFullFormation`: app admin, or Encadrant plus MC/MF/MN.
- Ordinary members use the rule-compatible personal observation stream and
  filter it to the open operation. No observation belonging to another member
  is requested.
- Activity detail, palanquée, and pool evaluation retain and cancel their
  subscriptions, ignore stale generations, and handle asynchronous stream
  errors explicitly.
- Activity detail and palanquée show a small French snackbar with retry.
  Pool evaluation shows a compact French error row with retry. A direct route
  to pool evaluation initially failed closed before starting listeners if the member
  lacked full formation access. The 531 follow-up below permits self-only reads
  while keeping evaluation actions restricted to validators.

No Firestore rule was loosened or changed.

## Superseded candidate analysis (retained)

The read-only analysis correctly identified the unconditional operation-wide
query in `OperationDetailScreen._loadExerciceObservations`, the same query in
`PalanqueeScreen` and `SessionEvaluationScreen`, and the missing `onError` and
subscription cancellation. It also noted the private participant-info batch
lookup. Because Sentry was not accessible at that time, it described the exact
CALYMOB-23 attribution as unconfirmed and highlighted a rules-history timeline
question. The supplied Sentry evidence now confirms the screen, query family,
member role, production release, and unhandled listener failure.

## Rule boundary and risk decision

The `member_observations` rule remains the source of truth:

- a member may read their own observations;
- administrators and Encadrant+MC/MF/MN validators may read the full formation
  set;
- pool-only access remains limited to piscine context.

Broadening reads to every club member would expose pedagogical notes and
results and would undo the MOB-033 privacy boundary. The fix therefore changes
only app query selection and failure handling. Remaining risk is limited to a
temporary unavailable-message if authentication or rules change again; such an
error is now handled rather than escaping to Sentry as an unhandled exception.

## Verification

Automated coverage checks that the own-session stream returns only the signed-in
member's data for the requested operation and that the full-session stream
returns the complete session for authorized callers. DEV manual verification
should cover:

1. plain member, not enrolled: open an activity with participants; no crash and
   no private-member permission error;
2. enrolled plain member: own observation decoration may load, never another
   member's observation;
3. admin or Encadrant+MC/MF/MN: participant observations remain visible;
4. palanquée and pool evaluation: force a denied/offline stream and confirm the
   French retry message appears without an unhandled exception.

No production deployment, store build, TestFlight upload, or rule change is
part of this DEV fix.

## Follow-up event on 2026-10-24: an older client, not proof of a regression

Evidence supplied for this follow-up identifies Sentry event
`994cc2dfc4aa4fb989bb495c1eaad05a` on 2026-10-24, release
`com.calypsodc.calymob@1.27.0+523`:

- The viewer was an Encadrant with level `P4`, without `MC`/`MF`/`MN`.
  Managing an activity or palanquée does not grant full formation reads or
  LIFRAS evaluation writes. `PermissionHelper.canValidateLifras` must remain
  false for this profile.
- An `event_message` notification opened operation `EYzu2VtdBGcgIx19g7lk`.
- Breadcrumbs include the pre-fix private `members` batch lookup denial,
  followed by the operation-wide `member_observations` listener without an
  error handler. The latter can escape through `MethodChannelQuery.snapshots`.

Local Git evidence confirms that build 523 came from `fe38fe9`, authored on
2026-10-17, with `pubspec.yaml` version `1.27.0+523`. That commit precedes
`b10c792` (2026-10-18, “Fixes CALYMOB-23: handle denied observation listeners”).
The older operation-detail source still contains the private `members` lookup
and `getObservationsForSession(...).listen(...)` without `onError`.

The event date is therefore later than the initial fix, but the running app
was built before that fix. This event corroborates the original read/query
mismatch; it does not establish a regression in the newer app source. A local
code fix or version bump does not prove that affected users have installed it.
No live rules deployment or store rollout is inferred from Git history.

## 1.27.1+531 app-side hardening

All changes are confined to `/private/tmp/calymob-23`. The main CalyMob worktree,
`firestore.rules` and `storage.rules` are outside the edit scope.

- **MyProgressionScreen** owns its observation subscription, cancels it before
  retry and on disposal, and guards callbacks with a load generation. Missing
  authentication stops loading without starting a query. A rejected snapshot
  future is caught even after navigation; a denied observation stream retains
  the last loaded observations and shows “Les observations sont indisponibles
  pour le moment.” with “Réessayer”. The existing `FormationSnapshotReader`
  remains the default: `FormationSnapshotService` in this branch is a different
  API/model, not an interchangeable reader.
- **PalanqueeScreen** accepts injectable observation, LIFRAS and assignment
  services. It chooses full-session reads only with full formation access,
  otherwise reads the viewer's own observations, and never queries an empty
  member ID. Both exercise-chip entry points and the evaluation sheet itself
  require `canReadAllObservations`. Stream failure keeps loaded decoration,
  shows French retry UI, and cannot outlive the screen's subscription.
- **SessionEvaluationScreen** accepts injectable observation and attendee
  services (and an optional LIFRAS dependency). Admin or Encadrant+MC/MF/MN
  uses the full-session stream; other signed-in viewers use the self-only
  stream and cannot open the evaluation editor. The attendee collection is
  already club-readable; this does not grant access to others' observations.
  Existing retry, error handling, retained attendee/count data and disposal
  cancellation are covered by widget tests.
- **OperationDetailScreen** uses its injectable observation service for reads
  and exercise evaluation writes, including the palanquée route. Participant
  exercise chips and the evaluation sheet require
  `_canReadAllMemberObservations`, matching `canValidateLifras` rather than
  operational palanquée-management rights. Both add and update failures are
  caught and show a French error snackbar instead of an unhandled Future.

### Automated verification for the follow-up

`test/services/member_observation_service_test.dart` retains the service query
checks: a self-only stream never returns another member's observation and an
authorized full-session stream returns the complete session.

`test/screens/observation_stream_error_handling_test.dart` adds:

- the role matrix for admin, Encadrant+MC/MF/MN, Encadrant+P4/AM, ordinary
  members and MC without Encadrant;
- full-session versus self-only stream selection in session evaluation and
  palanquée;
- `FirebaseException(plugin: 'cloud_firestore', code: 'permission-denied')`
  emissions on progression, session evaluation and palanquée, with French
  retry UI and no unhandled widget-test exception;
- preservation of last valid observations/attendees, replacement of listeners
  on retry, cancellation on disposal, stale snapshot protection and rejected
  snapshot futures after disposal;
- no observation query for a missing progression user or empty palanquée UID,
  and no evaluation action on session participant rows for a P4 Encadrant.

These are local app-side tests, not live Firestore-rules or production rollout
verification. No Firestore/Storage rules were changed, and no release or
production action is part of this follow-up.

### Local validation on 2026-10-25

- `flutter test` on the new observation widget tests, the observation-service
  tests and the existing operation-detail regression tests: **38 passed**.
- `flutter analyze`: **0 errors, 0 new diagnostics** compared with the exact
  `9e490d3` parent baseline; 968 existing warnings/info remain (baseline 972).
- The diff contains no Firestore/Storage rule change or main-worktree edit.

## Detailed initial investigation — historical evidence retained in full

The following analysis is restored from
`/tmp/sentry-calymob-23-analysis-2026-10-18.untracked-backup.md`. It describes
source and access limitations at the initial read-only investigation. Its line
references, “current” wording, unconfirmed attribution and requested evidence
are historical, superseded where the confirmed evidence above applies. The
September onset/live-rules history caveat remains a qualification of the whole
Sentry issue's history, not a reason to delay this authorized app-side fix.

### Historical executive finding

The strongest defect visible in the current CalyMob DEV source is an unconditional,
operation-wide listener on `clubs/{clubId}/member_observations`. Opening an operation
detail starts that listener for every signed-in member, although the current formation
privacy rule only permits:

- the observed member to read their own observations;
- an administrator or an Encadrant who is also MC/MF/MN to read the complete dossier;
- a piscine editor to read observations whose `contextType` is explicitly `piscine`.

The query filters only on `contextId` and orders by `memberName`. For a user without
full-formation access, Firestore cannot prove that every possible result satisfies the
document-level rule, so it rejects the whole query. The listener has no `onError`, is
not retained, and is not cancelled. Its asynchronous error therefore reaches the
Sentry-owned zone as an unhandled exception.

This is a real current-code/rule incompatibility, but it is **not conclusively proven to
be CALYMOB-23**. Sentry redirected to the H2M login page, so no stack trace,
breadcrumbs, release, first/last event, or affected-role tags were available. The
cached Firebase/gcloud authentication was also unavailable, so the live production
ruleset could not be read. More importantly, Git history places the restrictive
`member_observations` read rule in MOB-033 commits authored 10–11 October and merged
to `dev` on 16 October, whereas CALYMOB-23 is reported as occurring since September.
The 5 October release source (`f53bbf6`, 1.23.6+221) still contains the unhandled
listener, but its repository rules snapshot allowed every authenticated club member
to read observations. Therefore:

- confidence that the current DEV listener is defective: **high**;
- confidence that this exact listener explains CALYMOB-23 since September: **medium-low
  until a Sentry event and the live ruleset are inspected**.

The supplied “about 16 users since September” count is treated as report metadata; it
could not be independently verified.

### 1. Triggering screens, query, and listeners

Line references below are against local `origin/dev` unless another ref is named.

#### Primary current-code candidate: operation detail

| Evidence | Location | Result |
|---|---|---|
| The normal constructor enables auxiliary profile data by default. | `lib/screens/operations/operation_detail_screen.dart:54-74` | No role or formation permission is required. |
| Every operation detail calls `_loadUserProfile()` after the first frame. | `lib/screens/operations/operation_detail_screen.dart:262-278` | This runs for ordinary viewers as well as staff. |
| After loading the viewer's profile, the screen always calls `_loadExerciceObservations()`. | `lib/screens/operations/operation_detail_screen.dart:438-454` | The observation read is not gated by `_canManagePalanquees`, administrator status, or LIFRAS validation permission. |
| The screen subscribes to the session-wide observation stream. | `lib/screens/operations/operation_detail_screen.dart:5336-5359` | `.listen(...)` has no `onError`. |
| The service queries all observations for the operation. | `lib/services/member_observation_service.dart:29-39` | Query: `where('contextId', isEqualTo: operation.id).orderBy('memberName')`; it has no `memberId` or `contextType` constraint. |
| `dispose()` does not cancel anything. | `lib/screens/operations/operation_detail_screen.dart:322-325` | The listener can outlive the screen; `mounted` only prevents `setState`, not stream errors. |

User-visible path: **Activities → open any event/operation detail**. The failing read is
started even when the exercise-observation UI is not useful or visible to that viewer.

#### Secondary callers of the same incompatible query

1. **Palanquée screen** — `lib/screens/operations/palanquee_screen.dart:50-55` starts
   the load; `:538-559` subscribes to the same operation-wide query without
   `onError`. The surrounding `try/catch` cannot catch an error delivered later by
   the stream. The palanquée entry is present from operation detail at
   `operation_detail_screen.dart:2495-2504` and navigation occurs at `:5029-5055`.

2. **Piscine session evaluation** —
   `lib/screens/piscine/session_evaluation_screen.dart:47-67` starts both the attendee
   stream and `getObservationsForSession(...)` with no `onError` or cancellation. The
   current UI gate for “Évaluer la session” mirrors the full LIFRAS validator check
   (`lib/screens/piscine/session_detail_screen.dart:550-562,1320-1350`), so authorized
   MC/MF/MN+Encadrant/admin users should pass. A pool-only editor would still be
   rejected if they reach the screen because the query does not constrain
   `contextType == 'piscine'`.

3. **My progression** — `lib/screens/formation/my_progression_screen.dart:36-52`
   also listens without `onError`, but its service query constrains
   `memberId == current uid` (`member_observation_service.dart:16-27`). That shape
   matches the self-read rule, so it is not the leading permission-denied candidate;
   it should nevertheless be hardened against auth/rules/session errors.

#### September-era alternatives checked

- The unread-cursor feature-flag subscription has an explicit `onError`
  (`lib/providers/unread_count_provider.dart:479-499`), and refresh errors are caught
  in `_drainRefreshQueue()` (`:754-777`). It is not an unhandled-current-code
  candidate.
- The personal notification-history query is rendered through a `StreamBuilder` with
  `snapshot.hasError` UI (`lib/screens/communication/notification_history_screen.dart:42-64`).
  Its rule requires the member's own ID and a valid session, so it may show
  “Historique indisponible”, but current code does not let that stream error escape.
- A September team-channel query/rules mismatch was explicitly fixed by
  `5a96bae` (26 September): the old mutable-`type` collection query was replaced by
  exact authorized document-ID listeners. The service's async generator catches its
  stream errors and yields fallback channels, so it is also less consistent with an
  unhandled crash.
- Current activity and operation providers attach `onError` handlers
  (`lib/providers/activity_provider.dart:75-172`,
  `lib/providers/operation_provider.dart:76-97`).

Without the Sentry stack/breadcrumbs, these checks cannot exclude a historical app
release, an expired-auth race, or a different screen not represented by the current
source.

### 2. Denying Firestore rule and affected roles

The canonical current rule source is CalyCompta `origin/main:firestore.rules`; the
CalyMob `origin/dev:firestore.rules` mirror has the same effective observation read
gate.

Canonical rule (`CalyCompta/firestore.rules:2130-2140`):

```rules
match /clubs/{clubId}/member_observations/{observationId} {
  allow read: if isMember(clubId) && (
    resource.data.memberId == request.auth.uid ||
    canReadFullFormation(clubId) ||
    (
      isPiscineFormationEditor(clubId) &&
      resource.data.contextType == 'piscine'
    )
  );
}
```

The helper chain is at `CalyCompta/firestore.rules:246-262`:

- `canReadFullFormation` delegates to `canValidateLifras`;
- `canValidateLifras` permits an admin, or a member who is both an Encadrant and a
  LIFRAS Moniteur;
- Moniteur is limited to `plongeur_code` MC, MF, or MN.

The piscine and career-role definitions are at `CalyCompta/firestore.rules:66-96`.
The CalyMob mirror gives the same definitions at `firestore.rules:66-97,266-291` and
the read rule at `:2095-2105`.

#### Role result for the operation-wide query

| Member role/profile | Operation-wide query result | Why |
|---|---|---|
| `admin` / `superadmin` | Allowed | `isAdmin` satisfies `canReadFullFormation`. |
| Encadrant **and** MC/MF/MN | Allowed | Both halves of `canValidateLifras` are true. |
| Encadrant without MC/MF/MN, including AM | Denied | Career badge alone is insufficient. |
| Pool-only P/Piscine/“Encadrants et assistants” | Denied for the current query | The rule can permit piscine documents, but the query does not include `where('contextType', isEqualTo: 'piscine')`; Firestore cannot prove the result set. |
| Ordinary member/user | Denied | A self-read is possible only with a query constrained to their own `memberId`; `contextId` alone can return other members. |
| CA, Accueil, Gonflage, Organisateur-only | Denied | Those operational roles are not formation-read grants. |
| `validateur` app role without admin or Encadrant+MC/MF/MN profile | Denied | `validateur` is not referenced by this rule/helper chain. |

Firestore rules authorize the *potential query result*, not the documents that happen
to exist today. Client-side filtering after the snapshot would not fix the denial.

#### Deployment/timeline qualification

Repository history is materially inconsistent with a September start for this exact
rule collision:

- the broad listener was introduced by `2766aa25` on 7 April 2026;
- the pre-MOB-033 rule at `c2f5eac8^` allowed all authenticated club members to read
  `member_observations`;
- MOB-033 restricted reads in `c2f5eac8`, `fc8496b`, and `52277d7` (authored
  10–11 October, merged to `origin/dev` on 16 October by PR #131);
- `docs/bugs/MOB-033.md:38-39` states that the DEV merge did not itself deploy
  production rules or an app release.

Consequently, the rule above is the rule that rejects the current DEV query shape, but
it must not be described as the proven production rule behind CALYMOB-23 without
checking the live rules release and a Sentry event. Possible explanations are live
rules drift outside this Git history, Sentry grouping a different permission-denied
path, or a September first event from an older release/rule combination.

### 3. Why Sentry records an unhandled crash/error

`Stream.listen` delivers asynchronous stream errors to its `onError` callback. If no
callback is supplied, the error is forwarded to the current Zone. CalyMob initializes
Sentry first and runs the app inside Sentry's `appRunner` zone
(`lib/main.dart:82-87,136-145`). Its `beforeSend` filter removes only listed transient
network signatures and does not remove Firestore `permission-denied`
(`lib/main.dart:99-130`).

Therefore the three observation subscriptions above can produce an unhandled async
`FirebaseException`, which Sentry captures. There is no observation-specific error
state, fallback, or retry. In operation detail and the palanquée screen, the UI may
continue rendering while Sentry classifies the unhandled exception as an error; an
actual process termination is platform/runtime dependent and cannot be established
without CALYMOB-23 event details. “Crash” should therefore be read here as **an
unhandled exception captured by Sentry**, not a telemetry-confirmed hard app exit.

The empty `dispose()` and unretained subscriptions additionally permit callbacks or
errors after navigation. The `mounted` guards prevent stale `setState`, but do not
cancel the Firestore listener or handle its error.

### 4. Proposed fix

#### App-side fix (recommended first)

1. **Do not start a broad observation read for unauthorized users.** In operation
   detail and the read-only palanquée view, load all participant observations only
   when the local permission model says `canReadFullFormation`. Ordinary members do
   not need other members' pedagogical observations.
2. **Match every permitted limited query to the rule.** If the product needs the
   viewer's own observations, use both `contextId == operationId` and
   `memberId == current uid`. If a pool-only screen needs pool observations, add
   `contextType == 'piscine'` as an explicit query constraint. Add the required
   composite indexes if Firestore requests them.
3. **Handle stream failure explicitly.** Supply `onError`, retain the last authorized
   data (or an empty initial view), and show a non-blocking French error/retry only in
   UI that actually exposes observations. Treat `permission-denied` as an access/data
   availability outcome, not as an application crash.
4. **Own listener lifecycle.** Store each `StreamSubscription`, cancel before
   replacing it and in `dispose()`, and use a generation guard if operation/session
   identity can change while an older subscription completes.
5. **Centralize query shapes.** Replace the single ambiguous
   `getObservationsForSession` API with explicit methods such as
   `watchFullSessionObservations`, `watchPoolSessionObservations`, and
   `watchOwnSessionObservations`; require the caller to choose an authorization
   scope.

Likely files:

- `lib/services/member_observation_service.dart`
- `lib/screens/operations/operation_detail_screen.dart`
- `lib/screens/operations/palanquee_screen.dart`
- `lib/screens/piscine/session_evaluation_screen.dart`
- defensively, `lib/screens/formation/my_progression_screen.dart`
- unit/widget tests for service query shape, role gating, error UI, retry, stale
  subscription prevention, and disposal
- Firestore emulator tests for the exact production query shapes

#### Rule-side decision

Do **not** restore `allow read: if isMember(clubId)`. That would undo the MOB-033
privacy boundary and expose pedagogical notes, results, and formation data to the
whole club.

No rule change is necessary if the UI is brought into alignment with the existing
privacy model. If the product deliberately wants an operation organizer to see some
training state, use a privacy-reviewed, minimal server-owned projection or callable
instead of granting the organizer the raw `member_observations` collection. The
projection should contain only the fields needed for event operation and have an
operation-scoped authorization check.

#### Test matrix

Run Firestore emulator tests with the exact queries for:

- admin;
- Encadrant+MC, Encadrant+MF, Encadrant+MN;
- Encadrant without Moniteur and AM;
- pool-only P/assistant;
- Organisateur-only;
- ordinary member reading self versus an operation-wide result.

Add UI tests proving that permission denial does not escape the listener, that the
last valid state remains visible, retry replaces the listener safely, and navigation
away cancels it.

### Risks and rollout notes

- **Privacy risk (high) if rules are broadened:** raw observations are pedagogical and
  may contain notes/results about other members.
- **Compatibility risk (medium):** deploying the strict rule while released clients
  still issue the broad query creates Sentry noise for every non-full-formation event
  viewer. Confirm the live ruleset and released-version distribution before any rule
  deployment.
- **UX risk (low/medium):** role-gating may remove exercise-result decorations that
  ordinary members previously saw. Confirm intended visibility; self-only data can be
  preserved without exposing others.
- **Index risk (low):** adding `memberId` or `contextType` beside `contextId` and
  `orderBy(memberName)` may require explicit composite indexes.
- **False attribution risk (current):** fixing this defect without first matching one
  CALYMOB-23 stack/breadcrumb could leave the reported September issue unresolved.

### Required confirmation before implementation

Read-only evidence sufficient to turn this from a strong candidate into a confirmed
RCA is:

1. one CALYMOB-23 event showing exception value/code, top application frame,
   breadcrumbs/navigation route, app release/build, OS, and first/last event times;
2. the currently released Firestore ruleset name/source (or proof of its deployment
   commit);
3. affected-user role samples in aggregate only, without personal data.

If the stack names `operation_detail_screen.dart`, `palanquee_screen.dart`,
`session_evaluation_screen.dart`, or `member_observation_service.dart`, the diagnosis
above is confirmed. If it names a different query, the same listener/error-handling
audit should be applied to that exact path.

### Related documentation checked

- `docs/bugs/MOB-033.md:3-28` — supersedes broad formation reads, establishes the
  restricted full-vs-pool privacy model, and explicitly requires missing/denied data
  to fail closed with a visible load error. The three raw observation listeners do
  not satisfy that error-handling requirement.
- `docs/NOTIFICATIONS_MASTER.md:1115-1165` — unread cursor history and current atomic
  badge/list contract. It requires failed or stalled refreshes to retain the last
  complete state, show explicit retry, and prevent stale subscriptions from
  overwriting newer state. It does not mention CALYMOB-23 or
  `member_observations`, but provides the established resilient-listener pattern.
- `docs/bugs/MOB-038-MOB-040.md:14-35` — documents the same retained-list,
  timeout/retry, `onError`, and generation-guard conventions for activity lists.
- `docs/NOTIFICATIONS_EN_BADGES_RAPPORT.md:530-548` — records historical duplicate
  listener concerns and recommends consolidating listener ownership. It contains no
  Firestore-role explanation for CALYMOB-23.
- `CalyCompta/docs/formation/CARNET_DE_FORMATION_TECH_v1_FR.md:278-300,356-375,641-669`
  — describes the observation schema and the historical session-wide Dart query. Its
  old “all authenticated members may read” rule example is superseded by MOB-033 and
  must not be treated as the current privacy policy.

No searched documentation contains a direct reference to `CALYMOB-23`.
