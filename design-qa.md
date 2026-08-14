# COM-059 — retour matériel design QA

## Comparison target

- Source visual truth: `/var/folders/j2/qrmfqr1x2kxcz7y2m51vhm7m0000gn/T/codex-clipboard-e1061839-6f57-4766-87ea-9fbed71f3390.png` and `/var/folders/j2/qrmfqr1x2kxcz7y2m51vhm7m0000gn/T/codex-clipboard-2c749a98-1e8a-482a-bc51-3082df0b4ac4.png`.
- Implementation: `http://127.0.0.1:8805/`, Flutter entry point `lib/mockup_main.dart`.
- Source state: the former single-member return control and its automatic `20 EUR` / `40 EUR` deduction choices.
- Implementation state: return-list view (three member dossiers), then Alice's damaged-item control.

The source captures are 767×780 px. The in-app-browser implementation capture is 1280×720 CSS px. The screen remains a single-column flow at both widths; the different viewport is noted because the source only covers the old, shorter control state.

## Full-view comparison

The blue ocean background, white rounded cards, tab treatment, French labels, Material icon weight, and hierarchy from the existing Flutter mock-up are retained. The member selector is deliberately replaced by the requested list of members with an avatar, loan number, due date, article count, and actionable status. This is an intentional information-architecture change, not visual drift.

## Focused incident comparison

The former status menu showed automatic deductions directly in the labels. The implemented `Endommagé` state now opens a separate proposed-retention choice (`Aucune`, repair fee, replacement part, or manual amount), followed by a mandatory comment and photo control. The `Manquant` state explicitly displays no automatic deduction, blocks reimbursement, and requires escalation to CaliConta. These changes match the specified flow.

## Fidelity surfaces

- **Fonts and typography:** Existing Flutter text hierarchy is preserved: strong navy identity/inventory labels, readable 16 px member names, and subdued supporting dates/descriptions. No clipping observed in the list or damaged-item state.
- **Spacing and layout rhythm:** 16 px page gutters, 12 px card gaps, and 14 px card padding preserve the existing rhythm. The incident controls are grouped beneath the affected article, avoiding ambiguity about which item owns the note/photo.
- **Colors and tokens:** Existing ocean gradient, navy/blue brand colors, white cards, green success, orange damage, and deep-orange missing-item states are used consistently. Disabled escalation state is visually distinct.
- **Image quality and asset fidelity:** The mock-up has no real member-photo data. Initials remain the established fallback avatar; production should bind the circle to the member profile photo and use initials only when no photo exists.
- **Copy and content:** French labels are specific about responsibility: a proposed retention is traceable, and missing material needs a decision by the material manager. No automatic compensation is implied.
- **Interactions:** Tested return-tab navigation, member-card opening, item-state selection, damage controls, comment/photo requirement, material-history disclosure, and the missing-item reimbursement hold. Buttons and dropdowns respond correctly.

## Findings

No actionable P0, P1, or P2 visual defects were found in the tested states.

Expected production work outside this local mock-up:

- Bind the avatar to the member profile photo.
- Persist the comment, photo URL, condition, maintenance case, and escalation as item-level history.
- Render that immutable history and repair closure in CaliConta.

## Implementation checklist

- [x] Replace member selector with a member return list.
- [x] Show loan number, due date, article count, and status per member.
- [x] Keep `Complet et en bon état` as a direct state.
- [x] Add preset and manual retention for `Endommagé`.
- [x] Require a comment and photo for damaged/missing items.
- [x] Block automatic compensation for `Manquant` and introduce escalation.
- [x] Surface item-level history and maintenance follow-up intent.

## Comparison history

1. Initial comparison: source had a single selector and fixed automatic deductions; the requested list, evidence, escalation, and history states were absent.
2. Fixes: implemented the member-list entry screen, per-item incident controls, evidence requirement, manual/preset retention, escalation, and history summary. Updated the tab count to `Retours 3`.
3. Post-fix comparison: the revised screenshots show the requested member-list and item-specific incident controls with no clipping or contradictory reimbursement state.

final result: passed
