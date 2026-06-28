/**
 * Cloud Function: keep the canonical `expense_claims` collection in sync with
 * the legacy `demandes_remboursement` collection.
 *
 * Triggers on: clubs/{clubId}/demandes_remboursement/{demandeId} (any write)
 *
 * Background:
 *   Reimbursement requests historically live in TWO collections with different
 *   schemas: the legacy `demandes_remboursement` (French field names) and the
 *   canonical `expense_claims` (English field names). The web app (CalyCompta)
 *   reads ONLY the canonical collection, while CalyMob writes ONLY the legacy
 *   one. Canonical is, by design, a pure projection of legacy (see
 *   CalyCompta/src/services/expenseClaimGateway.ts -> normalizeCanonicalExpenseClaimPayload
 *   and syncCanonicalExpenseClaimFromLegacy).
 *
 *   Until now that projection was maintained partly by hand (a backfill script),
 *   which let some legacy docs slip through without a canonical mirror -> they
 *   stayed invisible in the web app. This function makes the projection
 *   automatic and server-side: every legacy write/delete is reflected in
 *   canonical, with the same id.
 *
 * Loop-safety: triggers ONLY on the legacy collection and writes ONLY to the
 * canonical collection. It never writes legacy, so it can never re-trigger
 * itself. Writes are full overwrites (idempotent), matching the gateway's
 * setDoc(canonicalRef, normalizeCanonicalExpenseClaimPayload(legacy)) semantics.
 *
 * Uses Firebase Functions v2 API (Gen2).
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const LEGACY_TO_CANONICAL_STATUS = {
  brouillon: 'draft',
  soumis: 'submitted',
  en_attente_validation: 'pending_approval',
  approuve: 'approved',
  cree_banque_attente_validation: 'payment_created_pending_validation',
  paiement_effectue: 'payment_sent',
  rembourse: 'reimbursed',
  refuse: 'rejected',
};

function getPreferredValue(data, fieldNames) {
  for (const fieldName of fieldNames) {
    if (data && data[fieldName] !== undefined && data[fieldName] !== null) {
      return data[fieldName];
    }
  }
  return null;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  );
}

function mapExpenseClaimStatusToCanonical(status) {
  if (typeof status !== 'string' || !status) {
    return null;
  }
  return LEGACY_TO_CANONICAL_STATUS[status] || status;
}

/**
 * Project a legacy reimbursement document onto the canonical schema.
 * Mirror of CalyCompta normalizeCanonicalExpenseClaimPayload(). Keep in sync.
 */
function normalizeCanonicalExpenseClaimPayload(payload, expenseClaimId) {
  const operationId = getPreferredValue(payload, ['operation_id', 'evenement_id']);
  const operationTitle = getPreferredValue(payload, ['operation_titre', 'evenement_titre']);
  const supplierName = getPreferredValue(payload, ['fournisseur_nom', 'fournisseur']);

  return compactObject({
    club_id: payload.club_id ?? null,
    legacy_collection: 'demandes_remboursement',
    legacy_document_id: expenseClaimId ?? (typeof payload.id === 'string' ? payload.id : null),
    operation_id: operationId,
    operation_title: operationTitle,
    requester_id: payload.demandeur_id ?? null,
    requester_name: payload.demandeur_nom ?? null,
    requester_first_name: payload.demandeur_prenom ?? null,
    requester_email: payload.demandeur_email ?? null,
    title: payload.titre ?? null,
    amount: payload.montant ?? null,
    description: payload.description ?? null,
    category: payload.categorie ?? null,
    account_code: payload.code_comptable ?? null,
    status: mapExpenseClaimStatusToCanonical(getPreferredValue(payload, ['status', 'statut'])),
    attachment_file_names: payload.pieces_jointes ?? null,
    supporting_document_urls: payload.urls_justificatifs ?? null,
    supporting_documents: payload.documents_justificatifs ?? null,
    requested_at: payload.date_demande ?? null,
    expense_date: payload.date_depense ?? null,
    submitted_at: payload.date_soumission ?? null,
    approved_at: payload.date_approbation ?? null,
    approved_by: payload.approuve_par ?? null,
    approved_by_name: payload.approuve_par_nom ?? null,
    second_approved_at: payload.date_approbation_2 ?? null,
    second_approved_by: payload.approuve_par_2 ?? null,
    second_approved_by_name: payload.approuve_par_2_nom ?? null,
    requires_double_approval: payload.requires_double_approval ?? null,
    reimbursed_at: payload.date_remboursement ?? null,
    bank_transaction_id: payload.transaction_id ?? null,
    source_transaction_id: payload.source_transaction_id ?? null,
    source_transaction_reference: payload.source_transaction_ref ?? null,
    rejection_reason: payload.motif_refus ?? null,
    rejected_by: payload.refuse_par ?? null,
    rejected_by_name: payload.refuse_par_nom ?? null,
    rejected_at: payload.date_refus ?? null,
    created_at: getPreferredValue(payload, ['created_at', 'createdAt']),
    updated_at: getPreferredValue(payload, ['updated_at', 'updatedAt']),
    created_by: payload.created_by ?? null,
    confirmation_email_sent: payload.confirmation_email_sent ?? null,
    confirmation_email_sent_at: payload.confirmation_email_sent_at ?? null,
    amount_history: payload.montant_history ?? null,
    status_history: payload.status_history ?? null,
    beneficiary_type: payload.beneficiaire_type ?? null,
    supplier_id: payload.fournisseur_id ?? null,
    supplier_name: supplierName,
    manual_payment: payload.paiement_manuel ?? null,
    manual_payment_date: payload.paiement_manuel_date ?? null,
    manual_payment_by: payload.paiement_manuel_par ?? null,
    payment_qr_message: payload.communication_qr ?? null,
    payment_reference: payload.payment_reference ?? null,
    payment_reference_key: payload.payment_reference_key ?? null,
    fiscal_year_id: payload.fiscal_year_id ?? null,
  });
}

exports.mirrorLegacyExpenseClaim = onDocumentWritten(
  {
    document: 'clubs/{clubId}/demandes_remboursement/{demandeId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, demandeId } = event.params;
    const db = admin.firestore();
    const canonicalRef = db
      .collection('clubs')
      .doc(clubId)
      .collection('expense_claims')
      .doc(demandeId);

    const afterSnap = event.data && event.data.after;
    const legacyExists = afterSnap && afterSnap.exists;

    // Deletion: remove the canonical mirror too.
    if (!legacyExists) {
      try {
        await canonicalRef.delete();
        console.log(`🗑️ [mirrorLegacyExpenseClaim] Deleted canonical mirror clubs/${clubId}/expense_claims/${demandeId}`);
      } catch (error) {
        console.warn(`⚠️ [mirrorLegacyExpenseClaim] Canonical delete soft-failure for ${demandeId}:`, error);
      }
      return null;
    }

    // Create/update: project legacy -> canonical (full overwrite, idempotent).
    try {
      const legacyData = afterSnap.data() || {};
      const canonicalPayload = normalizeCanonicalExpenseClaimPayload(legacyData, demandeId);
      await canonicalRef.set(canonicalPayload);
      console.log(`🔁 [mirrorLegacyExpenseClaim] Synced clubs/${clubId}/expense_claims/${demandeId} (status=${canonicalPayload.status}, amount=${canonicalPayload.amount})`);
    } catch (error) {
      console.error(`❌ [mirrorLegacyExpenseClaim] Failed to sync ${demandeId}:`, error);
      throw error;
    }

    return null;
  }
);
