# DEV-ISOLATION-001 — CalyMob client lab

This is a **local, credentialless client-verification target**, not a second
production Firebase project or a copy of CalyCompta. It deliberately has **no
backend**. It does not validate callable authorization, security rules, bank
settlement, real registrations, or native phone integrations.

It runs the merged MOB-048 formation list with injected fictional loaders,
MOB-044's actual participant/registration payment parser using an immutable
in-memory document fixture (no SDK platform mock),
and COM-147's actual error formatter with fabricated exceptions. The ordinary
app entrypoint, Firebase options, authentication and notification bootstrap are
not started. Formation dossier navigation is disabled. There is no QR, IBAN,
payment confirmation or reporter contact action.

## Build and start on the Mini

Use a clean checkout of `dev` containing this change. Locked Flutter packages
and the Flutter web SDK must already be cached (otherwise stop; the script does
not fetch new credentials or production configuration).

```sh
node scripts/isolated-dev/build.mjs /Users/jan/flutter/bin/flutter
node scripts/isolated-dev/server.mjs
```

Open **http://127.0.0.1:7375/** in a separate DEV browser tab. No login is needed.
`/__dev/health` reports the exact source commit, artifact hash and fictional-only
contract. Stop with Ctrl-C; restart with the same server command. Reset scenarios
using the restart icon or reload. Nothing is saved in a database or browser
storage. After changing commits, rebuild: the server refuses stale/dirty builds.

The build uses an allowlisted child environment and a fresh temporary HOME, not
the user's cloud configuration. No `.env`, service account or production token
is loaded. Local packages are reused, not a data export. A separate HTML shell
replaces the normal external-CDN shell. Flutter resources, Roboto and the
OFL-licensed Noto Emoji font are bundled locally; no font-CDN exception is made;
service workers are not served.

The server binds only `127.0.0.1:7375`; there is no LAN/public listener, port
fallback, remote host option, API proxy or cloud deployment. It rejects foreign
Host/Origin, non-GET/HEAD methods, dotfiles, symlinks and traversal. Its CSP blocks
all cross-origin connections, scripts, fonts and images (including Firebase,
Sentry, mail/payment APIs and CDNs). Build hashes and source are rechecked before
serving. Do not host this lab on the existing production-backed Vercel project.

## Manual checks

1. **MOB-048 · Élèves**: Bert, Yves and Zoé appear before Aaron. Search and P2
   filtering still work. In pool-only scope Yves comes first; full dossiers
   remain inaccessible.
2. **MOB-044 · Paiements**: start `unpaid`. Each untrusted alias set to `paid`
   must leave the result **À payer**. `review` stays **Vérification bancaire**;
   only the fictional canonical `paid` state shows paid. No payment is made.
3. **COM-147 · Inscriptions**: simulate missing tariff: a useful French remedy
   appears without a technical stack. An ambiguous connection asks to check
   existing registrations before retrying. No registration request is sent.

4. **MOB-045 · Dates**: the production date-header widget shows the fictional
   8 November event separately from its default 7 November registration deadline.
   Toggle an explicit 6 November deadline and a frozen post-deadline clock. The
   event date stays unchanged and only the registration status becomes closed.
   No registration or event is read or written.
5. **MOB-046 · Milieux**: the production grouped-location layout separates Mer,
   Lac and Carrière. Filtering Mer hides the other fictitious sites. The legacy
   fresh-water fixture stays Eau douce; no historical site is recategorized.
6. **MOB-033 · Formation**: real instructor rows show done/pending/remaining
   progress by career/pool/theory from two fictional snapshots. A goal is not a
   validation. Simulated read error uses the real Retry button. Pool-only uses
   the restricted DTO reader with an in-memory invoker; no full profile/snapshot
   reader or actual callable is used. Row navigation is disabled, not scrolling
   or retries. This is not a server-role authorization test.
7. **MOB-036 · Apnée**: the actual pool widget renders two fictional planned
   A1/A2 rosters. Try directory failure/retry, changed identities, an empty plan,
   an eight-second name timeout and a planning error/reload. These are local
   streams only, never real sessions, attendance, QR checks or validation.
   The scenario chooser is compact so adding cases does not hide the controls
   on narrow screens. This menu exists only in the standalone test target.

8. **MOB-051 · Virement bancaire**: open the real registration payment choices
   for an email-only transfer, then the actual member transfer card. Copy the
   fictional account, 6.62 amount and installment communication. The fixture
   `FICTIF-NON-PAYABLE` is not an IBAN and must never be used for payment;
   local QR rendering alone is not validation by a bank. There is no
   email handler, bank-app launcher or confirmation action in this scenario.
   These clipboard actions never mark a registration/order paid.

## Automated verification

```sh
node --test scripts/isolated-dev/server.test.mjs
flutter test test/dev/isolated_dev_test.dart
flutter test --platform chrome test/dev/isolated_dev_test.dart
node scripts/isolated-dev/smoke.mjs
```

The smoke command uses pinned `playwright-core@1.62.1` (no browser download).
CI installs that test-only package with lifecycle scripts disabled into ignored
`.dart_tool/isolated-dev`; no production/runtime dependencies or lockfiles change.
An existing trusted installation may be selected with
`ISOLATED_DEV_PLAYWRIGHT_ROOT=/absolute/path/to/playwright-core`.

The dedicated PR workflow also runs the existing three fixes' targeted tests and
builds this exact standalone web target. The smoke command requires the built
artifact and free port7375: it starts a temporary loopback server and renders all
release-compiled scenarios in fresh Chrome profiles with remote DNS/proxy
traffic disabled. It closes its server afterward. This catches release-only
differences that debug widget tests cannot prove. Green CI and the independent exact-commit
review precede DEV merge. The local lab is built again from the actual merged
DEV commit before delivery. No changes to protected release PR #166 or security
patches are included.

A future shared backend DEV environment requires its own isolated project,
synthetic seed and safe outbound transports. This lab must never be used to claim
that broader integration or production acceptance has passed.
