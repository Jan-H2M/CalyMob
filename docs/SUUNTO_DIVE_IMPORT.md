# Suunto dive import

## Current implementation (2026-10-23)

Supersedes the earlier analysis-only recommendation for issue #136. CalyMob
now has a pure `SuuntoDiveLogAdapter`, Files intake for supported dive-log
inbox bridge and a preview that
excludes serials, names, GPS and route geometry. The parser keeps source hash,
timestamp offset, raw non-sensitive recorded values and inferred-unit markers.

The iOS share source lives in `ios/ShareExtension`; Runner consumes and deletes
the one-time App Group inbox through `calymob/suunto_share_inbox`. Before an
iOS project wiring embeds the `CalyMobSuuntoShare` target. Before an archive,
the Apple team must assign its production bundle ID/signing and enable the App
Group `group.com.calypso.calymob` for both targets; no signing material is in
this repository. The extension accepts JSON, FIT, ZIP/FIT, UDDF/XML and SSRF
advertised as `public.data`, then the Dart registry validates/sniffs content.
Verify on an iPhone whether Suunto shares an individual dive as a supported
file type; direct Suunto cloud/API sync is out of scope.

## Privacy contract

GPS is read only in-memory to sort candidates from pluggable `DiveSiteSource`
nearest-first (km). The chosen site id/name may be saved; coordinates, route
geometry, device serials, names and the `Personal` payload are never stored by
default. The candidate source reads `clubs/calypso/dive_locations` first
(excluding merged locations) and augments it with
`clubs/calypso/reference_dive_sites`; it must be verified against emulator
rules before release.

## Storage boundary

**Superseded storage proposal:** client-side sanitisation plus owner-scoped
Storage Rules is not a privacy boundary. Rules can limit owner, path, size and
content type, but cannot inspect JSON to prove that GPS, serials or personal
data were stripped. The import service uses a deterministic hash-key
reservation and best-effort rollback for failed multi-service saves; emulator
tests must be run before any rules deployment.

For v1, **no raw vendor source is retained**, including Suunto JSON: only a
normalised profile is stored. Owner-scoped JSON Storage Rules cannot inspect
content, so client filtering is not a privacy guarantee. A trusted server-side
sanitisation/finalisation service is a real pre-release blocker before raw-file
retention, regardless of vendor.

## Retention and deletion

The user selects retention at import time. Default retention is until the
Carnet dive is deleted. The detail page offers an owner-only delete action that
first removes the private source/profile objects, then the Carnet entry and
import metadata. Route storage remains off by default; an explicit import-time
opt-in is required before route fields can remain in the filtered source.

## Parser registry and licenses

The import registry sniffs content as well as checking filename extensions.
Suunto JSON and UDDF are pure in-tree parsers. Garmin FIT/ZIP support uses
`dart_fit_decoder` 0.1.0, a pure-Dart package under the MIT License (per its
published package metadata); no Garmin cloud/API access, GPL code, Subsurface
code or `libdivecomputer` is linked. The dependency must be reviewed again at
upgrade time. Files picker and iOS registration accept JSON, FIT, ZIP, UDDF,
XML and SSRF; the native share handoff still validates final bytes in Dart.
Subsurface support is a new, independently-written XML reader only: binary
`.ssrf` exports receive an actionable XML-export prompt. No GPL Subsurface
source and no `libdivecomputer` library is copied or linked.
