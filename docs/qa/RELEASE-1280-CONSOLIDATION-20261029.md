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
