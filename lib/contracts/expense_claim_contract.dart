/// Single source of truth for the expense-claim status vocabulary on the
/// Flutter side.
///
/// Vendored mirror of `CalyCompta/src/contracts/expenseClaimContract.json`
/// (the canonical contract) — keep in sync. Legacy = `demandes_remboursement`
/// (French statuses) <-> canonical = `expense_claims` (English statuses).
///
/// Step 1 of the legacy-removal migration: centralise the status vocabulary so
/// it can no longer drift between web, Cloud Functions, scripts and Flutter.
/// (The app still reads/writes legacy `statut` today; the switch to canonical
/// happens in a later step.)
library expense_claim_contract;

/// Legacy status -> canonical status. Bijective.
const Map<String, String> legacyToCanonicalStatusMap = <String, String>{
  'brouillon': 'draft',
  'soumis': 'submitted',
  'en_attente_validation': 'pending_approval',
  'approuve': 'approved',
  'cree_banque_attente_validation': 'payment_created_pending_validation',
  'paiement_effectue': 'payment_sent',
  'a_verifier_paiement': 'payment_verification_pending',
  'rembourse': 'reimbursed',
  'refuse': 'rejected',
};

/// Canonical status -> legacy status (derived inverse of the map above).
final Map<String, String> canonicalToLegacyStatusMap = <String, String>{
  for (final MapEntry<String, String> e in legacyToCanonicalStatusMap.entries)
    e.value: e.key,
};

/// Map a legacy status to its canonical value; unknown values pass through.
String legacyToCanonicalStatus(String status) =>
    legacyToCanonicalStatusMap[status] ?? status;

/// Map a canonical status to its legacy value; unknown values pass through.
String canonicalToLegacyStatus(String status) =>
    canonicalToLegacyStatusMap[status] ?? status;
