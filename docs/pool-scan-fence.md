# Pool-scan fence

The pool-scan fence keeps the entrance QR flow easy to find and difficult to
change accidentally. It does not add a new validation rule or change what a
scanner sees. The callable remains `recordPoolQrAttendance` in
`europe-west1`, with exactly `clubId`, `sessionId`, and `memberId` in its
payload. Callable refusals and the existing French UI messages remain visible
inside the scanner sheet.

## Pinned module

The public entry point is `lib/pool_scan/pool_scan.dart`. The guard pins these
module files:

- `lib/pool_scan/pool_scan.dart`
- `lib/pool_scan/src/attendance_client.dart`
- `lib/pool_scan/src/feedback.dart`

It also pins the public symbols exported by the entry point. Run the guard with:

```sh
node scripts/check-pool-scan-fence.cjs
```

The `Pool scan regressions` workflow runs the guard and the existing client,
widget, lifecycle, Functions, and emulator regressions on pull requests to
`dev`.

## Legitimate extensions

When the pool-scan module intentionally needs a file or public symbol, make the
code change and update the two explicit lists in
`scripts/check-pool-scan-fence.cjs` in the same pull request. Update this
document when the pinned file list changes. Reviewers can then see that the
boundary moved on purpose rather than as a side effect of another change.

`CODEOWNERS` requests review from `@Jan-H2M` for changes under
`lib/pool_scan/`. Branch protection on `dev` is the human half of the fence:
the repository administrator must require the pool-scan regression status
check, a pull-request review including code-owner review, and prevent direct
pushes. This repository change does not modify branch protection itself.
