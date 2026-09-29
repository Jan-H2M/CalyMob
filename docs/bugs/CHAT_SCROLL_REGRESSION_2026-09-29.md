# Chat scroll regression — 2026-09-29

Status: merged to `main` through PR #94 on 2026-09-29; included in the
1.23.2+216 internal-TestFlight candidate. Public-store submission remains a
separate approval.

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
> internal-only TestFlight candidate, 1.23.2+216. It does not authorize public
> App Store submission, Google Play upload, a Firebase app-version publication,
> or any production-data change.
