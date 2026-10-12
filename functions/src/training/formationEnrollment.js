'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { isActiveMember } = require('../utils/memberStatus');
const { excludedFromDirectory } = require('../privacy/memberDirectoryVisibility');
const { enrollmentId } = require('./apnee/training');
const tracks = ['scuba', 'apnee.a1', 'apnee.a2'];
const levels = ['1*', '2*', '3*', '4*', 'AM', 'MC', 'MF', 'MN'];
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const fail = (code, message) => { throw new HttpsError(code, message); };

/** Administrative current training, NOT a brevet, exam, QR scan or result.
 * A switch is explicit and atomic across both disciplines; no backfill. */
async function executeFormationEnrollment(db, uid, input) {
  if (!uid) fail('unauthenticated', 'Authentification requise.');
  const data = input || {};
  if (typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).some(key => !['clubId', 'memberId', 'operationId', 'expectedRevision', 'track', 'targetLevel', 'active'].includes(key)) ||
      ![data.clubId, data.memberId, data.operationId].every(validId) || !tracks.includes(data.track) ||
      typeof data.active !== 'boolean' || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0 ||
      (data.track === 'scuba' ? !levels.includes(data.targetLevel) : data.targetLevel !== undefined))
    fail('invalid-argument', 'Inscription, brevet et révision valides requis.');
  const requested = JSON.parse(JSON.stringify(data));
  const club = db.collection('clubs').doc(data.clubId);
  const audit = club.collection('formation_enrollment_audit').doc(data.operationId);
  const memberRef = club.collection('members').doc(data.memberId);
  const directoryRef = club.collection('member_directory').doc(data.memberId);
  return db.runTransaction(async tx => {
    const actor = await tx.get(club.collection('members').doc(uid));
    if (!actor.exists || !isActiveMember(actor.data()) || !['admin', 'superadmin'].includes(actor.data().app_role))
      fail('permission-denied', 'Administrateur actif requis.');
    const previousEvent = await tx.get(audit);
    if (previousEvent.exists) {
      const old = previousEvent.data();
      if (old.actor_uid !== uid || Object.keys(requested).length !== Object.keys(old.requested || {}).length ||
          Object.keys(requested).some(key => old.requested[key] !== requested[key]))
        fail('already-exists', 'Identifiant déjà utilisé pour une autre modification.');
      return { saved: true, replay: true, revision: old.revision };
    }
    const member = await tx.get(memberRef);
    const directory = await tx.get(directoryRef);
    if (!member.exists || !directory.exists || !isActiveMember(member.data()) || excludedFromDirectory(member.data()))
      fail('failed-precondition', 'Membre actif et visible requis.');
    const current = member.data();
    if ((current.formation_revision || 0) !== data.expectedRevision)
      fail('aborted', 'Inscription modifiée. Rechargez avant de réessayer.');
    const apnee = {};
    for (const track of tracks.slice(1)) {
      const ref = club.collection('apnee_enrollments').doc(enrollmentId(data.memberId, track));
      const snapshot = await tx.get(ref);
      apnee[track] = { ref, before: snapshot.exists ? snapshot.data() : null };
    }
    const revision = data.expectedRevision + 1;
    const patch = {
      formation_active: data.active && data.track === 'scuba' ? true
        : data.track === 'scuba' || data.active ? false : current.formation_active === true,
      ...(data.track === 'scuba' ? { target_formation_level: data.targetLevel } : {}),
      formation_revision: revision,
      updated_at: FieldValue.serverTimestamp(),
    };
    const changes = {};
    for (const [track, row] of Object.entries(apnee)) {
      const selected = track === data.track;
      const desiredActive = data.active ? selected : selected ? false : row.before?.status === 'active';
      if (desiredActive || row.before?.status === 'active') {
        const after = { ...(row.before || {}), member_id: data.memberId, track,
          status: desiredActive ? 'active' : 'closed', revision: (row.before?.revision || 0) + 1,
          enrolled_at: row.before?.enrolled_at || FieldValue.serverTimestamp(),
          recorded_by: uid, updated_at: FieldValue.serverTimestamp() };
        changes[track.replace('.', '_')] = { path: row.ref.path, before: row.before, after };
      }
    }
    const active = [
      ...(patch.formation_active ? ['scuba'] : []),
      ...Object.entries(apnee).filter(([track, row]) =>
        (changes[track.replace('.', '_')]?.after.status || row.before?.status) === 'active').map(([track]) => track),
    ];
    if (active.length > 1) fail('failed-precondition', 'Choisissez explicitement la seule formation active à conserver.');
    patch.formation_track = active[0] || null;
    tx.update(memberRef, patch);
    // Atomic safe metadata projection; the normal projection trigger preserves
    // these same fields and all privacy/QA-directory filtering.
    tx.update(directoryRef, { formation_active: patch.formation_active,
      target_formation_level: patch.target_formation_level ?? current.target_formation_level ?? null,
      formation_revision: revision, formation_track: patch.formation_track });
    for (const row of Object.values(changes)) tx.set(db.doc(row.path), row.after);
    tx.create(audit, { actor_uid: uid, action: 'formation_enrollment', member_id: data.memberId,
      requested, revision, created_at: FieldValue.serverTimestamp(),
      before: { formation_active: current.formation_active === true,
        target_formation_level: current.target_formation_level || null,
        formation_track: current.formation_track || null, formation_revision: current.formation_revision || 0 },
      after: patch, related_changes: changes, source: 'server_formation_enrollment' });
    return { saved: true, replay: false, revision };
  });
}

exports.manageFormationEnrollment = onCall({ region: 'europe-west1' }, request =>
  executeFormationEnrollment(admin.firestore(), request.auth?.uid, request.data));
exports.executeFormationEnrollment = executeFormationEnrollment;
