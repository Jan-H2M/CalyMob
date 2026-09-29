# Chat scroll regression — 2026-09-29

Status: fixed locally; pending independent review and merge.

Related work: MOB-027 cursor-v1 unread state and the 1.23.x rollout.

## Root cause and fix

The April scroll hardening (`64701f59`) ran initial positioning with the first
message snapshot while the pre-open read cursor was still loading. That made
the latest-message fallback win before a `Nouveaux messages` divider existed;
team and session chats had no divider anchor. Cursor-v1 later made the timing
more visible, but is not the originating regression.

The fix captures the pre-open cursor before acknowledging visible content,
waits for it before the one initial positioning pass, and anchors the list at
the first message strictly after that cursor. In cursor-v1 authority mode this
is the canonical per-member Firestore cursor, not the device-local rollback
mirror; legacy/shadow mode continues to use that local mirror. If no usable
cursor exists, it keeps the established install-baseline/latest-message
fallback. Event discussions, team channels, session chats, and announcement
replies use the same tested index helper.

The post-send automatic scroll introduced by `0009fc3e` is superseded: sending
a reply no longer forces the list to its maximum extent. Flutter's list retains
the reader's current context after the stream adds the new item.

No production data, feature flags, Firebase rules, Cloud Functions, release,
or store changes are part of this issue.
