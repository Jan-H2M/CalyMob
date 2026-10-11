# FORM-001 — Student pool history

The instructor entry is Avancement des élèves, with Élèves and Actions en attente tabs. Members without instructor access retain their personal Actions & évaluations entry. Action filters, history, confirmations and evaluations reuse the existing implementation.

Student dossiers separate Milieu naturel (including explicitly labelled theory), Piscine, Expériences brevet, Objectifs and Observations. Piscine shows actual attendance, saved hourly group reports, exact course assignments, lesson themes, instructors and session-linked remarks. Planned assignments alone are not attendance or validation. QR attendance never increments official LIFRAS validation counts.

The read-only history queries only the requested member under the specified club, handles legacy identity fields and duplicate QR documents, and has no 30-day cutoff. Missing group/theme/date information is displayed honestly rather than reconstructed by selecting an arbitrary parallel course. Current planner information is a fallback when no saved theme exists.

Historical remarks store the session ID and date independently from observer ID and trusted server creation/update timestamps. They contain no exercise/result fields. Pool-only access stays isolated from career, theory and MIL dossier data. The narrowly scoped rule update for historical free-text pool remarks must be published separately with Jan's approval; local preview as an authorised Moniteur Club uses the existing monitor permission. No production backfill, attendance changes or student comments are made for QA.

Verification: targeted Flutter model/service/widget tests, existing action/navigation tests, emulator script scripts/test-pool-formation-remarks-rules.cjs, targeted analyzer and full web build. Use the existing secure local QA preview on localhost:7359 with real Firebase identity; test new comment dialogs by cancelling, not submitting on real pupils.
