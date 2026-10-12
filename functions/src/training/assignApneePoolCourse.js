'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { isActiveMember } = require('../utils/memberStatus');
const { participationId, mayPlan } = require('./apnee/training');
const { verifiedQr } = require('./assignQrTrainingGroup');
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const state = row => ({ assignedLevel: row?.assignedLevel || null, assignedCourseId: row?.assignedCourseId || null,
  assignedToMemberId: row?.assignedToMemberId || null, sentToReserve: row?.sentToReserve === true });
const same = (a, b) => Object.keys(a).every(key => a[key] === b?.[key]) && Object.keys(b || {}).length === Object.keys(a).length;
const fail = (code, message) => { throw new HttpsError(code, message); };

/** Actual dated course correction, NOT active enrollment or official validation.
 * Everyone needs real QR evidence; a member can correct only their own past
 * attendance. Server transaction maintains both roster and personal history. */
async function executeApneeCourseAssignment(db, uid, input) {
  const data = input || {};
  if (!uid) fail('unauthenticated', 'Authentification requise.');
  if (![data.clubId, data.sessionId, data.memberId, data.lessonId, data.operationId].every(validId) ||
      Object.keys(data).some(key => !['clubId', 'sessionId', 'memberId', 'lessonId', 'operationId', 'expectedState'].includes(key)))
    fail('invalid-argument', 'Séance, élève et cours existant requis.');
  const club = db.collection('clubs').doc(data.clubId);
  const sessionRef = club.collection('piscine_sessions').doc(data.sessionId);
  const auditRef = sessionRef.collection('apnee_group_corrections').doc(data.operationId);
  return db.runTransaction(async tx => {
    const actor = await tx.get(club.collection('members').doc(uid));
    if (!actor.exists || !isActiveMember(actor.data()) || (uid !== data.memberId && !mayPlan(actor.data())))
      fail('permission-denied', 'Moniteur ou élève concerné requis.');
    const audit = await tx.get(auditRef);
    if (audit.exists) {
      if (audit.data().actor_uid !== uid || audit.data().member_id !== data.memberId || audit.data().course_id !== data.lessonId ||
          !same(audit.data().before, data.expectedState)) fail('already-exists', 'Identifiant déjà utilisé.');
      return { saved: true, replay: true };
    }
    const member = await tx.get(club.collection('members').doc(data.memberId));
    const session = await tx.get(sessionRef);
    const attendeeRef = sessionRef.collection('attendees').doc(data.memberId);
    const attendee = await tx.get(attendeeRef);
    const receipt = await tx.get(sessionRef.collection('qr_scan_receipts').doc(data.memberId));
    if (!member.exists || !isActiveMember(member.data()) || !session.exists || session.data().type === 'theorie' ||
        !Number.isFinite(session.data().date?.toMillis?.()) || session.data().date.toMillis() > Date.now() ||
        !verifiedQr(attendee.data(), receipt.data(), data.memberId, data.sessionId))
      fail('failed-precondition', 'Séance passée et présence QR vérifiée requises.');
    const before = state(attendee.data());
    if (!same(before, data.expectedState)) fail('aborted', 'Groupe modifié. Rechargez la séance.');
    const lessons = await tx.get(sessionRef.collection('apnee_lessons'));
    const chosen = lessons.docs.find(row => row.id === data.lessonId);
    if (!chosen || !['apnee.a1', 'apnee.a2'].includes(chosen.data().track)) fail('not-found', 'Cours apnée introuvable.');
    const updates = [];
    for (const lesson of lessons.docs) {
      if (lesson.id !== chosen.id && (lesson.data().hour !== chosen.data().hour ||
          !(lesson.data().member_ids || []).includes(data.memberId))) continue;
      const selected = lesson.id === chosen.id;
      const ref = club.collection('apnee_participations').doc(participationId(data.sessionId, lesson.id, data.memberId));
      const previous = await tx.get(ref);
      const old = previous.data() || {};
      updates.push({ lesson, ref, old, selected });
    }
    const after = { assignedLevel: chosen.data().track, assignedCourseId: chosen.id, assignedToMemberId: null, sentToReserve: false };
    tx.update(attendeeRef, after);
    for (const { lesson, ref, old, selected } of updates) {
      const ids = (lesson.data().member_ids || []).filter(id => id !== data.memberId);
      if (selected) ids.push(data.memberId);
      tx.update(lesson.ref, { member_ids: ids, revision: (lesson.data().revision || 0) + 1, updated_at: FieldValue.serverTimestamp() });
      tx.set(ref, { ...old, member_id: data.memberId, session_id: data.sessionId, course_id: lesson.id,
        track: lesson.data().track, hour: lesson.data().hour, theme: lesson.data().theme || '',
        instructor_ids: lesson.data().instructor_ids || [], session_date: session.data().date,
        participation_status: selected ? 'attended' : 'cancelled', source: 'qr_verified_group_correction',
        revision: (old.revision || 0) + 1 });
    }
    tx.create(auditRef, { actor_uid: uid, member_id: data.memberId, course_id: chosen.id,
      before, after, source: 'qr_verified_group_correction', created_at: FieldValue.serverTimestamp() });
    return { saved: true, replay: false };
  });
}
exports.assignApneePoolCourse = onCall({ region: 'europe-west1' }, request =>
  executeApneeCourseAssignment(admin.firestore(), request.auth?.uid, request.data));
exports.executeApneeCourseAssignment = executeApneeCourseAssignment;
