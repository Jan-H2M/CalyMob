# Chat scroll regression — 2026-09-29

Status: merged to `main` through PR #94 on 2026-09-29; included in
1.23.2+216. Android is released to Google Play production; iOS build 216 is
`WAITING_FOR_REVIEW` with French-only App Store metadata.

Related work: MOB-027 cursor-v1 unread state and the 1.23.x rollout.

## Root cause and fix

The April scroll hardening (`64701f59`) ran initial positioning with the first
message snapshot while the pre-open read cursor was still loading. That made
the latest-message fallback win before a `Nouveaux messages` divider existed;
team and session chats had no divider anchor. Cursor-v1 later made the timing
more visible, but is not the originating regression.

The final design waits for both resolved read authority and completed
cursor-v1 bootstrap before capturing the pre-open cursor. In cursor-v1
authority mode that cursor is the canonical per-member Firestore section/scope
cursor, not the device-local rollback mirror; legacy/shadow mode continues to
use the mirror. If no usable cursor exists, it retains the established
install-baseline/latest-message fallback.

The shared index-based anchor starts at the unread divider's proportional list
position, yields a frame for the lazy list to build it, then aligns the divider
with `Scrollable.ensureVisible`; it retries a bounded number of times. Event
discussions, team channels, session chats, and announcement replies all use
this path. The all-read case intentionally opens at the latest message.

The post-send automatic scroll introduced by `0009fc3e` is superseded: sending
a reply no longer forces the list to its maximum extent. Flutter's list retains
the reader's current context after the stream adds the new item.

> **Superseded (2026-09-29):** The earlier statement that this issue had no
> release/store work was correct when written. Jan subsequently approved an
> internal-only TestFlight candidate, 1.23.2+216. That limited approval has in
> turn been superseded by Jan’s explicit production approval below. It did not
> and does not authorize a Firebase app-version publication or any
> production-data change.

## Internal TestFlight execution — 1.23.2+216

On 2026-09-29, the candidate was built from merged `main` commit
`0561f699d9bbc089d0f610b340e9e7a501e8fd58` (PR #95). The signed IPA was
uploaded through the guarded `ios deploy` lane under Jan's approval, “Jan
29/9 12:47: TestFlight internal only”. No App Store review submission,
external tester assignment, Android/Google Play upload, Firebase app-version
publication, rules deployment, or production-data change was made.

App Store Connect subsequently reported build `1.23.2 (216)` as `VALID` with
`IN_BETA_TESTING`. Jan is an internal beta tester and the **CalyMob Testing
team** has automatic access to all builds, so the build is available to him
for internal testing.

> **Superseded (2026-09-29):** “TestFlight internal only” was the correct
> approval and execution scope at 12:47. Jan later approved production release
> at 13:42; the record is retained for audit history.

## Production execution — 1.23.2+216

Jan approved the public store scope at 13:42 with the exact evidence:
**“Jan 29/9 13:42: production iOS + Android”.** This approval applies to the
already-reviewed release source `0561f699d9bbc089d0f610b340e9e7a501e8fd58`.

### Android — completed

The signed AAB was verified as `versionName 1.23.2` / `versionCode 216` before
upload. Google Play production accepted versionCode **216** and the production
track readback reports status **`completed`**. The edit was committed at full
rollout (`1.0`); Google’s API represents a completed release with a null
`userFraction`.

Google Play currently has only an **`fr-FR`** store-listing language. Therefore
only the approved French release note was sent; no `nl-NL` Play listing or
release-note localization was created.

### iOS — blocked, left intact

The existing TestFlight build `1.23.2 (216)` was selected for an App Store
submission attempt. Fastlane `deliver` created the `nl-NL` App Store
localization and uploaded its release note, but App Store Connect rejected the
review request because that localization has no required **description**,
**keywords**, or **support URL**. The version remains
**`PREPARE_FOR_SUBMISSION`**.

Do not delete the `nl-NL` localization or invent Dutch metadata. Submission is
pending Jan’s decision on those three localized values. No new IPA was built or
uploaded, and no Firebase app-version publication, rules deployment, boutique
setting, or production-data change was made.

> **Superseded (2026-09-29 14:53):** Jan chose French-only App Store metadata
> (Option B): “Schrap de Nederlandse pagina en stuur de app opnieuw naar Apple,
> alleen in het Frans.” The `nl-NL` *version* localization was deleted through
> App Store Connect, leaving only `fr-FR`. The repository copy under
> `ios/fastlane/metadata/nl-NL` is removed so a future `deliver` submit cannot
> recreate it.

The prior Dutch release-note text is retained here for audit only; it is not
App Store metadata and must not be uploaded by `deliver`:

> Gesprekken openen nu bij het eerste ongelezen bericht. Na het versturen van
> een antwoord blijft u op uw huidige leespositie.

> **Superseded (2026-09-29):** The earlier iOS state
> `PREPARE_FOR_SUBMISSION` and its “do not delete” instruction were accurate
> before Jan chose Option B. The `nl-NL` version localization has now been
> deleted with Jan’s explicit approval.

### iOS — French-only resubmission completed

The French-only Fastlane metadata change was merged through PR #98. To preserve
the already-uploaded IPA’s exact source/artifact provenance, the guarded submit
ran from the clean build-216 source worktree with `DELIVER_METADATA_PATH` set
to an external directory containing only `fr-FR/release_notes.txt`; it cannot
discover or recreate an `nl-NL` metadata page.

Fastlane selected the existing build `1.23.2 (216)` and submitted it with
automatic release after approval—no new binary was built or uploaded. App Store
Connect readback reports version `1.23.2` as **`WAITING_FOR_REVIEW`**, with
attached build **216** and exactly one version localization: **`fr-FR`**.
