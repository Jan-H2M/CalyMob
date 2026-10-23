# Suunto dive import

## Current implementation (2026-10-23)

Supersedes the earlier analysis-only recommendation for issue #136. CalyMob
now has a pure `SuuntoDiveLogAdapter`, Files JSON intake, an App Group host
inbox bridge and a preview that
excludes serials, names, GPS and route geometry. The parser keeps source hash,
timestamp offset, raw non-sensitive recorded values and inferred-unit markers.

The iOS share source lives in `ios/ShareExtension`; Runner consumes and deletes
the one-time App Group inbox through `calymob/suunto_share_inbox`. Before an
iOS archive the `CalyMobSuuntoShare` target must be added/embedded in Xcode,
assigned bundle ID/signing, and both Runner and extension must be granted App
Group `group.com.calypso.calymob`. Verify on an iPhone whether Suunto
shares an individual dive as `public.json`; direct Suunto cloud/API sync is
out of scope.

## Privacy contract

GPS is read only in-memory to sort candidates from pluggable `DiveSiteSource`
nearest-first (km). The chosen site id/name may be saved; coordinates, route
geometry, device serials, names and the `Personal` payload are never stored by
default. No global dive-site coordinate collection was confirmed during this
work, so the production site source remains an explicit integration item.

## Storage boundary

Storage Rules can limit owner, path, size and JSON content type, but cannot
inspect JSON to prove that GPS, serials or personal data were stripped. The
current client sanitiser is therefore a privacy best-effort, not a trust
boundary. Before a production rollout, move sanitisation/finalisation to a
trusted server pipeline or prohibit direct raw-source uploads entirely. The
import service uses a deterministic hash-key reservation and best-effort
rollback for failed multi-service saves; emulator tests must be run before any
rules deployment.

## Retention and deletion

The user selects retention at import time. Default retention is until the
Carnet dive is deleted. The detail page offers an owner-only delete action that
first removes the private source/profile objects, then the Carnet entry and
import metadata. Route storage remains off by default; an explicit import-time
opt-in is required before route fields can remain in the filtered source.
