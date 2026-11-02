# PR167 production backport — 2026-11-02

Authorization: Jan, 16:12 Brussels, “Ja, PR 167 naar productie”. This includes the reviewed main backport and affected Functions only, after COM-153 is verified live. It excludes database writes, callable invocations, mail, stores and undeployed functions.

## Source and deployment boundary

Backport PR167 template validation, patched runtime lock and credentialless Functions CI to main; retain the COM-153 source changes and all existing production releases. Copy the COM-155 read-only inventory unchanged from DEV; do not import DEV exports or enable dailyMedicalExpiryReminder. The DEV inventory checker assumes DEV exports and is intentionally retained on DEV, not repurposed as a main export gate.

Production has heterogeneous source archives. The deploy input is never the entire main/DEV tree: `scripts/pr167_production.py` snapshots immutable deployed source generations, revisions and configuration digests, then patches each affected archive. It verifies the explicit Gen2 name set against COM-155. A source is affected if its locked security dependency versions differ or its template guard is missing. The initial snapshot identifies all 126 Gen2 functions as affected; Gen1 confirmResolution is excluded.

Only package.json, package-lock.json and the validation preamble of renderCommunicationTemplate may differ inside an archive. Every other file is compared byte for byte, including index.js, production-only implementations, COM-153 guards, mail transports and seed templates. Common runtime dependency constraints align with audited main; production-only dependencies (including cheerio) and manifest settings survive. Each resulting graph gets an immutable install, zero runtime audit and the archive’s full synthetic test suite. Repository test fixtures are supplied only to the local harness; emulator integration tests remain skipped without an emulator.

## Required ordering and evidence

1. Prepare the backport while COM-153 runs; perform no cloud mutation.
2. Read the COM-153 release log/pane and require verified live completion; fetch/rebase its main result.
3. Freeze a fresh rollback snapshot after COM-153; prepare/test that exact source set. Keep local archives and full configuration evidence restricted to `/Users/jan/Dev/ops/releases/pr167-production-20261102/` (never commit credentials or raw configuration).
4. Commit the reviewed candidate; require green applicable CI and an independent review. Merge only that candidate to main.
5. Validate no source/config drift. Upload the verified archives, then PATCH only `buildConfig.source` for the explicit affected target names. Maximum eight in-flight targets belong to this one release; no concurrent COM-153 deployment. No trigger, IAM, environment, rule, scheduler or export discovery/update is requested. A failure stops further queued submissions and retains the operation journal; do not retry blindly.
6. Verify live ACTIVE state, new revisions, exact uploaded source hashes, unchanged configuration fingerprints and unchanged non-target inventory through read-only metadata/source reads. No function is invoked to test it.

API field-mask semantics and source upload requirements: [Functions PATCH](https://docs.cloud.google.com/functions/docs/reference/rest/v2/projects.locations.functions/patch), [generateUploadUrl](https://docs.cloud.google.com/functions/docs/reference/rest/v2/projects.locations.functions/generateUploadUrl). Signed upload URLs remain in memory and are never logged.

Rollback is per affected function: its exact pre-release `buildConfig.source` generation and previous revision are in snapshot.json/before/, with a sealed rollback zip for each unique source. Rebuild from that recorded source if needed; the snapshot is taken AFTER COM-153 so rollback preserves its permissions fix. Restoring source is another Functions deployment, not a data restoration.

## Validation

Main backport after the COM-153 rebase: 725 synthetic tests passed / five existing skips, runtime audit zero. The release-tool unit suite covers archive preservation, production extras, malformed/duplicate archives, guarded template patching, source-only API masks, drift fingerprints and COM-153 ordering. Frozen-bundle results, final candidate SHA, CI, reviewer receipt, rollout operations and read-only live verification are recorded in the local release journal and PR description as they complete.

The final post-COM153 rollback snapshot contains 126 affected Gen2 functions in 22 distinct archives. Twenty-one unchanged archives reuse byte-identical candidates by immutable rollback SHA256, with 11,172 successful synthetic test executions and zero runtime audit in the rehearsal. The new COM153 archive excludes tests; its runtime must exactly match the sealed PR203 bundle before its reviewed tests are added to the local harness. Those test files are never added to the deployed archive. The release-tool suite now has eleven tests.
