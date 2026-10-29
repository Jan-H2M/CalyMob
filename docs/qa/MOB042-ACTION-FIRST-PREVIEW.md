# MOB-042 — action-first local preview

Jan approved the following local Flutter prototype on 29 October 2026:
action/category → action values → packages/pieces → review/confirmation.
It is based on the frozen 534 source, but is **not part of build 534**.

Only `test/qa/boutique_action_first_preview.dart` reaches the new wizard. No
production route, backend, rules, version, lockfile or store configuration is
changed. The entry initializes no Firebase app and uses only a synthetic,
in-memory transport and a fake access reader. Its optional QR entry simulates
the real permanent piece-QR contract without requesting camera permission.

The widget requires an explicitly supplied service and a live guarded Boutique
scope; there is no default production transport. Existing stock-session screens
remain unchanged. Reusing this prototype in a release is a separate decision.

## Behaviour

- Two initial choices: moving/transport or finishing/status.
- Only relevant values are shown before selecting packages. Notes required by
  physical actions and transport recipients/window are validated.
- The current action, source/destination and selected count stay visible.
- Loaded pieces are grouped by order/batch. Group and individual checkboxes,
  search, displayed-list select-all, deselect-all, whole-order lookup and QR are
  supported. Nothing is silently trimmed to fit the 50-piece limit.
- The existing 200-piece list limitation is explicitly labelled. Select-all
  never claims to select unseen pages; whole-order lookup/QR remain available.
- Conservative eligibility hints explain blocked items. These do not replace
  authoritative server rules, linked-order checks, revisions or permissions.
  Unknown plain-stock embroidery requirements deliberately remain blocked.
- Back keeps parameters and selected pieces. Changing the action/source
  revalidates rather than silently applying the earlier selection.
- Review refreshes selected pieces and runs a preview, not an apply. Confirmation
  alone applies. Unknown responses lock edits and reuse the identical action,
  actor, revisions and idempotency key. Role withdrawal disposes the wizard.
- Moving preserves finishing and customer reservation; finishing does not move
  the pieces or automatically notify buyers.

## Verification

Eight new focused VM tests pass. The same tests plus six existing Boutique
files pass in Chrome: **54 passed**. These counts overlap, not 62 unique tests.
Targeted analysis of the three new Dart files reports **No issues found**.
Coverage includes 390×844 layout, back navigation, explicit confirmation,
changed stock, permission withdrawal, duplicate QR and ambiguous-response retry.

The preview is not a physical-device, authenticated live-backend, payment or
real notification acceptance test. No real orders/stock/payments are modified.

Run locally:

```sh
flutter run -d web-server --web-hostname 127.0.0.1 --web-port 7365 \
  --no-pub -t test/qa/boutique_action_first_preview.dart
```

An optional `?ambiguous=1` on the preview URL simulates a lost first apply
response and an idempotent retry; the receipt remains in memory only.
