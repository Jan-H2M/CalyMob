# Internal 1.27.1 (534): every current En cours ticket

Jan explicitly approved internal iOS Xcode Cloud/TestFlight and local Android
test delivery, then asked to include all En cours tickets where possible. The
live board contains the following 14 tickets on 29 October 2026. Scope is not
inferred from the board status alone: the actual combined source and tests are
checked. None of these rows authorizes public release or production writes.

All 13 app-related rows below are retained in the exact combined 534 candidate;
COM-145 is a separate web/synchronization item, not a mobile feature. Inclusion
does not mean that a server/rules dependency is deployed or native acceptance
has happened. The underlying fixes and their exact independent reviews are
documented in the inherited 533 record and `JOINT-FOLLOWUP-20261029.md`.

| Ticket | Included app scope | Regression selection / remaining boundary |
| --- | --- | --- |
| MOB-033 | Instructor/student formation overview, limited pool reader and shared roster | `pool_formation_overview_reader`, `formation_task_roster_service`, `formation_task_roster`; native role acceptance remains separate. |
| MOB-036 | Planned apnée roster, stable names, timeout and retry | `pool_apnee_overview`; planned entries are not attendance or validation. |
| MOB-038 | Badge destinations reachable with closed/past filters and retry | `activity_provider_retry`, `unread_count_provider_cursor`, `operations_filter_bar`, `operations_list_filter`; production badge/data repair is not claimed. |
| MOB-040 | Stable inbox/cache, retry and strict identity gate | `retained_stream_loader`, `communication_identity_gate`; no real message is marked read by QA. |
| MOB-041 | Multiple successive screenshots, retained draft, upload rollback and duplicate-submit guard | `bug_report_form`, `bug_report_screenshot_upload`; real camera/Storage/native capture acceptance remains separate. |
| MOB-042 | Scan/whole-order selection before an explicit action, separate place/finish, visible navigation and both platform-back paths | `boutique_management_navigation`, `boutique_stock_selection_flow`, access/lifecycle tests plus 28 genuine local stock/order emulator cases. The already targeted deployed order-read handler is preserved; authenticated live acceptance remains open. |
| MOB-043 | Silent simulation selection, complete persisted unassigned roster and clearly labelled simulation PDF | `palanquee_simulation_persistence`; paired canonical preserve-roster rules remain a separately approved rollout. No real inscription or notification. |
| MOB-044 | Trusted paid/review presentation; unprotected inline aliases ignored | Both participant payment-status test files; the paired canonical creation-guard rules are not deployed by this test delivery. |
| MOB-045 | Event date distinct from registration deadline | `operation_detail_unregister`; no real date changed. |
| MOB-046 | Separate sea/lake/quarry location categories with broad legacy fallback | `dive_environment`; no historical location reclassification. |
| MOB-048 | Students with existing visible attention badges first, filters and limited pool reader retained | `formation_list_attention_order`; no extra full-member queries or notification reset. |
| COM-146 | Current limited directory stream, stale contact removal and upstream phone aliases | `directory_contact_actions`, `profile_service_directory_stream`, `member_profile_contact_privacy`; preserve the current legacy preference contract, not the superseded opt-in branch. No consent backfill. |
| COM-147 | Actionable tariff errors and guest opt-in for every caller, including event staff | `free_guest_registration_flow`, `event_registration_error` plus server regressions; paired production guest-policy rollout remains outstanding. A missing real activity guest price is not guessed. |
| COM-145 | Not included: Organon read-only reports and comparison/approval UI are separate web work | Existing reviewed weekly reader retained outside this mobile task. No helper activation, TLS change, import or member/brevet/medical write. |

Also preserved: the existing €72 + €6.62 supplement design and current-payment
panel. Only €6.62 receives the current QR; a reported original transfer is not a
bank receipt. Full live acceptance still needs the separately approved paired
backend/rules rollout. COM-075 birthday privacy, already at Vérifier, is retained
as well; it is not dropped merely because this list filters En cours.

MOB-047 and MOB-049 are still Analyse and not silently expanded: the former
lacks the affected MF screen/field; the latter is a shared catalogue correction
requiring its own specific production-data approval. COM-144's original auth
failure remains diagnostically unproved. No unrelated fix is invented to close
the board.

The Xcode Cloud pre-clone test selection now covers all these mobile regression
paths in addition to its existing configuration/import checks. The local
selection is executed before commit; the exact final source is independently
reviewed again. The Cloud worker must independently pass its tests and native
actions. TestFlight is considered available only after processing **and** the
actual existing internal group association are read back; a successful archive
alone is not a delivered test build.

Local pre-commit result: the exact 38-file Cloud selection passed **262/262**
Flutter tests in 12 seconds (no failures/skips). Release-tooling/security checks
passed **30/30**; shell syntax and diff checks passed. These counts overlap
earlier targeted runs and are not added together as a unique-test total.
