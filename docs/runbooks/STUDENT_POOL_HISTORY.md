# FORM-001 — Student pool history

The instructor entry is Avancement des élèves, with Élèves and Actions en attente tabs. Members without instructor access retain their personal Actions & évaluations entry. Action filters, history, confirmations and evaluations reuse the existing implementation.

Student dossiers separate Milieu naturel (including explicitly labelled theory), Piscine, Expériences brevet, Objectifs and Observations. Piscine shows actual attendance, saved hourly group reports, exact course assignments, lesson themes, instructors and session-linked remarks. Planned assignments alone are not attendance or validation. QR attendance never increments official LIFRAS validation counts.

The full dossier header uses one compact line: Épreuves (validated/required), Théorie, Piscine and Exp. Completed requirements use a green check, incomplete ones a red cross; pending validations use an amber hourglass and unknown data a question mark. Tapping each item reveals its full explanation, also available to screen readers. Pending validations never count as completed. Exams use explicit exam codes or exam-labelled pool/theory entries, not pool attendance or ordinary training. Missing exam data is unknown, not passed or waived. Experience is sufficient only when every positive configured requirement is met with known data; the aggregate percentage alone is not proof. Detailed dive totals/depths remain in Expériences brevet. The redundant Progression par volet summary is removed.

The Observations tab has an add button even when empty. Full monitors create an auditable general formation note; pool-only instructors stay limited to pool notes. Neither note type adds exercise/result fields. Read failures are shown as unavailable, not as an empty history.

The unconnected Préparer la prochaine séance button is removed from the natural-water tab; it previously only returned an ignored navigation result. Pool remark buttons remain functional and unchanged.

When QR rows have no saved group report, history mirrors the web planner's automatic formation placement using the current active formation profile (NB→1★, 1★→2★, 2★→3★, etc.). This fallback is explicitly labelled as current-profile placement and planning content, not historical validation. Saved reports and session overrides win. Only a unique course in the appropriate hour, or an unambiguous parent-monitor match, supplies the lesson; parallel courses are never selected arbitrarily. No historical records are backfilled.

The read-only history queries only the requested member under the specified club, handles legacy identity fields and duplicate QR documents, and has no 30-day cutoff. Missing group/theme/date information is displayed honestly rather than reconstructed by selecting an arbitrary parallel course. Current planner information is a fallback when no saved theme exists.

Historical remarks store the session ID and date independently from observer ID and trusted server creation/update timestamps. They contain no exercise/result fields. Pool-only access stays isolated from career, theory and MIL dossier data. The narrowly scoped rule update for historical free-text pool remarks must be published separately with Jan's approval; local preview as an authorised Moniteur Club uses the existing monitor permission. No production backfill, attendance changes or student comments are made for QA.

Verification: targeted Flutter model/service/widget tests, existing action/navigation tests, emulator script scripts/test-pool-formation-remarks-rules.cjs, targeted analyzer and full web build. Use the existing secure local QA preview on localhost:7359 with real Firebase identity; test new comment dialogs by cancelling, not submitting on real pupils.
