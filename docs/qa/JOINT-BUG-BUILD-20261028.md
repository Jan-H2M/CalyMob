# Joint CalyMob bug candidate — 28 October 2026

Local consolidation authorized by Jan; no publication. Base: DEV
`f23fec7e8f7704b4718d3a015e3fe4f4a3767783`. Main and the ordinary DEV checkout
are not moved or overwritten. Version remains `1.27.1+531`; this is not a new
approved store version/build.

## Included local deltas

- MOB-036 `df3d95b`: retain/retry planned apnée roster names.
- MOB-038/040 `8bef2bb`: authorization-scoped inbox cache and identity gate.
- MOB-041 `b379ef4`: prevent duplicate in-flight bug submissions.
- MOB-044 `9ebfe59` + documentation `89dd1289`: ignore untrusted inline payment
  aliases; requires paired canonical rules from `ad5f95e`.
- MOB-048 `52c29f3`: existing visible attention badges sort first, without new
  full-member queries or permission changes.
- COM-147 `3ee7c5a` + `59de0d2`: safe actionable registration errors;
  `593e03c`: event guest opt-in applies to every new caller.
- Boutique `5d74dda`: original transfer stays unconfirmed, separate current
  supplement QR, fresh payment/email context and no double receipt counting.
- MOB-043 `be2bfde`: complete independent simulation roster, including
  unassigned members; explicit simulation/registration/payment PDF distinction.

Earlier accepted MOB-033, MOB-042, MOB-045/046, COM-075/146 and other DEV work
are retained, not reimplemented. The later `lieuType ?? lieu` fallback and pool
`appRole` parameter are preserved. MOB-047 remains ambiguous, MOB-049 requires a
separate catalogue decision, COM-144/145 are not part of this mobile change.

Each new bug delta has independent exact-commit approval. Consolidated exact
commit review remains separate. Full cumulative DEV contents are not described
as newly reviewed by an individual tip approval.

## Joint verification before this commit

- Full Flutter suite: **1126 passed, 1 explicit existing skip**, exit 0 (~59s).
- Full Functions suite: **637 passed, 5 skipped**, 66 passing suites, exit 0.
- Paired web: 43 targeted component/workflow/matcher tests, TypeScript and local
  Vite compilation green. Flutter release web compilation green (31.2s).
- Paired API: 96 tests green, covering amendments, payment settlement, reference
  matching, endpoint authorization and MCP reads/writes.
- Genuine isolated canonical-rules emulator: 44 guest-policy + 61 accounting
  checks green. Original and supplement receipts: 31 real emulator checks green,
  using both current consolidated source roots; helper bytes identical.
- Release guard/tooling: 30 tests green. Dependency and platform lockfiles
  unchanged. No conflict markers or diff-whitespace errors.
- MOB-043 actual synthetic PDF rendered and text checked; its simulations have
  no registration or payment claim. Initial test-harness failures were fixed
  before the final green runs.

All QA used synthetic fixtures, mocks or isolated demo projects. No Firebase
login, production member/financial data, real order, email, push or payment was
changed. Old screen/PDF analyzer warnings are not represented as fully green.

Native Android debug compilation is a separate QA step, not a signed release
AAB or physical device acceptance. iOS plist/shell checks are not an iOS build;
the intended Xcode Cloud path is not triggered by this local task. No local
Xcode archive, store artifact, version bump, upload, push, shared merge or deploy.
Exact final review/build outcomes are recorded externally with the final commit.
