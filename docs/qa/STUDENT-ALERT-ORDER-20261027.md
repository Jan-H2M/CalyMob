# Student alert ordering — 27 October 2026

Existing board report: `VeQrjImFr94f31K936wd` (no assigned ticket number).
Implementer: root. Dedicated branch: `codex/student-alert-order-20261027`.
Base: `c62f124a652bdf3008f3e1e75c2289e843b94a8a`.

## Scope

Avancement des élèves and Who's Who use the same `FormationListView`.
Rows with existing visible attention, pending-claim or goal badges now precede
rows without them; both groups remain alphabetical by first/last name with a
deterministic ID tie-break. A pool-only reader uses only its existing pool
pending count. It never loads full profiles/snapshots to sort.

This is ordering of existing row signals, not an unread-message counter or an
acknowledgement. It adds no data query, member access, notification, write,
automatic validation, permission or level change. Search and level filters stay
unchanged. No hidden pedagogical score or inactivity heuristic is used.

## Checks

- Before fix: six new actual widget tests, five failing and one passing.
- After fix: 15/15 tests passed across four files: attention ordering, existing
  loading/error/retry UI, pool-safe reader and formation modality progress.
- Widget ordering covers each existing badge, five-signal rows, alphabetical
  groups, filtering and a pool-only loader that rejects any full-data reads.
- 390×844 layout checked for each badge type without overflow or exception.
- Locked dependencies unchanged; offline dependency resolution only.
- Independent exact-commit review is required before this candidate is accepted.

Only synthetic fixtures used; no real student/account, notification, Firebase
login or database changes. Native acceptance and the grouped mobile release are
separate, still-open delivery steps. No push, merge, deploy or store action in
this fix.
