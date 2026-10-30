# Joint bug follow-up — 29 October 2026

Jan requested continued bug work and an explicit check of the agreements in the
chat, not just the board. This local follow-up does not authorize publication.

## Source and scope

Base is the unchanged internal 1.27.1 (533) source
`df147d04e5ec7c0db72cc0b4babc1f1ddd4ac8d0`. A separate worktree/branch preserves
that exact tested build and the ordinary DEV/main checkouts. Fresh main/DEV
fetches still resolve to `f10d89e` / `f23fec7` respectively.

Two already independently reviewed MOB-042 deltas are applied, not a replacement
of the older worktree's whole tree:

- `6fda939`: consistent visible navigation, including loading/access failures;
  separate place and finishing explanations; no operation merely by navigation.
- `25120b8`: retain the deployed receipt/plain-stock contract while supporting
  manager-only whole-order selection. The handler in this candidate is byte
  identical to that tip. Historical supplier identity, pagination and the
  move-only 100-piece limit are not reverted.

Additional regression tests exercise Android system-back and the iOS edge-back
gesture through the failing order picker, lot session and management page. Both
use real Flutter navigation with synthetic access/transport boundaries, not
real devices or production credentials.

## Chat requests reconciled

| Request | Current evidence and remaining boundary |
| --- | --- |
| Boutique navigation blocked on both phones | Navigation delta and platform-back regressions included here. It is **not** in the installed 533 binaries. A later exact build and native acceptance are still needed. |
| Place **and** finishing/embroidery state | Six explicit actions retained after selection. Finishing at Jim preserves location; transport and arrival are separate; plain-stock review cannot bypass mandatory/customer embroidery. No arbitrary embroidered toggle. |
| Select a complete order before an action | The reviewed/deployed read contract is retained here and 28 local emulator cases pass. Authenticated live-screen acceptance is still separate. |
| Change size before payment confirmation; only charge the difference | The existing 533 supplement flow is retained, including the €6.62-only QR and an unconfirmed original transfer. It still needs its separately approved paired backend/rules rollout; no real payment is confirmed here. |
| Keep all approved bug fixes in one app candidate | The entire 533 source is preserved outside the narrow MOB-042 delta. Guest/tariff, payment-status, simulation roster and attention-order regressions were rerun. Version/build number and lockfiles are unchanged; this is not a new store build. |
| Remove the two empty drafts from 28 October | The prior local removal record shows exactly two records moved to recoverable `supprime`, with zero inscriptions. No new deletion here. Existing code only retrieves a user's own drafts; no new general visibility policy is inferred. |
| Apply the guest prohibition to everyone | Present in the inherited candidate and tested, but the paired production guest-policy rollout is still outstanding. Corrected activity prices do not prove that policy is live. |
| Give reporters a personal answer | Only individually approved WhatsApp texts were sent to Alexandre and Geoffroy. Alexandre confirmed that registration works. No automatic push or mail delivery feature is implemented by this follow-up. |

MOB-047 still lacks the affected screen/field; no brevet is guessed or modified.
MOB-049 is a shared catalogue spelling correction, not a Flutter string; a
specific production-data correction remains separate. COM-144's original
runtime cause remains unproved despite the live source/regression checks.
COM-145 Organon work and production member changes are outside this mobile
follow-up. These are not represented as resolved by a green app test.

## Verification on this combined tree

All commands exited 0. Separate targeted runs avoid an unbounded full-suite job.

- Flutter run A: **34 passed** across six Boutique files: navigation (including
  Android system-back and iOS edge-back), stock selection, access, confirmation
  lifecycle and the current-payment panel.
- Flutter run B: **50 passed** across seven files: guest flow/actionable errors,
  draft ownership/visibility, payment presentation, persisted simulation roster
  and attention-first ordering.
- Flutter run C: **65 passed** across three files: authoritative tariff receipt,
  role eligibility and rejection of untrusted inline payment aliases.
- Functions: **84 passed** in three Jest suites (`eventWaitlist`,
  `paymentContext`, `paymentEmail`). An earlier 11-case subset is not added to
  this total a second time.
- Real local Firestore emulator: **28 passed**, zero failed/skipped, for
  `orderSelection.emulator.cjs` and `physicalOperations.emulator.cjs` using only
  `demo-boutique-qr` on `127.0.0.1:8087`. Test clubs are cleaned up; notification
  senders are mocked. No real push, stock, order or bank changes.
- Targeted Boutique Dart analysis: **No issues found**. Node syntax and
  `git diff --check` passed; `pubspec.lock` and `ios/Podfile.lock` unchanged.

This is local integration/regression evidence, not a new full-suite, signed
build, camera test, authenticated live operation or physical-device acceptance.
Exact candidate review and its outcome are recorded separately after commit.
No push, shared merge, Firebase login, deploy, store upload or production
business-data write is part of this work.
