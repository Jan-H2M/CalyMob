'use strict';
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { isActiveMember } = require('../utils/memberStatus');
const { excludedFromDirectory } = require('../privacy/memberDirectoryVisibility');
const { enrollmentId, participationId } = require('./apnee/training');
const millis = value => value?.toMillis?.();
const tracks = ['apnee.a1', 'apnee.a2'];

function verifiedQr(attendee, receipt, memberId, sessionId) {
  const proof = attendee?.qrVerified;
  return !!proof && receipt?.version === 1 && receipt.memberId === memberId && receipt.sessionId === sessionId &&
    attendee.memberId === memberId && attendee.isGuest !== true &&
    (!attendee.membre_id || attendee.membre_id === memberId) && attendee.scannedBy === receipt.scannerUid &&
    Number.isFinite(millis(receipt.scannedAt)) && millis(receipt.scannedAt) === millis(attendee.scannedAt) &&
    Object.keys(receipt).length === Object.keys(proof).length && Object.keys(receipt).every(key =>
      key === 'scannedAt' ? millis(receipt[key]) === millis(proof[key]) : receipt[key] === proof[key]);
}

/** Only a newly issued server QR receipt can initiate automatic placement.
 * Never infer participation from enrollment, scan timestamps or a planned roster.
 * Legacy conflicts/parallel courses require a human choice; no backfill. */
async function assignQrTrainingGroup(db, clubId, sessionId, memberId) {
  const club = db.collection('clubs').doc(clubId);
  const sessionRef = club.collection('piscine_sessions').doc(sessionId);
  return db.runTransaction(async tx => {
    const member = await tx.get(club.collection('members').doc(memberId));
    const session = await tx.get(sessionRef);
    const attendeeRef = sessionRef.collection('attendees').doc(memberId);
    const attendee = await tx.get(attendeeRef);
    const receipt = await tx.get(sessionRef.collection('qr_scan_receipts').doc(memberId));
    const auditRef = sessionRef.collection('qr_training_assignments').doc(memberId);
    const audit = await tx.get(auditRef);
    if (audit.exists) return { assigned: false, reason: 'already-processed' };
    if (!member.exists || !isActiveMember(member.data()) || excludedFromDirectory(member.data()) ||
        !session.exists || session.data().type === 'theorie' || !Number.isFinite(millis(session.data().date)) ||
        !verifiedQr(attendee.data(), receipt.data(), memberId, sessionId)) return { assigned: false, reason: 'no-proof' };
    const enrolled = [];
    for (const track of tracks) {
      const row = await tx.get(club.collection('apnee_enrollments').doc(enrollmentId(memberId, track)));
      if (row.data()?.status === 'active') enrolled.push(track);
    }
    const current = member.data();
    if (enrolled.length + (current.formation_active === true ? 1 : 0) !== 1)
      return { assigned: false, reason: 'no-sole-training' };
    if (!enrolled.length) return { assigned: false, reason: 'scuba' };
    const row = attendee.data();
    // Preserve explicit per-session corrections, including reports from older apps.
    if (row.assignedLevel || row.assignedCourseId || row.assignedToMemberId || row.hoursReport || row.sentToReserve)
      return { assigned: false, reason: 'manual-placement' };
    const planned = await tx.get(sessionRef.collection('apnee_lessons').where('track', '==', enrolled[0]));
    const candidates = planned.docs;
    // A single course is unambiguous. Multiple hours/parallel groups are not
    // guessed: a monitor chooses the actual course in Participants.
    if (candidates.length !== 1) return { assigned: false, reason: 'course-choice-required' };
    const lesson = candidates[0];
    const lessonData = lesson.data();
    const participationRef = club.collection('apnee_participations').doc(participationId(sessionId, lesson.id, memberId));
    const previous = await tx.get(participationRef);
    if (previous.exists && previous.data().source !== 'roster_inferred')
      return { assigned: false, reason: 'historical-correction' };
    const assignment = { assignedLevel: enrolled[0], assignedCourseId: lesson.id,
      assignmentSource: 'verified_qr_training', assignedAt: FieldValue.serverTimestamp() };
    tx.update(attendeeRef, assignment);
    tx.update(lesson.ref, { member_ids: [...new Set([...(lessonData.member_ids || []), memberId])],
      revision: (lessonData.revision || 0) + 1, updated_at: FieldValue.serverTimestamp() });
    tx.set(participationRef, { ...(previous.data() || {}), member_id: memberId, session_id: sessionId,
      course_id: lesson.id, track: enrolled[0], hour: lessonData.hour, theme: lessonData.theme || '',
      instructor_ids: lessonData.instructor_ids || [], session_date: session.data().date,
      source: 'verified_qr_training', participation_status: 'attended',
      revision: (previous.data()?.revision || 0) + 1 });
    tx.create(auditRef, { member_id: memberId, track: enrolled[0], course_id: lesson.id,
      formation_revision: current.formation_revision || 0, receipt: receipt.data(),
      before: { assignedLevel: row.assignedLevel || null, assignedCourseId: row.assignedCourseId || null },
      after: assignment, source: 'verified_qr_training', created_at: FieldValue.serverTimestamp() });
    return { assigned: true, track: enrolled[0], courseId: lesson.id };
  });
}
exports.onQrTrainingGroupCreated = onDocumentCreated({ region: 'europe-west1',
  document: 'clubs/{clubId}/piscine_sessions/{sessionId}/qr_scan_receipts/{memberId}' }, event => {
  const { clubId, sessionId, memberId } = event.params;
  return assignQrTrainingGroup(admin.firestore(), clubId, sessionId, memberId);
});
exports.assignQrTrainingGroup = assignQrTrainingGroup;
exports.verifiedQr = verifiedQr;
