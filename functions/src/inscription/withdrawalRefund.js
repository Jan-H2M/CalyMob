const crypto = require('crypto');
const { buildCanonicalFromLegacy } = require('../expenses/expenseSync');

const cents = value => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : 0;
const iban = value => String(value || '').replace(/\s/g, '').toUpperCase();
const text = value => String(value || '').replace(/\s+/g, ' ').trim();
const digest = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
const data = snap => snap.exists ? { ...snap.data(), id: snap.id } : null;
const links = entry => [...new Set([
  entry.transaction_id,
  ...Object.values(entry.installment_payments || {}).map(payment => payment.transaction_id),
].filter(value => typeof value === 'string' && value && !value.includes('/')))];
const eventMatches = (bank, operationId) => bank.operation_id === operationId
  || bank.evenement_id === operationId
  || (bank.matched_entities || []).some(entity => ['event', 'operation'].includes(entity.entity_type)
    && entity.entity_id === operationId);
const inscriptionMatches = (bank, id) => (bank.matched_entities || [])
  .some(entity => entity.entity_type === 'inscription' && entity.entity_id === id);

function mergeClaims(legacy, canonical) {
  const claims = new Map(legacy.map(doc => [doc.id, { ...doc.data(), id: doc.id }]));
  for (const doc of canonical) {
    const value = doc.data();
    const legacy = claims.get(doc.id) || {};
    claims.set(doc.id, { ...legacy, ...value, id: doc.id,
      montant: value.amount ?? value.montant ?? legacy.montant,
      statut: value.status ?? value.statut ?? legacy.statut,
      source_transaction_ref: value.source_transaction_reference ?? value.source_transaction_ref ?? legacy.source_transaction_ref,
    });
  }
  return [...claims.values()].filter(claim => !['refuse', 'rejected'].includes(claim.statut)
    || claim.transaction_id || claim.bank_transaction_id || claim.paiement_manuel || claim.manual_payment);
}

// Attribute at most the actual draft/paid amount, even after an admin edit.
function refundReservations(claims) {
  let total = 0;
  const byRegistration = new Map();
  for (const claim of claims) {
    let left = Math.max(0, cents(claim.montant));
    total += left;
    for (const item of claim.withdrawal_refund_allocations || []) {
      if (!Number.isSafeInteger(item.amount_cents) || item.amount_cents <= 0) continue;
      const part = Math.min(left, item.amount_cents);
      byRegistration.set(item.inscription_id, (byRegistration.get(item.inscription_id) || 0) + part);
      left -= part;
    }
  }
  return { total, byRegistration };
}

/** Reserve only the canceled allocations; all existing drafts count as reserved. */
function refundableCents(receipt, affected, allAllocations, claims) {
  const ids = new Set(affected.map(item => item.inscription_id));
  const previous = refundReservations(claims);
  const remaining = item => Math.max(0, item.amount_cents
    - (previous.byRegistration.get(item.inscription_id) || 0));
  const canceled = affected.reduce((sum, item) => sum + remaining(item), 0);
  const retained = allAllocations.filter(item => !ids.has(item.inscription_id))
    .reduce((sum, item) => sum + remaining(item), 0);
  return Math.max(0, Math.min(canceled, cents(receipt.montant) - previous.total - retained));
}

/** All reads finish before stageWithdrawalRefunds is called by the cancellation. */
async function planWithdrawalRefunds({ db, transaction, clubId, operationId, operation,
  affected, allEntries, actorUid, now }) {
  const empty = { writes: [], claimIds: [], reviewRequired: false };
  const eligible = affected.filter(entry => entry.data().registration_status !== 'waitlisted');
  if (!eligible.some(entry => links(entry.data()).length)) return { ...empty,
    reviewRequired: eligible.some(entry => entry.data().paye === true) };
  const base = `clubs/${clubId}`;
  const collection = name => db.collection(`${base}/${name}`);
  const bankCache = new Map();
  const bank = async id => {
    if (!bankCache.has(id)) bankCache.set(id, (async () => {
      const [legacy, canonical] = await Promise.all([
        transaction.get(db.doc(`${base}/transactions_bancaires/${id}`)),
        transaction.get(db.doc(`${base}/bank_transactions/${id}`)),
      ]);
      return data(canonical) || data(legacy);
    })());
    return bankCache.get(id);
  };
  const allocationsSnap = await transaction.get(collection('payment_allocations')
    .where('operation_id', '==', operationId));
  const allocations = allocationsSnap.docs.map(doc => doc.data());
  const receipts = new Map();
  let reviewRequired = eligible.some(entry => entry.data().paye === true && !links(entry.data()).length);
  for (const entry of eligible) {
    const registration = entry.data();
    const seen = new Set();
    for (const id of links(registration)) {
      const linked = await bank(id);
      const ledgerProvesShare = linked && allocations.some(item =>
        item.receipt_id === (linked.parent_transaction_id || linked.id)
        && item.inscription_id === entry.id && Number.isSafeInteger(item.amount_cents)
        && item.amount_cents > 0 && (!item.status || item.status === 'settled'));
      if (!linked || cents(linked.montant) <= 0 || !eventMatches(linked, operationId)
        || (!inscriptionMatches(linked, entry.id) && !ledgerProvesShare)) {
        reviewRequired = true; continue;
      }
      if (linked.parent_transaction_id && (typeof linked.parent_transaction_id !== 'string'
        || linked.parent_transaction_id.includes('/'))) { reviewRequired = true; continue; }
      const receipt = linked.parent_transaction_id ? await bank(linked.parent_transaction_id) : linked;
      if (!receipt || receipt.parent_transaction_id || cents(receipt.montant) <= 0) {
        reviewRequired = true; continue;
      }
      if (seen.has(receipt.id)) continue;
      seen.add(receipt.id);
      const settled = allocations.filter(item => item.receipt_id === receipt.id
        && item.inscription_id === entry.id && Number.isSafeInteger(item.amount_cents)
        && item.amount_cents > 0 && (!item.status || item.status === 'settled'));
      let amount = settled.reduce((sum, item) => sum + item.amount_cents, 0);
      if (!amount) {
        // A single bank line or an explicit split child proves its own share.
        // An old group cascade onto one unsplit line does not prove each share.
        const sameLine = allEntries.filter(other => links(other.data()).includes(id));
        if (linked.is_parent || linked.is_split || sameLine.length !== 1
          || (linked.matched_entities || []).filter(e => e.entity_type === 'inscription').length !== 1) {
          reviewRequired = true; continue;
        }
        amount = cents(linked.montant);
      }
      if (!receipts.has(receipt.id)) receipts.set(receipt.id, { receipt, affected: [] });
      receipts.get(receipt.id).affected.push({ inscription_id: entry.id, amount_cents: amount });
    }
  }
  const plan = { writes: [], claimIds: [], reviewRequired };
  const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Europe/Brussels' })
    .format(now.toDate());
  let counter = null;
  const counterRef = db.doc(`${base}/settings/rem_reference_counter_${year}`);
  for (const { receipt, affected: shares } of receipts.values()) {
    const [childrenLegacy, childrenCanonical] = await Promise.all([
      transaction.get(collection('transactions_bancaires').where('parent_transaction_id', '==', receipt.id)),
      transaction.get(collection('bank_transactions').where('parent_transaction_id', '==', receipt.id)),
    ]);
    const children = new Map(childrenLegacy.docs.map(doc => [doc.id, { ...doc.data(), id: doc.id }]));
    childrenCanonical.docs.forEach(doc => children.set(doc.id, { ...doc.data(), id: doc.id }));
    const sourceIds = [receipt.id, ...children.keys()];
    const legacyClaims = new Map();
    const canonicalClaims = new Map();
    // Includes manual refunds without an operation_id, and mirrored claims once.
    for (let offset = 0; offset < sourceIds.length; offset += 30) {
      const ids = sourceIds.slice(offset, offset + 30);
      const [legacy, canonical] = await Promise.all([
        transaction.get(collection('demandes_remboursement').where('source_transaction_id', 'in', ids)),
        transaction.get(collection('expense_claims').where('source_transaction_id', 'in', ids)),
      ]);
      legacy.docs.forEach(doc => legacyClaims.set(doc.id, doc));
      canonical.docs.forEach(doc => canonicalClaims.set(doc.id, doc));
    }
    // Older edit refunds have inscription_id, but no source_transaction_id.
    const [editLegacy, editCanonical] = await Promise.all([
      transaction.get(collection('demandes_remboursement').where('operation_id', '==', operationId)),
      transaction.get(collection('expense_claims').where('operation_id', '==', operationId)),
    ]);
    const editIds = new Set([...editLegacy.docs, ...editCanonical.docs]
      .filter(doc => shares.some(item => item.inscription_id === doc.data().inscription_id))
      .map(doc => doc.id));
    for (const [snap, target] of [[editLegacy, legacyClaims], [editCanonical, canonicalClaims]]) {
      snap.docs.filter(doc => editIds.has(doc.id)).forEach(doc => target.set(doc.id, doc));
    }
    // A query can find only the stale mirror. Read the same-ID counterpart
    // before applying canonical-primary amount/status and legacy-only context.
    for (const id of new Set([...legacyClaims.keys(), ...canonicalClaims.keys()])) {
      const [legacy, canonical] = await Promise.all([
        transaction.get(db.doc(`${base}/demandes_remboursement/${id}`)),
        transaction.get(db.doc(`${base}/expense_claims/${id}`)),
      ]);
      if (legacy.exists) legacyClaims.set(id, legacy);
      if (canonical.exists) canonicalClaims.set(id, canonical);
    }
    let claims = mergeClaims([...legacyClaims.values()], [...canonicalClaims.values()])
      .filter(claim => !claim.source_transaction_id || sourceIds.includes(claim.source_transaction_id));
    const allShares = new Map();
    for (const allocation of allocations.filter(item => item.receipt_id === receipt.id)) {
      if (Number.isSafeInteger(allocation.amount_cents) && allocation.amount_cents > 0
        && (!allocation.status || allocation.status === 'settled')) {
        allShares.set(allocation.inscription_id, (allShares.get(allocation.inscription_id) || 0)
          + allocation.amount_cents);
      }
    }
    for (const child of children.values()) {
      for (const entity of child.matched_entities || []) {
        if (entity.entity_type === 'inscription' && !allShares.has(entity.entity_id)) {
          allShares.set(entity.entity_id, Math.max(0, cents(child.montant)));
        }
      }
    }
    shares.forEach(item => allShares.set(item.inscription_id, item.amount_cents));
    claims = claims.map(claim => {
      if (claim.withdrawal_refund_allocations?.some(item => Number.isSafeInteger(item.amount_cents)
        && item.amount_cents > 0)) return claim;
      const child = children.get(claim.source_transaction_id);
      const targets = child?.matched_entities?.filter(entity => entity.entity_type === 'inscription') || [];
      const target = targets.length === 1 ? targets[0].entity_id
        : allShares.size === 1 ? [...allShares.keys()][0] : null;
      return target ? { ...claim, withdrawal_refund_allocations: [{
        inscription_id: target, amount_cents: Math.max(0, cents(claim.montant)),
      }] } : claim;
    });
    if (claims.some(claim => cents(claim.montant) > 0
      && ((!claim.source_transaction_id && receipts.size > 1)
        || !claim.withdrawal_refund_allocations?.length))) {
      // An old refund on an unsplit group receipt does not identify whose
      // share was refunded. Do not guess a smaller refund for the next person.
      plan.reviewRequired = true;
      continue;
    }
    const amount = refundableCents(receipt, shares,
      [...allShares].map(([inscription_id, amount_cents]) => ({ inscription_id, amount_cents })), claims);
    if (!amount) continue;
    const claimId = `withdrawal_${digest(`${operationId}:${receipt.id}:${shares.map(s => s.inscription_id).sort().join(',')}`)}`;
    const legacyRef = db.doc(`${base}/demandes_remboursement/${claimId}`);
    const canonicalRef = db.doc(`${base}/expense_claims/${claimId}`);
    const [existingLegacy, existingCanonical] = await Promise.all([
      transaction.get(legacyRef), transaction.get(canonicalRef),
    ]);
    if (existingLegacy.exists || existingCanonical.exists) { plan.claimIds.push(claimId); continue; }
    const ownerEntry = eligible.find(entry => entry.id === shares[0].inscription_id);
    const ownerId = ownerEntry.data().is_guest ? ownerEntry.data().added_by : ownerEntry.data().membre_id;
    const ownerSnap = ownerId ? await transaction.get(db.doc(`${base}/members/${ownerId}`)) : null;
    const owner = ownerSnap?.exists ? ownerSnap.data() : {};
    const bankIban = iban(receipt.contrepartie_iban);
    const [members, suppliers] = bankIban ? await Promise.all([
      transaction.get(collection('members').where('iban', '==', bankIban)),
      transaction.get(collection('fournisseurs').where('iban', '==', bankIban)),
    ]) : [{ docs: [] }, { docs: [] }];
    const beneficiary = members.docs.find(doc => doc.id === ownerId) || members.docs[0];
    let supplier = suppliers.docs[0];
    if (bankIban && !beneficiary && !supplier) {
      const ref = db.doc(`${base}/fournisseurs/refund_${digest(bankIban)}`);
      const existing = await transaction.get(ref);
      supplier = existing.exists ? existing : { id: ref.id };
      if (!existing.exists) plan.writes.push([ref, { nom: text(receipt.contrepartie_nom)
        || text(`${owner.prenom || ''} ${owner.nom || ''}`) || 'Bénéficiaire du virement',
      iban: bankIban, actif: true, supplierType: 'external', created_by: actorUid,
      created_at: now, updated_at: now }]);
    }
    const requester = beneficiary?.data() || owner;
    if (counter === null) {
      const snap = await transaction.get(counterRef);
      counter = snap.exists ? Number(snap.data().counter || 0) : 0;
    }
    const reference = `REM-${year}-${String(++counter).padStart(4, '0')}`;
    const eventContext = text(`${operation.event_number || ''} ${operation.lieu || operation.titre || ''}`).slice(0, 65);
    const label = text(`Remb. qui ann. la trans. ${receipt.numero_sequence || receipt.id} ${eventContext}`);
    const category = operation.event_category || (String(operation.event_number || '').startsWith('P') ? 'plongee' : 'sortie');
    const account = operation.code_comptable || { plongee: '618-00-632', sortie: '619-00-633', piscine: '610-00-621' }[category] || null;
    let unassigned = amount;
    const reserved = refundReservations(claims).byRegistration;
    const refundShares = shares.map(share => {
      const part = Math.min(unassigned, Math.max(0, share.amount_cents
        - (reserved.get(share.inscription_id) || 0)));
      unassigned -= part;
      return { inscription_id: share.inscription_id, amount_cents: part };
    }).filter(share => share.amount_cents > 0);
    const legacy = {
      club_id: clubId, operation_id: operationId, operation_titre: operation.titre || '',
      titre: `Désinscription — ${operation.titre || eventContext}`,
      description: `Remboursement après désinscription — ${eventContext} — transaction ${receipt.numero_sequence || receipt.id}`,
      montant: amount / 100, statut: 'brouillon', categorie: 'remboursement_inscription',
      code_comptable: account, fiscal_year_id: operation.fiscal_year_id || receipt.fiscal_year_id || null,
      demandeur_id: beneficiary?.id || ownerId || actorUid,
      demandeur_nom: text(`${requester.prenom || requester.firstName || ''} ${requester.nom || requester.lastName || ''}`),
      demandeur_prenom: requester.prenom || requester.firstName || '', demandeur_email: requester.email || '',
      beneficiaire_type: supplier ? 'fournisseur' : 'demandeur',
      fournisseur_id: supplier?.id || null, fournisseur_nom: supplier ? text(receipt.contrepartie_nom) : null,
      source_transaction_id: receipt.id, source_transaction_ref: receipt.numero_sequence || receipt.id,
      payment_reference: reference, payment_reference_key: `+++${reference}+++`,
      communication_qr: `+++${reference}+++ ${label}`.slice(0, 140),
      source: 'event_withdrawal', send_confirmation_email: false,
      withdrawal_refund_allocations: refundShares, withdrawal_operation_id: operationId,
      created_by: actorUid, created_at: now, updated_at: now, date_depense: now, date_demande: now,
    };
    plan.writes.push([legacyRef, legacy], [canonicalRef, {
      ...buildCanonicalFromLegacy(legacy, claimId), withdrawal_refund_allocations: refundShares,
      withdrawal_operation_id: operationId,
    }]);
    plan.claimIds.push(claimId);
  }
  if (counter !== null) plan.writes.push([counterRef, { counter, year: Number(year), updated_at: now }]);
  return plan;
}

function stageWithdrawalRefunds(transaction, plan) {
  for (const [ref, payload] of plan.writes) transaction.set(ref, payload, { merge: true });
}

module.exports = { planWithdrawalRefunds, stageWithdrawalRefunds, refundableCents };
