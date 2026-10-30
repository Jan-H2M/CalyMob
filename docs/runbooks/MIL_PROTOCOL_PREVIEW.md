# FORM-001 — MIL protocol pop-ups in the full CalyMob preview

Reuse the protocol catalogue reader and widgets from MIL-PROT-001. The monitor's
exercise rows open a read-only protocol sheet; the pupil's Mes exercices rows
have a separate info button so evaluation requests and validation details retain
their normal tap actions. Matching uses the exact code and environment, never
a guessed alias or an exercise document ID. Missing codes remain unavailable.

Normal builds read the server-published immutable catalogue via one version
pointer. Database import, access rules and synchronisation remain the other
LIFRAS chat's responsibility; this interface change writes no production data.

For the local preview only, compile with
`--dart-define=CALYMOB_MIL_PREVIEW_SNAPSHOT=true`. The flag is also restricted to
web on HTTP localhost/loopback and cannot activate in native or hosted builds.
The bundled public source snapshot was fetched on 2026-10-11 from
`https://mil.amb-lifras.be/` and parsed with MIL-PROT-001's validated parser:
edition v2026-8, 46 natural and 31 pool protocols. The sheet labels this local
snapshot explicitly. It is the AMB copy, not an official certification or a
production catalogue publication. Member data in this preview remains real.

The current local preview is the complete app, served on localhost:7359. Build
with both the existing `CALYMOB_LIVE_QA_AUTOSTART=true` and the above flag. Do not
change the QA-account helper, authentication, member records or role permissions
to test protocol reading. Close the popup without creating claims or validations.
