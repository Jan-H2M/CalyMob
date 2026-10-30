# MOB-043 — complete planning roster and honest PDF labels

Local repair on 28 October 2026, reusing the existing MOB-043 worktree.

- Assignment documents store `simulation_participants` independently of groups,
  so an unassigned member or a member removed from the last group survives a
  successful save and reopening. The normal service uses the model serializer.
- Older group-only documents still restore their planning snapshots. Real
  operation registrations take precedence and duplicate IDs are not added.
- The full roster is only planning data in the assignment document. No event
  registration, attendance, official level, payment, email or push is created.
- PDF rows distinguish `Inscrit`, `Invité` and `Simulation`; simulations have
  no claimed payment status. Mixed roster headings and continuation counts do
  not call everyone registered. Rendering is separately testable without reads.

Green: 19 focused model, real service/fake Firestore, actual widget-save/reload,
selection and LIFRAS tests. Pure storage/helper/test analysis reports no issues.
The broader existing screen/PDF analyzer retains historical warnings/info; it
is not described as fully green. No new dependency or lockfile change.
Initial test harness issues (Finder API, confirmation dialog, fake FieldValue
initialization) were corrected before the final green run. Editable group state
now copies the loaded list, including immutable test/service snapshots.

An actual synthetic PDF was generated, extracted with pdftotext and rendered
with Poppler; its visible table clearly distinguishes simulation from real
registration and has no clipping. No real member or contact data was used.

Local source only. Independent exact-commit review and the consolidated tests
remain required. No push, merge to shared branches, deployment, app build/upload,
Firebase login or real data mutation.

## DEV restoration — 30 October 2026 (1030U)

Reapplied the original `be2bfde` implementation already shipped in public iOS
1.27.1 (535), source `eb33add9`, onto current DEV `8afc0e3`. This is a
source-restoration PR, not a new store release or a production data repair.
The existing DEV operation-date UI is retained by the three-way application.

Fresh local checks: all 9 focused persistence/selection tests pass, including
the actual service with fake Firestore, save/reopen without assigned groups,
legacy snapshots and PDF generation. Targeted analysis has zero errors;
the existing screen/PDF debt remains (8 warnings and 28 informational lints),
so it is not described as warning-free. No dependencies or lockfiles changed.

`Palanquee persistence` CI now runs these regression tests for relevant DEV PRs
and DEV pushes, with fictional data only. Independent exact-commit review and
remote CI are separate evidence to record after committing. No notification,
registration, payment, production write or distribution build is performed.
