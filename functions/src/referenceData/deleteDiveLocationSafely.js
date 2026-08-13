/**
 * Delete a dive location only when no historical record points at it.
 *
 * Locations with consumers must go through the audited merge/archive flow;
 * silently deleting them would leave orphaned location_id values in events,
 * logbooks and training records.
 */

const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

const REGION = 'europe-west1';

async function requireClubAdmin(clubId, uid) {
  const member = await admin.firestore()
    .collection('clubs').doc(clubId).collection('members').doc(uid).get();
  if (!member.exists) throw new HttpsError('permission-denied', 'Membre du club requis.');
  const role = String(member.data()?.app_role || '').toLowerCase();
  if (role !== 'admin' && role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Réservé aux administrateurs.');
  }
}

function validateInput(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const clubId = String(request.data?.clubId || '').trim();
  const locationId = String(request.data?.locationId || '').trim();
  if (!clubId || clubId.length > 100 || !locationId || locationId.length > 200) {
    throw new HttpsError('invalid-argument', 'clubId et locationId sont requis.');
  }
  return { uid, clubId, locationId };
}

async function equal(collectionRef, field, value) {
  return (await collectionRef.where(field, '==', value).get()).docs;
}

async function collectLocationReferences(clubRef, locationId) {
  const [operationsByLieu, operationsByLocation, entries, confirmations, tasks, sessionsByLieu, sessionsByLocation] = await Promise.all([
    equal(clubRef.collection('operations'), 'lieu_id', locationId),
    equal(clubRef.collection('operations'), 'location_id', locationId),
    equal(clubRef.collection('student_logbook_entries'), 'location_id', locationId),
    equal(clubRef.collection('logbook_dive_confirmations'), 'location_id', locationId),
    equal(clubRef.collection('formation_tasks'), 'context.location_id', locationId),
    equal(clubRef.collection('piscine_sessions'), 'lieu_id', locationId),
    equal(clubRef.collection('piscine_sessions'), 'location_id', locationId),
  ]);
  const unique = (docs) => [...new Map(docs.map((doc) => [doc.ref.path, doc])).values()];
  return {
    operations: unique([...operationsByLieu, ...operationsByLocation]),
    logbookEntries: unique(entries),
    confirmations: unique(confirmations),
    formationTasks: unique(tasks),
    poolSessions: unique([...sessionsByLieu, ...sessionsByLocation]),
  };
}

function summarizeReferences(references) {
  return Object.fromEntries(Object.entries(references).map(([key, docs]) => [key, docs.length]));
}

function hasReferences(references) {
  return Object.values(references).some((docs) => docs.length > 0);
}

const deleteDiveLocationSafely = onCall({ region: REGION, timeoutSeconds: 30 }, async (request) => {
  const input = validateInput(request);
  await requireClubAdmin(input.clubId, input.uid);
  const db = admin.firestore();
  const clubRef = db.collection('clubs').doc(input.clubId);
  const locationRef = clubRef.collection('dive_locations').doc(input.locationId);
  const locationSnap = await locationRef.get();
  if (!locationSnap.exists) throw new HttpsError('not-found', 'Lieu de plongée introuvable.');
  const location = locationSnap.data() || {};
  if (location.merged_into_location_id) {
    throw new HttpsError('failed-precondition', 'Ce lieu est archivé après fusion; il ne peut pas être supprimé.');
  }

  const references = await collectLocationReferences(clubRef, input.locationId);
  const counts = summarizeReferences(references);
  if (hasReferences(references)) {
    throw new HttpsError(
      'failed-precondition',
      `Lieu encore référencé (${Object.entries(counts).filter(([, count]) => count).map(([key, count]) => `${key}: ${count}`).join(', ')}). Utilisez l'archivage ou la fusion.`,
      { code: 'REFERENCES_EXIST', counts, action: 'archive_or_merge' },
    );
  }

  const auditRef = clubRef.collection('dive_location_deletions').doc();
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(locationRef);
    if (!current.exists) throw new HttpsError('not-found', 'Lieu de plongée introuvable.');
    transaction.create(auditRef, {
      location_id: input.locationId,
      location_snapshot: current.data() || {},
      deleted_by: input.uid,
      deleted_at: FieldValue.serverTimestamp(),
      reason: 'no_references',
    });
    transaction.delete(locationRef);
  });
  return { success: true, locationId: input.locationId, counts };
});

module.exports = {
  collectLocationReferences,
  summarizeReferences,
  hasReferences,
  deleteDiveLocationSafely,
};
