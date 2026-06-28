/**
 * Sync-engine voor terugbetalingen (Stap 3 — DORMANT, nog niet bedraad/gedeployed).
 *
 * Bevat de domein-onafhankelijke bouwstenen uit het migratieplan:
 *  - forward/reverse projectie legacy ⇄ canonical (contract-gedreven),
 *  - inline server-owned `_sync`-metadata,
 *  - change-detection met SLEUTEL-GESORTEERDE deep-compare (geen valse drift),
 *  - loop-guard, e-mail-guard,
 *  - veld-ownership-matrix per fase.
 *
 * Niets hiervan wordt actief tot de mirror/triggers er in Stap 5 op aangesloten
 * worden en de flags omgezet worden (zie migrationFlags.js).
 */

const contract = require('./expenseClaimContract.json');

const STATUS_L2C = contract.statusLegacyToCanonical;
const STATUS_C2L = Object.fromEntries(
  Object.entries(STATUS_L2C).map(([legacy, canonical]) => [canonical, legacy])
);

function firstDefined(data, keys) {
  for (const k of keys) {
    if (data && data[k] !== undefined && data[k] !== null) return data[k];
  }
  return null;
}
function statusToCanonical(s) {
  return typeof s === 'string' && s ? STATUS_L2C[s] || s : null;
}
function statusToLegacy(s) {
  return typeof s === 'string' && s ? STATUS_C2L[s] || s : null;
}
function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// ---------------------------------------------------------------------------
// Projecties (identiek aan de mirror/gateway; consolideren bij Stap 5).
// ---------------------------------------------------------------------------

function buildCanonicalFromLegacy(legacy, id) {
  return compact({
    club_id: legacy.club_id ?? null,
    legacy_collection: 'demandes_remboursement',
    legacy_document_id: id ?? null,
    operation_id: firstDefined(legacy, ['operation_id', 'evenement_id']),
    operation_title: firstDefined(legacy, ['operation_titre', 'evenement_titre']),
    requester_id: legacy.demandeur_id ?? null,
    requester_name: legacy.demandeur_nom ?? null,
    requester_first_name: legacy.demandeur_prenom ?? null,
    requester_email: legacy.demandeur_email ?? null,
    title: legacy.titre ?? null,
    amount: legacy.montant ?? null,
    description: legacy.description ?? null,
    category: legacy.categorie ?? null,
    account_code: legacy.code_comptable ?? null,
    status: statusToCanonical(firstDefined(legacy, ['status', 'statut'])),
    attachment_file_names: legacy.pieces_jointes ?? null,
    supporting_document_urls: legacy.urls_justificatifs ?? null,
    supporting_documents: legacy.documents_justificatifs ?? null,
    requested_at: legacy.date_demande ?? null,
    expense_date: legacy.date_depense ?? null,
    submitted_at: legacy.date_soumission ?? null,
    approved_at: legacy.date_approbation ?? null,
    approved_by: legacy.approuve_par ?? null,
    approved_by_name: legacy.approuve_par_nom ?? null,
    second_approved_at: legacy.date_approbation_2 ?? null,
    second_approved_by: legacy.approuve_par_2 ?? null,
    second_approved_by_name: legacy.approuve_par_2_nom ?? null,
    requires_double_approval: legacy.requires_double_approval ?? null,
    reimbursed_at: legacy.date_remboursement ?? null,
    bank_transaction_id: legacy.transaction_id ?? null,
    source_transaction_id: legacy.source_transaction_id ?? null,
    source_transaction_reference: legacy.source_transaction_ref ?? null,
    rejection_reason: legacy.motif_refus ?? null,
    rejected_by: legacy.refuse_par ?? null,
    rejected_by_name: legacy.refuse_par_nom ?? null,
    rejected_at: legacy.date_refus ?? null,
    created_at: firstDefined(legacy, ['created_at', 'createdAt']),
    updated_at: firstDefined(legacy, ['updated_at', 'updatedAt']),
    created_by: legacy.created_by ?? null,
    confirmation_email_sent: legacy.confirmation_email_sent ?? null,
    confirmation_email_sent_at: legacy.confirmation_email_sent_at ?? null,
    amount_history: legacy.montant_history ?? null,
    status_history: legacy.status_history ?? null,
    beneficiary_type: legacy.beneficiaire_type ?? null,
    supplier_id: legacy.fournisseur_id ?? null,
    supplier_name: firstDefined(legacy, ['fournisseur_nom', 'fournisseur']),
    manual_payment: legacy.paiement_manuel ?? null,
    manual_payment_date: legacy.paiement_manuel_date ?? null,
    manual_payment_by: legacy.paiement_manuel_par ?? null,
    payment_qr_message: legacy.communication_qr ?? null,
    payment_reference: legacy.payment_reference ?? null,
    payment_reference_key: legacy.payment_reference_key ?? null,
    fiscal_year_id: legacy.fiscal_year_id ?? null,
  });
}

function buildLegacyFromCanonical(canon, id) {
  return compact({
    club_id: canon.club_id ?? null,
    operation_id: firstDefined(canon, ['operation_id', 'evenement_id']),
    operation_titre: firstDefined(canon, ['operation_title', 'operation_titre']),
    demandeur_id: firstDefined(canon, ['requester_id', 'demandeur_id']),
    demandeur_nom: firstDefined(canon, ['requester_name', 'demandeur_nom']),
    demandeur_prenom: firstDefined(canon, ['requester_first_name', 'demandeur_prenom']),
    demandeur_email: firstDefined(canon, ['requester_email', 'demandeur_email']),
    titre: firstDefined(canon, ['title', 'titre']),
    montant: firstDefined(canon, ['amount', 'montant']),
    description: canon.description ?? null,
    categorie: firstDefined(canon, ['category', 'categorie']),
    code_comptable: firstDefined(canon, ['account_code', 'code_comptable']),
    statut: statusToLegacy(firstDefined(canon, ['status', 'statut'])),
    pieces_jointes: firstDefined(canon, ['attachment_file_names', 'pieces_jointes']),
    urls_justificatifs: firstDefined(canon, ['supporting_document_urls', 'urls_justificatifs']),
    documents_justificatifs: firstDefined(canon, ['supporting_documents', 'documents_justificatifs']),
    date_demande: firstDefined(canon, ['requested_at', 'date_demande']),
    date_depense: firstDefined(canon, ['expense_date', 'date_depense']),
    date_soumission: firstDefined(canon, ['submitted_at', 'date_soumission']),
    date_approbation: firstDefined(canon, ['approved_at', 'date_approbation']),
    approuve_par: firstDefined(canon, ['approved_by', 'approuve_par']),
    approuve_par_nom: firstDefined(canon, ['approved_by_name', 'approuve_par_nom']),
    date_approbation_2: firstDefined(canon, ['second_approved_at', 'date_approbation_2']),
    approuve_par_2: firstDefined(canon, ['second_approved_by', 'approuve_par_2']),
    approuve_par_2_nom: firstDefined(canon, ['second_approved_by_name', 'approuve_par_2_nom']),
    requires_double_approval: canon.requires_double_approval ?? null,
    date_remboursement: firstDefined(canon, ['reimbursed_at', 'date_remboursement']),
    transaction_id: firstDefined(canon, ['bank_transaction_id', 'transaction_id']),
    source_transaction_id: canon.source_transaction_id ?? null,
    source_transaction_ref: firstDefined(canon, ['source_transaction_reference', 'source_transaction_ref']),
    motif_refus: firstDefined(canon, ['rejection_reason', 'motif_refus']),
    refuse_par: firstDefined(canon, ['rejected_by', 'refuse_par']),
    refuse_par_nom: firstDefined(canon, ['rejected_by_name', 'refuse_par_nom']),
    date_refus: firstDefined(canon, ['rejected_at', 'date_refus']),
    created_at: firstDefined(canon, ['created_at', 'createdAt']),
    updated_at: firstDefined(canon, ['updated_at', 'updatedAt']),
    created_by: canon.created_by ?? null,
    confirmation_email_sent: canon.confirmation_email_sent ?? null,
    confirmation_email_sent_at: canon.confirmation_email_sent_at ?? null,
    montant_history: firstDefined(canon, ['amount_history', 'montant_history']),
    status_history: canon.status_history ?? null,
    beneficiaire_type: firstDefined(canon, ['beneficiary_type', 'beneficiaire_type']),
    fournisseur_id: firstDefined(canon, ['supplier_id', 'fournisseur_id']),
    fournisseur_nom: firstDefined(canon, ['supplier_name', 'fournisseur_nom']),
    paiement_manuel: firstDefined(canon, ['manual_payment', 'paiement_manuel']),
    paiement_manuel_date: firstDefined(canon, ['manual_payment_date', 'paiement_manuel_date']),
    paiement_manuel_par: firstDefined(canon, ['manual_payment_by', 'paiement_manuel_par']),
    communication_qr: firstDefined(canon, ['payment_qr_message', 'communication_qr']),
    payment_reference: canon.payment_reference ?? null,
    payment_reference_key: canon.payment_reference_key ?? null,
    fiscal_year_id: canon.fiscal_year_id ?? null,
  });
}

// ---------------------------------------------------------------------------
// Inline `_sync`-metadata + guards
// ---------------------------------------------------------------------------

const MIRROR_ORIGINS = new Set(['legacy-mirror', 'canonical-mirror']);

function tagSync(payload, { origin, version, sourceId }) {
  return {
    ...payload,
    _sync: {
      origin,
      version: version ?? Date.now(),
      source_id: sourceId ?? null,
      synced_at: new Date().toISOString(),
    },
  };
}

/** True als dit document door een mirror geschreven werd (→ geen e-mail sturen). */
function isSyncMirrorWrite(doc) {
  const origin = doc && doc._sync && doc._sync.origin;
  return MIRROR_ORIGINS.has(origin);
}

/**
 * Loop-guard: sla over wanneer de inkomende write zelf van de tegenoverliggende
 * mirror kwam én het doel die versie al weerspiegelt.
 */
function shouldSkipAsLoop(incomingSync, targetSync) {
  if (!incomingSync || !MIRROR_ORIGINS.has(incomingSync.origin)) return false;
  if (!targetSync) return false;
  return Number(targetSync.version ?? 0) >= Number(incomingSync.version ?? 0);
}

// ---------------------------------------------------------------------------
// Change-detection (sleutel-gesorteerd; geen valse drift door key-volgorde)
// ---------------------------------------------------------------------------

function deepNormalize(value) {
  if (value === null || value === undefined) return null;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return value;
  if (Array.isArray(value)) return value.map(deepNormalize);
  if (t === 'object') {
    if (typeof value.toDate === 'function') {
      const d = value.toDate();
      return d instanceof Date ? d.toISOString() : String(d);
    }
    if (typeof value._seconds === 'number') return new Date(value._seconds * 1000).toISOString();
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = deepNormalize(value[k]);
    return out;
  }
  return String(value);
}

/** Velden in `expected` die echt verschillen van `current` (negeert `_sync`). */
function changedFields(expected, current) {
  return Object.keys(expected)
    .filter((k) => k !== '_sync')
    .filter((k) => JSON.stringify(deepNormalize(expected[k])) !== JSON.stringify(deepNormalize(current ? current[k] : undefined)));
}

// ---------------------------------------------------------------------------
// Veld-ownership-matrix (§5.5 van het plan)
// ---------------------------------------------------------------------------

const MEMBER_FIELDS = [
  'amount', 'description', 'expense_date', 'requester_id', 'requester_name',
  'requester_first_name', 'requester_email', 'title', 'category',
  'supporting_document_urls', 'attachment_file_names',
];
const SYSTEM_FIELDS = ['_sync', 'legacy_collection', 'legacy_document_id', 'created_at', 'updated_at', 'created_by'];

function fieldGroup(field) {
  if (MEMBER_FIELDS.includes(field)) return 'member';
  if (SYSTEM_FIELDS.includes(field)) return 'system';
  return 'workflow';
}

const PHASE_PRIMARY = {
  fase0: { member: 'legacy', workflow: 'legacy', system: 'server' },
  transitie: { member: 'legacy', workflow: 'canonical', system: 'server' },
  adoptie: { member: 'canonical', workflow: 'canonical', system: 'server' },
};

/** Wie is primary voor dit veld in deze fase? 'legacy' | 'canonical' | 'server'. */
function primaryFor(field, phase) {
  const group = fieldGroup(field);
  return (PHASE_PRIMARY[phase] || PHASE_PRIMARY.fase0)[group];
}

module.exports = {
  buildCanonicalFromLegacy,
  buildLegacyFromCanonical,
  statusToCanonical,
  statusToLegacy,
  tagSync,
  isSyncMirrorWrite,
  shouldSkipAsLoop,
  deepNormalize,
  changedFields,
  fieldGroup,
  primaryFor,
  MIRROR_ORIGINS,
};
