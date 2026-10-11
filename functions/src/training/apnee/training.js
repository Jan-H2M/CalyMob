'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { createHash } = require('crypto');
const { isActiveMember } = require('../../utils/memberStatus');
const { parseDate } = require('../personalExerciseProgress');
const catalog = require('./catalog.json');
const tracks = catalog.tracks.map(t => t.key);
const hours = ['1ere_heure', '2eme_heure'];
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const enrollmentId = (memberId, track) => hash(`${memberId}:${track}`);
const participationId = (sessionId, lessonId, memberId) => hash(`${sessionId}:${lessonId}:${memberId}`);
const isAdmin = member => ['admin', 'superadmin'].includes(member.app_role);
const poolRoles = ['encadrant', 'encadrants', 'e', 'encadrant carrière', 'piscine', 'p',
  'encadrants et assistants', 'encadrant piscine'];
const mayPlan = member => isAdmin(member) || (member.clubStatuten || []).some(
  role => poolRoles.includes(String(role).trim().toLowerCase()));
const fail = (code, message) => { throw new HttpsError(code, message); };
const normalized = value => value?.toMillis ? value.toMillis() : Array.isArray(value)
  ? value.map(normalized) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(k => [k, normalized(value[k])])) : value;
const equal = (a, b) => JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));

/** All writes are explicit, optimistic, idempotent and audited. No scanner,
 * SCUBA snapshot, financial document or brevet is inferred from an enrolment. */
async function executeApnee(db, uid, input) {
  if (!uid) fail('unauthenticated', 'Authentification requise.');
  const data = input || {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('invalid-argument', 'Objet requis.');
  const { clubId, action, operationId, expectedRevision } = data;
  if (![clubId, operationId].every(id) || !['enroll', 'lesson', 'result', 'award', 'attendance'].includes(action) ||
      !Number.isInteger(expectedRevision) || expectedRevision < 0)
    fail('invalid-argument', 'Action, identifiant et révision valides requis.');
  const club = db.collection('clubs').doc(clubId);
  const auditRef = club.collection('apnee_audit').doc(operationId);
  // Reject undeclared payload fields: an audit replay cannot hide new intent.
  const fields = {
    enroll: ['memberId', 'track', 'status'],
    lesson: ['sessionId', 'lessonId', 'track', 'hour', 'theme', 'memberIds', 'instructorIds'],
    result: ['memberId', 'track', 'requirementKey', 'status', 'date', 'validatorName', 'validatorFederation', 'qualificationConfirmed'],
    award: ['memberId', 'track', 'award', 'date', 'validatorName', 'validatorFederation', 'qualificationConfirmed'],
    attendance: ['memberId', 'sessionId', 'lessonId', 'status', 'note'],
  };
  if (Object.keys(data).some(key => !['clubId', 'action', 'operationId', 'expectedRevision', ...fields[action]].includes(key)))
    fail('invalid-argument', 'Champ non reconnu.');
  const requested = JSON.parse(JSON.stringify(data));
  return db.runTransaction(async tx => {
    const actor = await tx.get(club.collection('members').doc(uid));
    if (!actor.exists || !isActiveMember(actor.data())) fail('permission-denied', 'Membre actif requis.');
    if (['enroll', 'result', 'award'].includes(action) && !isAdmin(actor.data()))
      fail('permission-denied', 'Enregistrement officiel réservé aux administrateurs.');
    if (action === 'lesson' && !mayPlan(actor.data())) fail('permission-denied', 'Encadrant piscine requis.');
    const event = await tx.get(auditRef);
    if (event.exists) {
      if (event.data().actor_uid !== uid || !equal(event.data().requested, requested))
        fail('already-exists', 'Identifiant déjà utilisé pour une autre modification.');
      return { saved: true, replay: true, revision: event.data().revision };
    }
    let ref, before, after;
    const additional = [];
    if (['enroll', 'result', 'award'].includes(action)) {
      if (!id(data.memberId) || !tracks.includes(data.track)) fail('invalid-argument', 'Membre et trajectoire requis.');
      const member = await tx.get(club.collection('members').doc(data.memberId));
      if (!member.exists || !isActiveMember(member.data())) fail('failed-precondition', 'Membre actif requis.');
      const enrollmentRef = club.collection('apnee_enrollments').doc(enrollmentId(data.memberId, data.track));
      const enrollment = await tx.get(enrollmentRef);
      if (action === 'enroll') {
        if (!['active', 'closed'].includes(data.status)) fail('invalid-argument', 'Statut requis.');
        ref = enrollmentRef;
        before = enrollment.exists ? enrollment.data() : null;
        after = { member_id: data.memberId, track: data.track, status: data.status,
          enrolled_at: before?.enrolled_at || FieldValue.serverTimestamp() };
      } else {
        if (!enrollment.exists) fail('failed-precondition', 'Inscription apnée requise.');
        // An administrator records an explicitly identified qualified instructor's
        // signed-card result. A SCUBA monitor role alone grants no apnée validation.
        if (typeof data.validatorName !== 'string' || !data.validatorName.trim() || data.validatorName.length > 160 ||
            !['LIFRAS', 'NELOS'].includes(data.validatorFederation) || data.qualificationConfirmed !== true)
          fail('invalid-argument', 'Instructeur LIFRAS/NELOS et confirmation explicite requis.');
        const date = parseDate(data.date);
        let requirement = null;
        if (action === 'result') {
          requirement = catalog.requirements.find(r => r.key === data.requirementKey && r.track === data.track);
          if (!requirement || !['validated', 'refused', 'not_recorded'].includes(data.status))
            fail('invalid-argument', 'Exigence et résultat du référentiel requis.');
          ref = enrollmentRef.collection('requirements').doc(requirement.key);
        } else {
          const track = catalog.tracks.find(t => t.key === data.track);
          if (!track.possibleAwards.includes(data.award)) fail('invalid-argument', 'Brevet apnée incompatible.');
          ref = enrollmentRef.collection('awards').doc(data.award);
        }
        const previous = await tx.get(ref);
        before = previous.exists ? previous.data() : null;
        after = { member_id: data.memberId, track: data.track,
          ...(requirement ? { requirement_key: requirement.key, requirement, setting: requirement.setting, status: data.status }
            : { award: data.award }),
          validated_at: date, validated_by: data.validatorName.trim(), validator_federation: data.validatorFederation,
          qualification_attested_by: uid, catalog_id: catalog.catalogId, source_version: catalog.sourceVersion,
          source: 'signed_card_recorded_by_admin' };
      }
    } else {
      if (!id(data.sessionId) || !id(data.lessonId)) fail('invalid-argument', 'Séance et cours requis.');
      const sessionRef = club.collection('piscine_sessions').doc(data.sessionId);
      const session = await tx.get(sessionRef);
      if (!session.exists || session.data().type === 'theorie' || !session.data().date?.toMillis ||
          !Number.isFinite(session.data().date.toMillis())) fail('failed-precondition', 'Séance piscine datée requise.');
      const lessonRef = sessionRef.collection('apnee_lessons').doc(data.lessonId);
      const lesson = await tx.get(lessonRef);
      if (action === 'lesson') {
        if (!tracks.includes(data.track) || !hours.includes(data.hour) || typeof data.theme !== 'string' || data.theme.length > 500 ||
            !Array.isArray(data.memberIds) || !Array.isArray(data.instructorIds) ||
            data.memberIds.length > 60 || data.instructorIds.length > 10 ||
            ![...data.memberIds, ...data.instructorIds].every(id) ||
            new Set(data.memberIds).size !== data.memberIds.length || new Set(data.instructorIds).size !== data.instructorIds.length)
          fail('invalid-argument', 'Cours, horaire et participants valides requis.');
        if (lesson.exists && (lesson.data().track !== data.track || lesson.data().hour !== data.hour))
          fail('failed-precondition', 'Gardez le trajet et le créneau du cours existant.');
        const parallel = await tx.get(sessionRef.collection('apnee_lessons').where('hour', '==', data.hour));
        if (parallel.docs.some(doc => doc.id !== data.lessonId &&
            (doc.data().member_ids || []).some(memberId => data.memberIds.includes(memberId))))
          fail('failed-precondition', 'Un élève ne peut pas suivre deux cours apnée au même créneau. Retirez-le du premier cours.');
        const members = await Promise.all(data.memberIds.map(async memberId => {
          const m = await tx.get(club.collection('members').doc(memberId));
          const e = await tx.get(club.collection('apnee_enrollments').doc(enrollmentId(memberId, data.track)));
          const historical = lesson.exists && lesson.data().member_ids.includes(memberId) && session.data().date.toMillis() < Date.now();
          if (!m.exists || !isActiveMember(m.data()) || !e.exists || (!historical && e.data().status !== 'active'))
            fail('failed-precondition', 'Chaque élève doit être inscrit et actif dans ce trajet.');
          return memberId;
        }));
        for (const instructorId of data.instructorIds) {
          const m = await tx.get(club.collection('members').doc(instructorId));
          if (!m.exists || !isActiveMember(m.data()) || !mayPlan(m.data()))
            fail('failed-precondition', 'Encadrant actif requis.');
        }
        ref = lessonRef; before = lesson.exists ? lesson.data() : null;
        after = { session_id: data.sessionId, track: data.track, hour: data.hour, theme: data.theme.trim(),
          member_ids: members, instructor_ids: data.instructorIds, session_date: session.data().date };
        // Materialize the concrete roster only, not every enrolled member.
        // Retain corrections/absences when a theme or instructor is changed.
        for (const memberId of new Set([...(before?.member_ids || []), ...members])) {
          const pRef = club.collection('apnee_participations').doc(participationId(data.sessionId, data.lessonId, memberId));
          const previous = await tx.get(pRef);
          const old = previous.exists ? previous.data() : {};
          additional.push([pRef, { ...old, member_id: memberId, session_id: data.sessionId, course_id: data.lessonId,
            track: data.track, hour: data.hour, theme: after.theme, instructor_ids: data.instructorIds,
            session_date: session.data().date, source: old.source || 'roster_inferred',
            participation_status: members.includes(memberId)
              ? (['absent', 'attended'].includes(old.participation_status) ? old.participation_status : 'rostered') : 'cancelled',
            revision: (old.revision || 0) + 1 }]);
        }
      } else {
        if (!lesson.exists || !id(data.memberId) || !['attended', 'absent'].includes(data.status))
          fail('invalid-argument', 'Cours existant, membre et participation requis.');
        const own = uid === data.memberId;
        if (!own && !mayPlan(actor.data())) fail('permission-denied', 'Votre propre séance ou un encadrant requis.');
        const member = await tx.get(club.collection('members').doc(data.memberId));
        if (!member.exists || !isActiveMember(member.data())) fail('failed-precondition', 'Membre actif requis.');
        if (session.data().date.toMillis() > Date.now()) fail('failed-precondition', 'Séance future.');
        const enrollment = await tx.get(club.collection('apnee_enrollments').doc(enrollmentId(data.memberId, lesson.data().track)));
        if (!enrollment.exists || enrollment.data().status !== 'active') fail('failed-precondition', 'Inscription apnée active requise.');
        if (own) {
          const attendee = await tx.get(sessionRef.collection('attendees').doc(uid));
          const receipt = await tx.get(sessionRef.collection('qr_scan_receipts').doc(uid));
          const proof = receipt.exists ? receipt.data() : null;
          const row = attendee.exists ? attendee.data() : {};
          const scannedAt = row.scannedAt?.toMillis?.();
          if (!attendee.exists || !proof || proof.version !== 1 || proof.memberId !== uid ||
              proof.sessionId !== data.sessionId || row.memberId !== uid || row.isGuest === true ||
              (row.membre_id != null && row.membre_id !== uid) || !Number.isFinite(scannedAt) ||
              proof.scannerUid !== row.scannedBy || proof.scannedAt?.toMillis?.() !== scannedAt ||
              !equal(row.qrVerified, proof))
            fail('permission-denied', 'Présence QR vérifiée requise.');
        }
        ref = club.collection('apnee_participations').doc(participationId(data.sessionId, data.lessonId, data.memberId));
        const previous = await tx.get(ref);
        before = previous.exists ? previous.data() : null;
        if (!before || before.participation_status === 'cancelled' || !lesson.data().member_ids.includes(data.memberId))
          fail('failed-precondition', 'Participation active à ce cours requise.');
        if (typeof data.note !== 'string' || data.note.length > 2000) fail('invalid-argument', 'Remarque invalide.');
        after = { ...before, session_date: session.data().date, participation_status: data.status,
          source: own ? 'qr_verified_member_correction' : 'manual_verified',
          note: data.note.trim(), recorded_by: uid };
      }
    }
    if ((before?.revision || 0) !== expectedRevision) fail('aborted', 'Données modifiées. Rechargez avant de corriger.');
    const revision = expectedRevision + 1;
    after = { ...after, revision, updated_at: FieldValue.serverTimestamp(), recorded_by: uid };
    tx.set(ref, after);
    for (const [target, value] of additional) tx.set(target, { ...value, updated_at: FieldValue.serverTimestamp() });
    tx.create(auditRef, { actor_uid: uid, action, requested, before: before || null, after,
      revision, created_at: FieldValue.serverTimestamp(), source: 'apnee_training' });
    return { saved: true, replay: false, revision };
  });
}

exports.manageApneeTraining = onCall({ region: 'europe-west1' }, request =>
  executeApnee(admin.firestore(), request.auth?.uid, request.data));
exports.executeApnee = executeApnee;
exports.enrollmentId = enrollmentId;
exports.participationId = participationId;
exports.mayPlan = mayPlan;
