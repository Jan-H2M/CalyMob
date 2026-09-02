# COM-076 — wachtlijst bij duikevents

Canoniek dossier: `CalyCompta/docs/bugs/COM-076.md`.

- Codecommit: `ab77cdf`
- Branch: `codex/bug-COM-076-waitlist`
- FIFO-positie wordt aan het wachtende lid getoond.
- Afmelding en automatische promotie gebeuren samen in callable `unregisterFromEvent`.
- Function-tests: 27/27 suites en 172/172 tests groen.
- Gerichte Flutter-tests: 2/2 groen.
- Geen build, upload, store-inzending of deployment uitgevoerd.
- Harde releasevolgorde: eerst de nieuwe callable deployen en verifiëren, pas daarna de mobiele build distribueren.
