# CALYMOB-23 — Firestore `permission-denied`

Date: 2026-10-18  
Target: CalyMob DEV only

## Confirmed production evidence

The initial read-only investigation could not open Sentry and therefore treated
the activity-detail listener as a high-confidence candidate only. **That
uncertainty is superseded on 2026-10-18 by the Sentry evidence supplied by Jan;
the earlier candidate analysis is retained below for context.**

- 37 events affecting 17 users since 2026-09-10.
- Latest event: 2026-10-17 18:06 UTC.
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

## DEV fix

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
  to pool evaluation also fails closed before starting listeners if the member
  lacks full formation access.

No Firestore rule was loosened or changed.

## Superseded candidate analysis (retained)

The read-only analysis correctly identified the unconditional operation-wide
query in `OperationDetailScreen._loadExerciceObservations`, the same query in
`PalanqueeScreen` and `SessionEvaluationScreen`, and the missing `onError` and
subscription cancellation. It also noted the private participant-info batch
lookup. Because Sentry was not accessible at that time, it described the exact
CALYMOB-23 attribution as unconfirmed and highlighted a rules-history timeline
question. The supplied Sentry event now confirms the screen, query family,
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
