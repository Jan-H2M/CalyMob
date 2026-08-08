/**
 * Admin-only, auditable reconciliation of duplicate club dive locations.
 *
 * A merge never deletes the source document. It archives it and rewrites the
 * known references to one canonical location so historic dives stay readable.
 * Free-text logbook entries are included only when the administrator has
 * explicitly opted in and their text exactly equals the source location name.
 */

const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

const REGION = 'europe-west1';
const RUNNING_MERGE_TTL_MS = 15 * 60 * 1000;

async function requireClubAdmin(clubId, uid) {
  const member = await admin.firestore()
    .collection('clubs').doc(clubId).collection('members').doc(uid).get();
  if (!member.exists) throw new HttpsError('permission-denied', 'Membre du club requis.');
  const role = String(member.data()?.app_role || '').toLowerCase();
  if (role !== 'admin' && role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Réservé aux administrateurs.');
  }
}

function validatedInput(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const clubId = String(request.data?.clubId || '').trim();
  const sourceLocationId = String(request.data?.sourceLocationId || '').trim();
  const targetLocationId = String(request.data?.targetLocationId || '').trim();
  const includeExactNameEntries = request.data?.includeExactNameEntries === true;
  if (!clubId || clubId.length > 100 || !sourceLocationId || !targetLocationId) {
    throw new HttpsError('invalid-argument', 'clubId et deux identifiants de lieux sont requis.');
  }
  if (sourceLocationId === targetLocationId) {
    throw new HttpsError('invalid-argument', 'Le lieu source et le lieu de référence doivent être différents.');
  }
  return { uid, clubId, sourceLocationId, targetLocationId, includeExactNameEntries };
}

async function queryEqual(collectionRef, field, value) {
  const snapshot = await collectionRef.where(field, '==', value).get();
  return snapshot.docs;
}

async function collectReferences(clubRef, sourceLocationId, sourceName) {
  const [operationsByLieu, operationsByLocation, entries, confirmations, tasks, sessionsByLieu, sessionsByLocation, exactNameEntries] = await Promise.all([
    queryEqual(clubRef.collection('operations'), 'lieu_id', sourceLocationId),
    queryEqual(clubRef.collection('operations'), 'location_id', sourceLocationId),
    queryEqual(clubRef.collection('student_logbook_entries'), 'location_id', sourceLocationId),
    queryEqual(clubRef.collection('logbook_dive_confirmations'), 'location_id', sourceLocationId),
    queryEqual(clubRef.collection('formation_tasks'), 'context.location_id', sourceLocationId),
    queryEqual(clubRef.collection('piscine_sessions'), 'lieu_id', sourceLocationId),
    queryEqual(clubRef.collection('piscine_sessions'), 'location_id', sourceLocationId),
    sourceName ? queryEqual(clubRef.collection('student_logbook_entries'), 'location_name', sourceName) : Promise.resolve([]),
  ]);

  const unique = (docs) => [...new Map(docs.map((doc) => [doc.ref.path, doc])).values()];
  const unlinkedExactNameEntries = exactNameEntries.filter((doc) => !doc.data().location_id);
  return {
    operations: unique([...operationsByLieu, ...operationsByLocation]),
    entries: unique(entries),
    confirmations: unique(confirmations),
    tasks: unique(tasks),
    sessions: unique([...sessionsByLieu, ...sessionsByLocation]),
    unlinkedExactNameEntries: unique(unlinkedExactNameEntries),
  };
}

function publicCounts(references) {
  return {
    operations: references.operations.length,
    logbookEntries: references.entries.length,
    confirmations: references.confirmations.length,
    formationTasks: references.tasks.length,
    poolSessions: references.sessions.length,
    exactNameEntriesAvailable: references.unlinkedExactNameEntries.length,
  };
}

function locationDetails(data) {
  const patch = {
    location_id: data.id,
    location_name: data.name,
    country: data.country || null,
    location_type: data.location_type || null,
    water_type: data.water_type || null,
    latitude: typeof data.latitude === 'number' ? data.latitude : null,
    longitude: typeof data.longitude === 'number' ? data.longitude : null,
  };
  return patch;
}

function targetEnrichment(source, target) {
  const patch = {};
  if (!target.reference_match && source.reference_match) patch.reference_match = source.reference_match;
  if (!target.description && source.description) patch.description = source.description;
  if (typeof target.latitude !== 'number' && typeof source.latitude === 'number') patch.latitude = source.latitude;
  if (typeof target.longitude !== 'number' && typeof source.longitude === 'number') patch.longitude = source.longitude;
  return patch;
}

async function loadMergeContext(input) {
  const clubRef = admin.firestore().collection('clubs').doc(input.clubId);
  const [sourceSnap, targetSnap] = await Promise.all([
    clubRef.collection('dive_locations').doc(input.sourceLocationId).get(),
    clubRef.collection('dive_locations').doc(input.targetLocationId).get(),
  ]);
  if (!sourceSnap.exists || !targetSnap.exists) {
    throw new HttpsError('not-found', 'Un des sites de plongée est introuvable.');
  }
  const source = { id: sourceSnap.id, ...sourceSnap.data() };
  const target = { id: targetSnap.id, ...targetSnap.data() };
  if (source.merged_into_location_id) {
    throw new HttpsError('failed-precondition', 'Ce site a déjà été fusionné.');
  }
  const references = await collectReferences(clubRef, source.id, String(source.name || ''));
  return { clubRef, sourceSnap, targetSnap, source, target, references };
}

const previewDiveLocationMerge = onCall({ region: REGION, timeoutSeconds: 30 }, async (request) => {
  const input = validatedInput(request);
  await requireClubAdmin(input.clubId, input.uid);
  const context = await loadMergeContext(input);
  return {
    source: { id: context.source.id, name: context.source.name, country: context.source.country || null },
    target: { id: context.target.id, name: context.target.name, country: context.target.country || null },
    counts: publicCounts(context.references),
  };
});

const mergeDiveLocations = onCall({ region: REGION, timeoutSeconds: 180, memory: '512MiB' }, async (request) => {
  const input = validatedInput(request);
  await requireClubAdmin(input.clubId, input.uid);
  const context = await loadMergeContext(input);
  const { source, target, references } = context;
  const targetLocation = locationDetails(target);
  const db = admin.firestore();
  const auditRef = context.clubRef.collection('dive_location_merges').doc();

  // Lock the source before rewriting references. A failed or timed-out run can
  // be retried after 15 minutes; successful runs are permanently blocked by
  // merged_into_location_id.
  await db.runTransaction(async (transaction) => {
    const sourceSnap = await transaction.get(context.sourceSnap.ref);
    const current = sourceSnap.data() || {};
    if (current.merged_into_location_id) {
      throw new HttpsError('failed-precondition', 'Ce site a déjà été fusionné.');
    }
    const startedAt = current.merge_started_at?.toMillis?.() || 0;
    if (current.merge_status === 'running' && Date.now() - startedAt < RUNNING_MERGE_TTL_MS) {
      throw new HttpsError('aborted', 'Une fusion est déjà en cours pour ce site.');
    }
    transaction.set(context.sourceSnap.ref, {
      merge_status: 'running',
      merge_target_location_id: target.id,
      merge_started_at: FieldValue.serverTimestamp(),
      merge_started_by: input.uid,
    }, { merge: true });
    transaction.create(auditRef, {
      status: 'running',
      source_location_id: source.id,
      source_name: source.name || '',
      target_location_id: target.id,
      target_name: target.name || '',
      include_exact_name_entries: input.includeExactNameEntries,
      counts: publicCounts(references),
      requested_by: input.uid,
      created_at: FieldValue.serverTimestamp(),
    });
  });

  const writer = db.bulkWriter();

  for (const doc of references.operations) {
    const data = doc.data();
    const patch = { updated_at: FieldValue.serverTimestamp() };
    if (data.lieu_id === source.id) patch.lieu_id = target.id;
    if (data.location_id === source.id) patch.location_id = target.id;
    if (data.lieu === source.name) patch.lieu = target.name;
    writer.update(doc.ref, patch);
  }
  for (const doc of references.entries) {
    writer.update(doc.ref, { ...targetLocation, updated_at: FieldValue.serverTimestamp() });
  }
  if (input.includeExactNameEntries) {
    for (const doc of references.unlinkedExactNameEntries) {
      writer.update(doc.ref, { ...targetLocation, updated_at: FieldValue.serverTimestamp() });
    }
  }
  for (const doc of references.confirmations) {
    writer.update(doc.ref, {
      ...targetLocation,
      'dive_snapshot.location_id': target.id,
      'dive_snapshot.location_name': target.name,
      updated_at: FieldValue.serverTimestamp(),
    });
  }
  for (const doc of references.tasks) {
    writer.update(doc.ref, { 'context.location_id': target.id, updated_at: FieldValue.serverTimestamp() });
  }
  for (const doc of references.sessions) {
    const data = doc.data();
    const patch = { updated_at: FieldValue.serverTimestamp() };
    if (data.lieu_id === source.id) patch.lieu_id = target.id;
    if (data.location_id === source.id) patch.location_id = target.id;
    writer.update(doc.ref, patch);
  }

  try {
    await writer.close();
    // Archive only after every known reference has been rewritten. Keeping
    // finalisation in one transaction prevents an archived source with a
    // missing audit record or an unenriched target.
    await db.runTransaction(async (transaction) => {
      transaction.set(context.targetSnap.ref, {
        ...targetEnrichment(source, target),
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(context.sourceSnap.ref, {
        merged_into_location_id: target.id,
        available_for_events: false,
        merge_status: 'completed',
        merged_at: FieldValue.serverTimestamp(),
        merged_by: input.uid,
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(auditRef, {
        status: 'completed',
        completed_at: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  } catch (error) {
    await Promise.allSettled([
      context.sourceSnap.ref.set({
        merge_status: 'failed',
        merge_error: String(error?.message || error).slice(0, 500),
        merge_failed_at: FieldValue.serverTimestamp(),
      }, { merge: true }),
      auditRef.set({
        status: 'failed',
        error: String(error?.message || error).slice(0, 500),
        failed_at: FieldValue.serverTimestamp(),
      }, { merge: true }),
    ]);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'La fusion a échoué. Le site source n’a pas été supprimé.');
  }

  return {
    success: true,
    counts: {
      ...publicCounts(references),
      exactNameEntriesUpdated: input.includeExactNameEntries
        ? references.unlinkedExactNameEntries.length
        : 0,
    },
  };
});

module.exports = {
  publicCounts,
  targetEnrichment,
  previewDiveLocationMerge,
  mergeDiveLocations,
};
