# Suunto dive import

## Current implementation (2026-10-23)

Supersedes the earlier analysis-only recommendation for issue #136. CalyMob
now has a pure `SuuntoDiveLogAdapter`, Files JSON intake and a preview that
excludes serials, names, GPS and route geometry. The parser keeps source hash,
timestamp offset, raw non-sensitive recorded values and inferred-unit markers.

The iOS share source lives in `ios/ShareExtension`. Before an iOS archive it
must be added as `CalyMobSuuntoShare` in Xcode, embedded in Runner, assigned
bundle ID/signing, and both Runner and extension must be granted App Group
`group.com.calypso.calymob`. The Flutter host still needs the App Group inbox
bridge enabled for a signed device build. Verify on an iPhone whether Suunto
shares an individual dive as `public.json`; direct Suunto cloud/API sync is
out of scope.

## Privacy contract

GPS is read only in-memory to suggest a nearby existing dive site. The chosen
site id/name may be saved; coordinates, route geometry, device serials, names
and the `Personal` payload are never stored by default.
