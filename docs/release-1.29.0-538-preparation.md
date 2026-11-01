# REL-MISSIONS-1101 — 1.29.0 (538) preparation, not distribution approval

Jan approved version 1.29.0 with the next free build number on 1 November 2026.
The live canonical Xcode Cloud/ASC counter was read again: run 537 is the latest,
COMPLETE/SUCCEEDED, with uploaded 1.28.0 (537) VALID. This change reserves 538;
read the live product counter again before any future build start. Failed and
canceled runs consume numbers too. Do not change the Cloud workflow to force it.

## Publication hold

The French and Dutch notes in this commit are **proposals, not approved store
copy**. Jan's French-text answer is still pending. The Dutch text is a draft
translation, not separate authorization to publish a Dutch locale. Do not upload
or submit either store's release metadata or submit a build for review until the
applicable text approval is recorded. This preparation does not authorize a
production backend/rules deployment, business-data change or app_version write.

There is a second independent production-build blocker: unchanged DEV includes
AV-LOAN-001 (#187), whose liability wording requires board review before
production activation. It has no feature flag and a store client would activate
its consent form even without deploying rules. Do not distribute this candidate
as-is. Jan has been asked whether to keep this DEV-only change out of the release;
no answer has been received. Do not infer that version approval answers that
scope question. Preserve the feature on DEV until an explicit scope decision.

Production inventory_loan_requests rules currently permit admin updates, not the
owner-amend route. This is an existing compatibility limit, not a proven new
regression introduced by this version. Do not solve it with an unauthorized
rules deployment. A final scope-adjusted release commit needs its own independent
review and combined test evidence before building.

## Included DEV ancestry

App source before this version/notes-only change:
e3571c17ba60cfcd5ea04ea3aa3e05b84f7e4fb1. It retains released iOS537 source
5c1ea2cba0baea0be131c8f021f07269e936ee0c and the following later DEV merges:

| PR | Scope | Production boundary |
| --- | --- | --- |
| #186 | Annual medical expiry display and candidate reminders | App can use existing explicit dates. Reminder/projection Functions remain separately deployable, not active because of an app build. |
| #187 | Borrower financial-liability acceptance | Unapproved public activation: hold or explicitly isolate after Jan's decision. |
| #188 | Auth-bound document streams and fail-closed old QR handling | No additional production backend deployment needed by this client repair. |
| #189 | Startup, notifications and deep-link ordering | Native cold-start/permission/deep-link acceptance still needed on exact new artifacts. |
| #190 | Mes missions for member suppliers | Production API contract already present. |
| #191 | Mobile-only supplier access and own expense forms | Backoffice access is not required for own mobile missions. |

## Mes missions production compatibility

The shared contract matches the deployed CalyCompta implementation. The API uses
the verified Firebase identity, derives supplier ownership on the server and
rechecks active membership/assignment in the update transaction. An administrator
cannot check off another supplier's mission through an update bypass. Listing
excludes contact and price fields. The admin mirror is read-only.

No extra Functions or rules deployment is required for the core mission list and
status actions. An optional Boutique batch link is kept on the canonical mobile
expense claim; forwarding that link to the legacy mirror needs the separate
Functions mapping and is not claimed as verified live.

Fresh read-only production verification: 5 linked supplier members, 1 open own
mission, 0 cross-owner leaks, 21 read operations, no business writes. This executed
the exact deployed listing implementation, not a real native member login.
Unauthenticated live list requests return 401; GET returns 405.

## Verification already completed on unchanged app source

- Full Flutter suite: 1401 passing, 1 existing skip.
- Release/numbering/workflow/manifest tests: 39 passing.
- Targeted medical/projection/privacy/badge Functions tests: 48 passing.
- Exact live server source against isolated demo emulator: 12 transaction/API
  scenarios plus member-mission/expense-ownership rules checks passed.
- Core startup/auth-provider/mission/navigation analysis: no issues.
- Extended legacy screen analysis has warnings/infos; it is not represented as
  warning-free. Existing missions CI permits informational diagnostics explicitly.

The final commit's release checks and exact independent review must be recorded
in the PR. No existing device check or owner waiver for build 537 is reused for
new artifacts. Native review or an explicit exact-artifact waiver is still needed
before public submission. No real mission check-off, receipt upload or expense
creation is allowed as production QA for this work item.

The detailed external report is kept outside Git at
calymob-missions-release-1101-preflight.md in this chat's visualization directory;
it contains no member identities or contact details.
