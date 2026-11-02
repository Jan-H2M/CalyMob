# PR #167: runtime security reconciliation (2026-11-02)

PR: https://github.com/Jan-H2M/CalyMob/pull/167. Work item: `security-pr167`.

## Decision

Keep and update PR #167. Current main (`6d278fa`) and DEV (`3a7a5b1`) have identical Functions package manifests, lockfiles and template helpers; neither includes the PR guards or dependency patches. Merge current DEV into the existing PR head to preserve both histories without a force-push. Add the newly required `follow-redirects` 1.16.2 lockfile update.

## Production evidence (read only)

Using the authenticated `jan@h2m.ai` account with Tailscale running, list the 127 functions in `calycompta`. Resolve the exact GCS source generations for all 126 Gen2 functions, group them by GCS MD5 (21 distinct archives), and read only `package.json`, `package-lock.json`, and the template helper from one representative of each identical archive. Audit each archived lockfile with `npm audit --omit=dev --json`. No function invocation, database query/write, deployment, email or member message was performed. Gen1 `confirmResolution` has no Gen2 source provenance and is outside this dependency comparison.

These are deployment-source lockfile observations, not a measured inventory of installed container layers or proof that every advisory is exploitable. Audit totals count affected package entries including transitive effects; do not sum them across duplicated Functions bundles. See [the source generations, hashes, function mapping and audit counts](pr167-production-dependencies-20261102.json).

| Archive group | Functions | Handlebars | proxy-addr | body-parser | qs | Template guard | Audit packages |
|---|---:|---|---|---|---|---|---:|
| prod-group-00 | 10 | 4.7.10 | 2.0.8 | 2.3.0 | 6.16.0 | yes | 3 |
| prod-group-01 | 3 | 4.7.9 | 2.0.7 | 2.3.0 | 6.16.0 | no | 5 |
| prod-group-02 | 41 | 4.7.8 | 2.0.7 | 2.3.0 | 6.15.3 | no | 25 |
| prod-group-03 | 24 | 4.7.8 | 2.0.7 | 2.3.0 | 6.15.3 | no | 25 |
| prod-group-04 | 9 | 4.7.8 | 2.0.7 | 2.3.0 | 6.15.3 | no | 25 |
| prod-group-05 | 1 | 4.7.9 | 2.0.7 | 2.3.0 | 6.16.0 | no | 5 |
| prod-group-06 | 6 | 4.7.8 | 2.0.7 | 2.3.0 | 6.15.3 | no | 25 |
| prod-group-07 | 1 | 4.7.9 | 2.0.7 | 2.3.0 | 6.16.0 | no | 5 |
| prod-group-08 | 1 | 4.7.8 | 2.0.7 | 2.3.0 | 6.15.3 | no | 25 |
| prod-group-09 | 12 | 4.7.9 | 2.0.7 | 2.3.0 | 6.16.0 | no | 5 |
| prod-group-10 | 2 | 4.7.9 | 2.0.7 | 2.3.0 | 6.16.0 | no | 6 |
| prod-group-11 | 1 | 4.7.9 | 2.0.7 | 2.3.0 | 6.16.0 | no | 5 |
| prod-group-12 | 1 | 4.7.9 | 2.0.7 | 2.3.0 | 6.16.0 | no | 5 |
| prod-group-13 | 1 | 4.7.8 | 2.0.7 | 2.3.0 | 6.15.3 | no | 25 |
| prod-group-14 | 3 | 4.7.9 | 2.0.7 | 2.3.0 | 6.16.0 | no | 5 |
| prod-group-15 | 2 | 4.7.9 | 2.0.7 | 2.3.0 | 6.16.0 | no | 5 |
| prod-group-16 | 1 | 4.7.8 | 2.0.7 | 2.3.0 | 6.15.3 | no | 25 |
| prod-group-17 | 3 | 4.7.8 | 2.0.7 | 2.3.0 | 6.15.3 | no | 25 |
| prod-group-18 | 2 | 4.7.9 | 2.0.7 | 2.3.0 | 6.16.0 | no | 5 |
| prod-group-19 | 1 | 4.7.9 | 2.0.7 | 2.3.0 | 6.16.0 | no | 5 |
| prod-group-20 | 1 | 4.7.9 | 2.0.7 | 2.3.0 | 6.16.0 | no | 5 |

All 21 source lockfiles report advisories. Ten functions already contain the template guard and Handlebars/proxy-addr patches but still have body-parser/qs and follow-redirects findings. The other 116 Gen2 source bundles lack the guard. Production source cannot be equated with main or DEV.

## Updated candidate

- Handlebars 4.7.10; proxy-addr override 2.0.8; body-parser 2.4.0; qs 6.17.1; follow-redirects 1.16.2.
- Reject AST objects and other non-string template fields before either field is compiled; retain absent/null fields and escaped string rendering. Preserve current seed templates and inline-payment-QR handling.
- Add credentialless Node 22 CI: immutable install, runtime audit, complete synthetic Functions suite, unchanged lockfile. No deploy step.
- Local validation: Node 22; 847 tests passed, five existing skips; runtime audit zero known vulnerabilities (rechecked after the final dependency install).

The additional advisory is [GHSA-mrwp-f3q8-3g9p](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p), fixed in follow-redirects 1.16.2. This is a dependency hygiene fix; the advisory explicitly does not claim Axios 1.20.0 is exploitable through its normalised options.

## Release boundary

This work authorizes a reviewed merge into DEV source only. The explicit instruction “Do not deploy functions” applies to DEV and production; no Functions deployment or unrelated Flutter deployment is part of this PR. A DEV source merge does not change any live function.

Jan’s production OK is still needed for a separately reviewed production backport and an explicitly named Functions rollout. Prepare that backport against each relevant live source generation, preserve production-only code and the 15-function manifest drift tracked separately in COM-155, and review a deployment allowlist before requesting approval. Do not deploy the entire current DEV source tree over the heterogeneous production inventory. No database backfill, rules deployment, store release or external message is required by this security PR.
