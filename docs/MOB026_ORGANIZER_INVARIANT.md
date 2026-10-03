# MOB-026 organizer identity and handover

## Phase 1 rules mirror

This file mirrors the staged organizer invariant documented in CalyCompta.

- `organisateur_id` identifies the current organizer.
- `organisateur_nom` is a display projection of that member identity.
- `creator_user_id` identifies the original creator and stays unchanged during
  a handover.

The Phase 1 Firestore rule allows administrators and validators to create an
event for another existing club member. Ordinary users and members with the
Organisateur badge remain restricted to themselves. Final strict name and
creator validation is deferred until the compatibility phase so older CalyMob
versions are not locked out.

## Phase 2 handover rules mirror

The web handover flow selects the target from the member list and writes the
member id and canonical name together. The Firestore mirror now enforces these
authorization boundaries for direct clients:

- `creator_user_id` is immutable after creation;
- when present on create, `creator_user_id` must equal the authenticated user
  (legacy clients may still omit it);
- admins and validators keep their normal event update rights;
- the current organizer and the original creator may hand over an event to an
  existing member, but that narrow write may change only `organisateur_id`,
  `organisateur_nom`, and `updated_at`;
- broad edits require an unchanged organizer id, while a handover must actually
  change that id and cannot be combined with unrelated edits;
- unrelated members cannot perform a handover.

Name equality is deliberately not enforced in this phase. Older CalyMob
versions still write the denormalized name directly; Phase 3 will canonicalize
it server-side without locking those clients out.

## Phase 3 server authority

`writeOperation` is the canonical create, update, and handover writer. It reads
the selected member inside the same transaction and writes that member's
canonical display name; clients cannot supply `organisateur_nom` or mutate
`creator_user_id`. Handover authorization is limited to admins/validators, the
current organizer, and the immutable original creator.

`onOperationOrganizerWritten` remains active for older clients that still write
operations directly. It repairs a stale name projection when the member exists,
using equality as its re-trigger guard. Unknown/missing organizer ids are never
guessed or replaced: they produce a critical `audit_logs` alert. Every id change
creates an idempotent `organizer_audit` entry; legacy writes without fresh actor
metadata are explicitly marked unattributed.

Member renames propagate to every operation whose `organisateur_id` references
that member via `onMemberOrganizerNameUpdated`. This keeps the denormalized name
canonical without changing the original creator or the organizer id.

## Phase 4 mobile alignment

CalyMob create and edit now use `writeOperation` instead of writing operation
identity directly. The picker lists the privacy-safe full member directory,
never free text or an Encadrant-only subset. A handover requires confirmation;
admins/validators, the current organizer and the original creator see the flow.
The handover is a dedicated callable action and closes the edit screen after a
successful transfer, so unrelated edits cannot be combined with it. The server
derives the name, keeps `creator_user_id` unchanged, and the audit trigger
records the completed id transition. No minimum-supported-version or boutique
setting changes are part of this phase.
