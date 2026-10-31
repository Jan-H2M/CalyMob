# Boutique member missions v1 — BTQ-MISSIONS-1031-1935

Shared contract owned by CalyCompta (API) and CalyMob (client). Identical copy in both repos.

* Supplier: `supplierType: external | club_member` (legacy absence means external),
  `memberId` is the canonical `clubs/{clubId}/members/{Firebase Auth uid}` ID.
  `boutique_config.assignment_kind: supply | embroidery` enables Jim's Prêt step.
  Only admins manage this link. Never infer authority from names or client-supplied IDs.
* Endpoint: `POST /api/boutique/member-missions`, JSON, Firebase ID token in
  `Authorization: Bearer …`. No CalyCompta login/session or admin role required for
  member actions. Active membership and active linked supplier are checked on every
  request and again inside the update transaction. No cross-club access.
* `{clubId, action: "list"}` → `{version:1, eligible, missions:[…]}`. Only own open
  assignments; no memberId parameter. Each piece has `id`, `batchId`, `lineKey`,
  `piece`, `article`, `size`, `recipient`, `orderedAt`, `dueAt`, `status`,
  `allowedNext`, `orderLabel`, `assignmentKind`. Dates are ISO strings or null.
* Statuses: `ordered` (Commandée), `in_progress` (En cours), `ready` (Prêt),
  `handed_over` (Remis/Afgeleverd). Supply permits ordered → in_progress →
  handed_over (also directly ordered → handed_over). Embroidery requires
  in_progress → ready → handed_over. Completed pieces disappear from the open list.
* `{clubId, action:"update", batchId, missionId, expectedStatus, nextStatus,
  location?}` → `{version:1, status, replayed}`. Location required for handed_over.
  Stable piece ID + expected status provide concurrency control. A matching repeat
  succeeds without adding stock twice; stale/invalid transitions return 409.
* Updates are transactional: own progress/audit, supplier receipt counters, source
  order status and deterministic physical stock units. Supplier handoff means
  reception by the club, **not delivery to the buyer**. Unembroidered arrivals stay
  not_ready; reception never invents a sale-ready inspection. Existing partial
  receipts retain their units. Changed quantities/variants, unpaid/cancelled orders,
  ambiguous historical receipts and finalized costs fail closed.
* `{clubId, action:"overview"}` → read-only admin view of all member assignments,
  including check-offs and dates in still-open batches. Requires admin + valid
  CalyCompta session. No admin update bypass exists in this API.
* Error JSON: `{ok:false, code, error}`, HTTP 400 invalid input, 401 token,
  403 membership/ownership, 404 missing batch, 409 stale/inconsistent state.
  Direct member Firestore writes remain denied. List responses expose only item,
  recipient name and date, never buyer contact/address, prices or other suppliers.
* Deep link: `calymob://boutique/missions`. Opens Mes missions after login; URL
  carries no identity/authority. CalyMob uses its configured API origin. Local DEV
  uses synthetic Auth/Firestore emulators, never the production-backed ENV=dev app.
* Club-member suppliers never expect supplier invoices. Reimbursement is an
  ordinary receipt-backed expense claim; nullable `boutique_supplier_batch_id` is
  a voluntary per-expense association, unrelated to approval or payment authority.
  `{clubId, action:"expense_orders"}` returns `{version:1, eligible, orders}` with
  only own placed/completed batches (`batchId`, `label`, `orderedAt`), so a receipt
  can still be linked after final Remis. No buyer contact or financial fields.
* Order notification uses the friendly French member template. Preparing,
  cancelling and failed sending never mark ordered; only the existing successful
  provider receipt and matching line fingerprint permit placement. DEV sends none.
* If no preferred handover date is set, the member mail proposes two weeks after
  draft creation and saves that date only after successful sending.
* Backfill is dry-run by default and apply is limited to loopback emulators or an
  dedicated synthetic demo project in the loopback emulators. Exact unique member mapping only;
  ambiguous matches stop the whole operation. No production backfill in this task.

Receipt ownership and expense identity invariants:
* Club-member supplier receipts belong exclusively to the member mission API.
  Aggregate MCP receipt writes are rejected using both the cached batch type and
  the current supplier, rechecked inside the write transaction. Existing mission
  progress also prevents falling back to aggregate receipts after a supplier edit.
* A final handover accounts for received quantities plus historical closed
  shortages; fully accounted short batches and stock purchases become closed_short.
* Supplier invoice guards consult the current supplier, including legacy batches
  without supplierType. Starting email dispatch freezes draft items/supplier identity.
* Optional boutique_supplier_batch_id expense associations must belong to the
  claim requester through the current member supplier. Unlinked ordinary expense
  notes remain valid. Account changes invalidate open mobile expense forms.
* A pending mission deep link waits for member data, any mandatory password
  change, and completed login route replacement before it is consumed.
