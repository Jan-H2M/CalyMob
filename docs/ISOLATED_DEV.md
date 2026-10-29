# DEV-ISOLATION-001 — CalyMob client lab

This is a **local, credentialless client-verification target**, not a second
production Firebase project or a copy of CalyCompta. It deliberately has **no
backend**. It does not validate callable authorization, security rules, bank
settlement, real registrations, or native phone integrations.

It runs the merged MOB-048 formation list with injected fictional loaders,
MOB-044's actual participant/registration payment model using an in-memory fake,
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

## Automated verification

```sh
node --test scripts/isolated-dev/server.test.mjs
flutter test test/dev/isolated_dev_test.dart
flutter test --platform chrome test/dev/isolated_dev_test.dart
```

The dedicated PR workflow also runs the existing three fixes' targeted tests and
builds this exact standalone web target. Green CI and the independent exact-commit
review precede DEV merge. The local lab is built again from the actual merged
DEV commit before delivery. No changes to protected release PR #166 or security
patches are included.

A future shared backend DEV environment requires its own isolated project,
synthetic seed and safe outbound transports. This lab must never be used to claim
that broader integration or production acceptance has passed.
