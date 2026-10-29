# Offline DEV fonts

Noto Emoji is copied unchanged from the official Google Fonts repository,
commit `6157dfaa640ca5738b4d1a7070fe389c3036d7fc`,
`ofl/notoemoji/NotoEmoji[wght].ttf`, under the accompanying SIL OFL license.
Source: https://github.com/google/fonts/tree/6157dfaa640ca5738b4d1a7070fe389c3036d7fc/ofl/notoemoji

The build also copies Roboto Regular and its license from the pinned local
Flutter SDK's `bin/cache/artifacts/material_fonts` directory. No runtime font
CDN is permitted. These files are copied only into the separate DEV output,
never added to the normal application asset manifest.
