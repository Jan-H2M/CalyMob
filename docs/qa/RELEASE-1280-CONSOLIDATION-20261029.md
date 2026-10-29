# CalyMob 1.28.0 — release preparation, not publication

Jan approved 1.28.0 and the following exact French notes on 29 October 2026:

> Gestion Boutique simplifiée : choisissez l’action, précisez les valeurs, sélectionnez les paquets et confirmez. Corrections des inscriptions, des paiements, de la navigation, du suivi des formations et des coordonnées.

## Action-first route integration

The actual guarded Boutique home entry now opens the reviewed wizard, rather
than leaving it reachable only through a QA entry. The same injected service
and access scope lead to the existing shared transport/handover screens.
Their list-only route does not reopen the legacy preparation form. All old
screens remain for compatibility/regression checks; no backend transition is
changed. The deployed move-only 100-piece limit is retained; other actions
remain capped at 50. Oversized selections are rejected atomically.

25 focused tests pass: the actual hub route, step Back, shared missions, role
withdrawal, wizard confirmation/races, 100-piece movement, all-or-none limits,
and existing navigation/access. Targeted analysis reports No issues found.
The earlier 57 Chrome results apply to the prototype commit, not to this new
integrated candidate. No native acceptance is implied.

## Public-baseline release blocker

The following finding describes the inherited pre-consolidation candidate;
see the dated local repair and verification below for the current source.

Fresh GitHub main/DEV reads still identify f10d89e / f23fec7. All 38 mobile PRs
merged since 7 October are ancestors of the inherited candidate. However the
last approved public release fe38fe96b7e51146005d30bc8be4b8ff3168ef23 was built
from a separate branch that was not consolidated into DEV. Comparing against
that public source reveals numerous absent formation/apnée, self-tracking,
pool history, protocol, QR-group/correction and depth-statistics files/tests.
This is not explained by Jan's deliberate removal of the separate Mon parcours
apnée menu entry. A passing suite without those missing tests is insufficient.

The inherited 534 source and binaries stay immutable. No 1.28.0 store build,
upload or submission may use the current tree until both source lines are
properly consolidated and the union of regression tests is reviewed again.
Neither blanket restoration of older privacy behavior nor blanket replacement
by DEV is safe. Current consent/contact decisions and newer stock, payment,
guest, roster, import and navigation fixes must all be retained.

The full metadata inventory covers 164 CalyMob and 161 CalyCompta PRs, including
25 and 33 still-open PRs. The local external PR report records commit/file
comparisons. Inventory does not mean all historical drafts should be merged:
retired workflow infrastructure, old credentials, superseded consent branches,
data fixes and unrelated web changes remain separate.

No push, main/DEV merge, production deployment, financial/member write,
app_version publication, new Cloud run or store mutation has occurred here.
Exact source/artifact approval and native review/explicit eligible waiver
remain required before the eventual public upload/submission.

## Local source consolidation — 29 October 2026

With Jan's explicit local-only approval, merge the public source `fe38fe96`
into the release branch based on `8e1b081`. This is not a merge into main or
DEV and does not modify the immutable 534 source/artifacts. Version remains
1.27.1+534 until a separately verified release bump; this source is not build 534.

Conflict decisions preserve both source lines:

- Restore cumulative sea-inclusive general depth counters, counting-version
  protection, precise depth bins, all-years dropdown and compact statistics.
- Restore complete SCUBA/apnée dossiers, enrollment, official/personal result
  distinctions, protocol readers, historical pool sessions and server QR/group
  workflows. Do not restore the unwanted standalone apnée menu.
- Retain retryable snapshot/observation failures and distinguish a successful
  remark write from a failed subsequent refresh. Session remarks remain dated.
- Restore server-authoritative registration editing and guest-level snapshots;
  retain the universal guest ban, trusted payment interpretation and persisted
  simulation roster. PDF rendering remains pure and includes guest levels.
- Retain the confirmed legacy contact-sharing defaults, explicit revocations,
  phone aliases and reactive contact/birthday widgets. Restore hidden/test-user
  exclusion, including the newer directory stream and comparison reader.
- Retain action → values → packages → review in the real guarded Boutique hub.
  The complete paginated supplier-receipt picker is also available at the package
  step and returns a subset without applying an operation. All returned pieces
  are rechecked against the chosen action, source and limit. Keep shared missions,
  retry identity and the deployed move-only 100/other-action 50 limits.
- Restore login network retry and the existing post-email-correction audit.
- Keep the Cloud workflow internal-only; no public-distribution reconfiguration
  or new run is part of this repair. Expand Cloud regression coverage to include
  the restored depth, formation, QR/history, privacy and registration cases.

Verification on the repaired combined source (synthetic data only):

- Full Flutter suite: **1293 passed, 1 existing skip**, exit 0.
- Full Functions suite: **781 passed, 5 existing skips**, exit 0.
- Focused real Chrome suite: **59 passed**, exit 0, including the supplier-receipt
  return path, canonical stats, formation scopes and attention ordering.
- Local Firestore emulator: apnée transactions/rules, enrollment/concurrency/QR
  protected audit and pool-only observation/privacy boundaries all passed.
- Full Dart analysis: no errors; existing informational/warning debt remains
  (982 diagnostics). Shell/Node syntax and Git whitespace checks passed.

The earlier integration runs exposed and repaired conflict-related failures;
their red logs remain in the external release evidence alongside the final green
runs. No tests were removed to obtain green results. The old receipt test now
scrolls the actual list explicitly before confirming the same selected IDs.
Independent exact-commit review and final native/artifact acceptance are still
required. No new native build, release bump, push, store or backend mutation.

Jan requested smaller batches during this work: no further bug implementation
is added to this consolidation. MOB-050 is separately triaged on the board;
similar unread symptoms are not claimed fixed for its reporter without proof.
