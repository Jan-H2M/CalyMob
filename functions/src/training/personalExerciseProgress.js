'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { createHash } = require('crypto');
const { isActiveMember } = require('../utils/memberStatus');

const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const digest = value => createHash('sha256').update(value).digest('hex');
function parseDate(value, now = Date.now()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new HttpsError('invalid-argument', 'Date valide requise.');
  const ms = Date.parse(`${value}T12:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value ||
      value > new Date(now).toISOString().slice(0, 10))
    throw new HttpsError('invalid-argument', 'La date ne peut pas être future ou invalide.');
  return Timestamp.fromMillis(ms);
}
function exerciseKind(exercise) {
  const code = String(exercise.code || '').toUpperCase();
  const text = String(exercise.description || '').toLowerCase();
  if (/\.(EXT|T)$/.test(code) || /théori|theori/.test(text)) return 'theory';
  if (/\.EXP$/.test(code) || /piscine|pool/.test(text)) return 'pool';
  return 'natural';
}
function targetNiveau(member) {
  const explicit = String(member.target_formation_level || '').trim().toUpperCase().replaceAll('★', '*');
  const targets = { '1': 'NB', '1*': 'NB', P1: 'NB', NB: 'NB', '2': 'P2', '2*': 'P2', P2: 'P2',
    '3': 'P3', '3*': 'P3', P3: 'P3', '4': 'P4', '4*': 'P4', P4: 'P4', AM: 'AM', MC: 'MC', MF: 'MF', MN: 'MN' };
  if (targets[explicit]) return targets[explicit];
  if (explicit) return null;
  const current = String(member.plongeur_code || '').trim().toUpperCase();
  return { NB: 'NB', '1': 'P2', '1*': 'P2', P1: 'P2', '2': 'P3', '2*': 'P3', P2: 'P3', '3': 'P4', '3*': 'P4', P3: 'P4', '4': 'AM', '4*': 'AM', P4: 'AM', AM: 'MC', MC: 'MF', MF: 'MN' }[current] || null;
}
function progressId(uid, exerciseId) { return `personal_${digest(`${uid}:${exerciseId}`)}`; }

async function executePersonalProgress(db, uid, data) {
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const { clubId, memberId, exerciseId, done, date, expectedRevision, operationId } = data || {};
  if (![clubId, memberId, exerciseId, operationId].every(id) || typeof done !== 'boolean' ||
      !Number.isInteger(expectedRevision) || expectedRevision < 0)
    throw new HttpsError('invalid-argument', 'Exercice et révision valides requis.');
  if (uid !== memberId) throw new HttpsError('permission-denied', 'Uniquement vos propres exercices.');
  const performedDate = done ? parseDate(date) : null;
  const club = db.collection('clubs').doc(clubId);
  const rowRef = club.collection('exercise_claims').doc(progressId(uid, exerciseId));
  const eventRef = rowRef.collection('progress_history').doc(operationId);
  return db.runTransaction(async tx => {
    const actor = await tx.get(club.collection('members').doc(uid));
    if (!actor.exists || !isActiveMember(actor.data()))
      throw new HttpsError('permission-denied', 'Membre actif requis.');
    const exercise = await tx.get(club.collection('exercices_lifras').doc(exerciseId));
    const actorTarget = targetNiveau(actor.data());
    const catalogTarget = exercise.exists ? targetNiveau({ target_formation_level: exercise.data().niveau }) : null;
    if (!actorTarget || !catalogTarget || !exercise.exists || exerciseKind(exercise.data()) !== 'natural' ||
        catalogTarget !== actorTarget)
      throw new HttpsError('failed-precondition', 'Épreuve en milieu naturel de votre brevet visé requise.');
    const event = await tx.get(eventRef);
    const requested = { exerciseId, done, date: done ? date : null };
    if (event.exists) {
      if (event.data().actorUid !== uid || JSON.stringify(event.data().requested) !== JSON.stringify(requested))
        throw new HttpsError('already-exists', 'Identifiant de modification déjà utilisé.');
      return { saved: true, replay: true, revision: event.data().revision };
    }
    const row = await tx.get(rowRef);
    const before = row.exists ? row.data() : null;
    if (before && (before.member_id !== uid || before.validation_mode !== 'personal_only' || !before.server_verified))
      throw new HttpsError('failed-precondition', 'Enregistrement personnel ambigu.');
    if ((before?.revision || 0) !== expectedRevision)
      throw new HttpsError('aborted', 'Votre suivi a changé. Rechargez avant de corriger.');
    const revision = expectedRevision + 1;
    const patch = { member_id: uid, declared_by: uid, declared_by_member: true, server_verified: true,
      exercise_id: exerciseId, exercise_code: exercise.data().code, exercise_label: exercise.data().description || '',
      exercise_niveau: exercise.data().niveau, validation_mode: 'personal_only', context_type: 'personal_tracking',
      status: done ? 'personal_done' : 'personal_not_done', performed_date: performedDate,
      revision, updated_at: FieldValue.serverTimestamp(), created_at: before?.created_at || FieldValue.serverTimestamp() };
    tx.set(rowRef, patch);
    tx.create(eventRef, { actorUid: uid, memberId: uid, createdAt: FieldValue.serverTimestamp(), revision, requested,
      before: before ? { done: before.status === 'personal_done', date: before.performed_date || null } : null,
      after: { done, date: performedDate }, source: 'calymob_personal_tracking' });
    // Never accept a claim or write exercices_valides, exams, observations or brevet fields.
    return { saved: true, replay: false, revision };
  });
}

exports.setPersonalExerciseProgress = onCall({ region: 'europe-west1' }, request =>
  executePersonalProgress(admin.firestore(), request.auth?.uid, request.data));
exports.executePersonalProgress = executePersonalProgress;
exports.exerciseKind = exerciseKind;
exports.targetNiveau = targetNiveau;
exports.parseDate = parseDate;
exports.progressId = progressId;
