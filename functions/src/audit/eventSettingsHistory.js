'use strict';

const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');

// Only event settings: payment/registration documents and incidental system
// fields are deliberately excluded. Snapshots are the actual committed values.
const SETTINGS = Object.freeze([
  'titre', 'description', 'info_document', 'documents_justificatifs', 'isEditable', 'type', 'statut', 'event_category', 'categorie',
  'date_debut', 'date_fin', 'registration_deadline', 'lieu', 'lieu_id',
  'lieu_type', 'capacite_max', 'organisateur_id', 'organisateur_nom',
  'event_number', 'code_comptable', 'fiscal_year_id', 'communication', 'montant_prevu',
  'budget_prevu_revenus', 'budget_prevu_depenses',
  'event_tariffs', 'prix_membre', 'prix_non_membre', 'price_tbd',
  'payment_required', 'allowed_payment_methods', 'registration_confirmation_policy',
  'payment_deadline_days', 'auto_cancel_unpaid', 'payment_plan_enabled', 'payment_installments',
  'allow_guests', 'max_guests_per_member', 'allow_waitlist', 'supplements',
]);

function buildEventSettingsHistory(before, after, context) {
  if (!before || !after || (before.type !== 'evenement' && after.type !== 'evenement')) return null;
  const changes = [];
  for (const field of SETTINGS) {
    const oldPresent = Object.hasOwn(before, field);
    const newPresent = Object.hasOwn(after, field);
    if (oldPresent === newPresent && isDeepStrictEqual(before[field], after[field])) continue;
    const oldValue = boundedValue(safeHistoryValue(field, oldPresent ? before[field] : null));
    const newValue = boundedValue(safeHistoryValue(field, newPresent ? after[field] : null));
    changes.push({
      field,
      old_present: oldPresent,
      new_present: newPresent,
      old_value: oldValue.value,
      new_value: newValue.value,
      ...(oldValue.hash ? { old_truncated_sha256: oldValue.hash } : {}),
      ...(newValue.hash ? { new_truncated_sha256: newValue.hash } : {}),
    });
  }
  if (!changes.length) return null;
  return {
    schema_version: 1,
    event_id: context.eventId,
    event_time: context.eventTime || null,
    actor_type: context.authType || 'unknown',
    actor_id: context.authId || null,
    changes,
  };
}

// Document URLs can contain access tokens. The audit records the document's
// identity and metadata but never persists its URL or download credentials.
function safeHistoryValue(field, value) {
  if (field === 'documents_justificatifs' && Array.isArray(value)) {
    return value.map(item => safeHistoryValue('info_document', item));
  }
  if (field !== 'info_document' || value == null) return value;
  // Legacy documents can store the URL directly as a string.
  if (typeof value !== 'object') return '[document]';
  const safe = {};
  for (const key of ['name', 'nom', 'filename', 'type', 'size', 'uploaded_at']) {
    if (Object.hasOwn(value, key)) safe[key] = value[key];
  }
  return safe;
}

// Both snapshots can together exceed Firestore's document limit. Keep large
// values identifiable and explicitly marked rather than silently failing the
// audit write forever. Ordinary settings are stored in full.
function boundedValue(value) {
  const serialized = JSON.stringify(value);
  if (serialized && Buffer.byteLength(serialized, 'utf8') > 8192) {
    return { value: null, hash: createHash('sha256').update(serialized).digest('hex') };
  }
  return { value };
}

module.exports = { SETTINGS, buildEventSettingsHistory };
