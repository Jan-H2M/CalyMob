'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {
  buildPoolFormationDto,
  hasPoolFormationAccess,
} = require('./poolFormationProjection');

const REGION = 'europe-west1';

async function getPoolFormationOverviewHandler(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');

  const clubId = String(request.data && request.data.clubId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(clubId)) {
    throw new HttpsError('invalid-argument', 'Club invalide.');
  }

  const db = admin.firestore();
  const clubRef = db.collection('clubs').doc(clubId);
  const caller = await clubRef.collection('members').doc(uid).get();
  if (!caller.exists || !hasPoolFormationAccess(caller.data())) {
    throw new HttpsError(
      'permission-denied',
      'Accès au suivi piscine non autorisé.',
    );
  }

  const [snapshotQuery, directoryQuery] = await Promise.all([
    db.collectionGroup('formation_snapshot').get(),
    clubRef.collection('member_directory').get(),
  ]);
  const directoryById = new Map(
    directoryQuery.docs.map((doc) => [doc.id, doc.data() || {}]),
  );
  const clubPrefix = `clubs/${clubId}/members/`;
  const students = [];
  for (const doc of snapshotQuery.docs) {
    if (!doc.ref.path.startsWith(clubPrefix)) continue;
    const snapshot = doc.data() || {};
    const memberId = String(snapshot.member_id || '').trim();
    if (!memberId) continue;
    const directory = directoryById.get(memberId);
    if (!directory) continue;
    students.push(buildPoolFormationDto(snapshot, directory));
  }
  students.sort((a, b) => {
    const first = a.identity.first_name.localeCompare(
      b.identity.first_name,
      'fr',
      { sensitivity: 'base' },
    );
    return first || a.identity.last_name.localeCompare(
      b.identity.last_name,
      'fr',
      { sensitivity: 'base' },
    );
  });
  return { students };
}

const getPoolFormationOverviewV1 = onCall(
  { region: REGION, timeoutSeconds: 60, memory: '256MiB' },
  getPoolFormationOverviewHandler,
);

module.exports = {
  getPoolFormationOverviewHandler,
  getPoolFormationOverviewV1,
};
