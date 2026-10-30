'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { createHash } = require('crypto');
const { isActiveMember } = require('../utils/memberStatus');
const { parseDate, exerciseKind } = require('./personalExerciseProgress');

const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const levels = { '1': 'Plongeur 1★', '2': 'Plongeur 2★', '3': 'Plongeur 3★', '4': 'Plongeur 4★',
  AM: 'Assistant Moniteur', MC: 'Moniteur Club', MF: 'Moniteur Fédéral', MN: 'Moniteur National' };
const examRecordId = code => `official_exam_${createHash('sha256').update(code).digest('hex')}`;

async function executeOfficialResult(db, uid, data) {
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const { clubId, memberId, kind, operationId, date, exerciseId, passed, level, expectedRevision, expectedLevel } = data || {};
  if (![clubId, memberId, operationId].every(validId) || !['exam', 'brevet'].includes(kind))
    throw new HttpsError('invalid-argument', 'Membre et type de résultat valides requis.');
  const effectiveDate = parseDate(date);
  if (kind === 'exam' && (!validId(exerciseId) || typeof passed !== 'boolean' || !Number.isInteger(expectedRevision) || expectedRevision < 0))
    throw new HttpsError('invalid-argument', 'Examen, résultat et révision requis.');
  if (kind === 'brevet' && (!Object.hasOwn(levels, level) || typeof expectedLevel !== 'string'))
    throw new HttpsError('invalid-argument', 'Brevet et niveau initial requis.');
  const club = db.collection('clubs').doc(clubId);
  const memberRef = club.collection('members').doc(memberId);
  const eventRef = memberRef.collection('formation_admin_audit').doc(operationId);
  const requested = kind === 'exam' ? { kind, exerciseId, passed, date } : { kind, level, date };
  return db.runTransaction(async tx => {
    const actor = await tx.get(club.collection('members').doc(uid));
    if (!actor.exists || !isActiveMember(actor.data()) || !['admin', 'superadmin'].includes(actor.data().app_role))
      throw new HttpsError('permission-denied', 'Administration de la formation réservée aux administrateurs actifs.');
    const member = await tx.get(memberRef);
    if (!member.exists) throw new HttpsError('not-found', 'Membre introuvable.');
    const priorEvent = await tx.get(eventRef);
    if (priorEvent.exists) {
      if (priorEvent.data().actorUid !== uid || JSON.stringify(priorEvent.data().requested) !== JSON.stringify(requested))
        throw new HttpsError('already-exists', 'Identifiant déjà utilisé.');
      return { saved: true, replay: true };
    }
    let before, after;
    if (kind === 'exam') {
      const exercise = await tx.get(club.collection('exercices_lifras').doc(exerciseId));
      if (!exercise.exists || !/\.(EXT|EXP|T)$/.test(String(exercise.data().code || '').toUpperCase()) ||
          exerciseKind(exercise.data()) === 'natural')
        throw new HttpsError('failed-precondition', 'Examen du référentiel requis, pas une simple séance.');
      const ref = memberRef.collection('exercices_valides').doc(examRecordId(exercise.data().code));
      const existing = await tx.get(ref);
      before = existing.exists ? existing.data() : null;
      if ((before?.revision || 0) !== expectedRevision) throw new HttpsError('aborted', 'Résultat modifié. Rechargez.');
      after = { exercice_id: exerciseId, exercice_code: exercise.data().code,
        exercice_description: exercise.data().description || '', exercice_niveau: exercise.data().niveau,
        status: passed ? 'validated' : 'refused', date_validation: effectiveDate,
        moniteur_id: uid, moniteur_nom: `${actor.data().prenom || ''} ${actor.data().nom || ''}`.trim(),
        created_by: uid, declared_by_member: false, source: 'formation_admin', revision: expectedRevision + 1,
        created_at: before?.created_at || FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() };
      tx.set(ref, after);
    } else {
      before = { level: member.data().plongeur_code || '' };
      if (before.level !== expectedLevel) throw new HttpsError('aborted', 'Niveau du membre modifié. Rechargez.');
      after = { level, effective_date: effectiveDate };
      tx.create(memberRef.collection('brevet_history').doc(`official_${operationId}`), {
        level, previous_level: before.level, effective_date: effectiveDate, from: 'formation_admin',
        recorded_by: uid, recorded_at: FieldValue.serverTimestamp(), operationId });
      tx.update(memberRef, { plongeur_code: level, plongeur_niveau: levels[level],
        formation_official_operation: operationId });
    }
    tx.create(eventRef, { memberId, actorUid: uid, actorName: `${actor.data().prenom || ''} ${actor.data().nom || ''}`.trim(), createdAt: FieldValue.serverTimestamp(), requested, before, after,
      source: 'calycompta_member_formation' });
    return { saved: true, replay: false };
  });
}

exports.recordOfficialFormationResult = onCall({ region: 'europe-west1' }, request =>
  executeOfficialResult(admin.firestore(), request.auth?.uid, request.data));
exports.executeOfficialResult = executeOfficialResult;
exports.examRecordId = examRecordId;
