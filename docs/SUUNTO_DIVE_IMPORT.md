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
