# Store release gate

The store release gate is a local safety interlock.  It does not create a
manifest or grant an approval.  Every store action goes through
`scripts/verify_store_release.cjs` before Fastlane contacts a store.

## External manifest

Set `CALYMOB_RELEASE_MANIFEST` to an absolute JSON path outside this repository.
For every platform/action, the manifest must bind all of the following to the
current clean checkout:

- `schemaVersion: 1`, `sourceCommit`, `version`, `build`, `platforms`, and
  `allowedActions`;
- the exact French release notes in `notes['fr-FR']`;
- `janApproval`, with Jan Andriessens' explicit, timestamped evidence and the
  matching commit/version/build/notes SHA-256/platform/action;
- an approved independent `codeReview` for the exact commit;
- passing `testEvidence` for the exact commit;
- the current artifact path, provenance, and SHA-256; and
- a `nativeReview` whose commit and artifact SHA-256 match exactly.

`submit` also requires matching uploaded-build evidence and explicit matching
`--version` and `--build` arguments.

## Channels and native review

The default channel is `public`.  Public uploads and all `submit` actions
require a full native visual/functional review:

```json
{
  "verdict": "approved",
  "reviewer": "…",
  "sourceCommit": "<current SHA>",
  "artifactSha256": "<current artifact SHA-256>",
  "evidence": "…"
}
```

Only an internal testing upload may replace that review with an explicit waiver.
This is limited to iOS TestFlight upload and Android Google Play internal-track
`upload-and-submit`; it is never valid for public actions or `submit`.

```json
{
  "allowedChannels": { "ios": ["internal"] },
  "janApproval": {
    "allowedChannels": { "ios": ["internal"] }
  },
  "nativeReview": {
    "ios": {
      "verdict": "waived",
      "waivedBy": "Jan Andriessens",
      "reason": "The internal track is the hands-on review channel.",
      "sourceCommit": "<current SHA>",
      "artifactSha256": "<current artifact SHA-256>",
      "evidence": "…"
    }
  }
}
```

Both channel opt-ins are required so an internal waiver cannot silently apply
to a public release.  All other release evidence remains mandatory.

This exception implements Jan's 2026-09-25 11:18 instruction: internal testing
tracks may record a waived hands-on review with a reason; public store releases
still require a full hands-on review.

## Fastlane mapping

- `ios fastlane deploy` passes `--channel internal` and uploads only to
  TestFlight (`skip_submission: true`).
- `android fastlane internal` passes `--channel internal` and uses the Google
  Play internal track.
- iOS release/submit and Android deploy/release keep the default public
  channel and cannot use the waiver.
