'use strict';

const crypto = require('node:crypto');
const { onDocumentUpdatedWithAuthContext } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { buildEventSettingsHistory } = require('./eventSettingsHistory');

exports.onEventSettingsUpdated = onDocumentUpdatedWithAuthContext({
  document: 'clubs/{clubId}/operations/{operationId}',
  region: 'europe-west1',
  retry: true,
}, async event => {
  if (!event.data || !event.id) return;
  const entry = buildEventSettingsHistory(event.data.before.data(), event.data.after.data(), {
    eventId: event.id, eventTime: event.time, authType: event.authType, authId: event.authId,
  });
  if (!entry) return;
  // An Eventarc delivery can repeat. A deterministic document id makes a
  // retry harmless without rewriting the original immutable record.
  const id = crypto.createHash('sha256').update(event.id).digest('hex');
  const ref = event.data.after.ref.collection('settings_history').doc(id);
  try {
    await ref.create({ ...entry, recorded_at: admin.firestore.FieldValue.serverTimestamp() });
  } catch (error) {
    if (error.code === 6 || error.code === '6' || error.code === 'already-exists' || error.code === 'ALREADY_EXISTS') return;
    throw error;
  }
});
