const crypto = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

const REGION = 'europe-west1';
const VALID_CONTEXT_TYPES = new Set(['pool', 'dive']);
const VALID_RESULTS = new Set(['accepted', 'corrected', 'rejected']);
const MONITOR_CODES = new Set(['MC', 'MF', 'MN']);
const ENCADRANT_STATUTES = new Set([
  'encadrant',
  'encadrants',
  'e',
]);

function cleanString(value, field, { max = 200, optional = false } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    if (optional) return null;
    throw new HttpsError('invalid-argument', `${field} est obligatoire.`);
  }
  if (text.length > max || text.includes('/')) {
    throw new HttpsError('invalid-argument', `${field} est invalide.`);
  }
  return text;
}

function memberName(member, fallback = 'Membre') {
  const firstName = String(member.prenom || member.first_name || '').trim();
  const lastName = String(member.nom || member.last_name || '').trim();
  const composed = `${firstName} ${lastName}`.trim();
  return String(member.displayName || member.display_name || composed || fallback).trim();
}

function isEligibleMonitor(member) {
  const code = String(member.plongeur_code || '').toUpperCase();
  const statuses = Array.isArray(member.clubStatuten)
    ? member.clubStatuten.map(value => String(value).toLowerCase())
    : [];
  return MONITOR_CODES.has(code) && statuses.some(value => ENCADRANT_STATUTES.has(value));
}

function canonicalClaimIdentity({
  memberId,
  exerciseId,
  contextType,
  contextEntryId,
  monitorId,
  taskId,
  entry,
}) {
  const isPoolEntry = entry.source === 'piscine';
  return {
    member_id: memberId,
    declared_by: memberId,
    declared_by_member: true,
    exercise_id: exerciseId,
    request_kind: 'student_evaluation',
    validation_mode: 'calypso_monitor',
    server_verified: true,
    context_type: contextType,
    context_entry_id: contextEntryId,
    logbook_entry_id: contextEntryId,
    monitor_id: monitorId,
    review_task_id: taskId,
    pool_session_id: isPoolEntry
      ? String(entry.session_id || contextEntryId)
      : null,
    operation_id: !isPoolEntry && entry.operation_id
      ? String(entry.operation_id)
      : null,
  };
}

function claimMatchesCanonicalIdentity(claim, canonical) {
  return Object.entries(canonical).every(([field, expected]) =>
    (claim[field] ?? null) === expected);
}

function taskMatchesCanonicalIdentity(task, { claimId, claim, taskId }) {
  const context = task && typeof task.context === 'object' ? task.context : {};
  const expectedStatus = VALID_RESULTS.has(String(claim.status || ''))
    ? 'done'
    : 'open';
  return task?.type === 'monitor_validation'
    && task?.status === expectedStatus
    && task?.member_id === claim.member_id
    && task?.current_assignee_id === claim.monitor_id
    && task?.current_assignee_type === 'monitor'
    && context.exercise_claim_id === claimId
    && context.logbook_entry_id === claim.context_entry_id
    && (context.pool_session_id ?? null) === (claim.pool_session_id ?? null)
    && (context.operation_id ?? null) === (claim.operation_id ?? null)
    && claim.review_task_id === taskId;
}

function buildEvaluationTask({ claimId, taskId, claim, now, existingTask = null }) {
  const decided = VALID_RESULTS.has(String(claim.status || ''));
  const task = {
    type: 'monitor_validation',
    status: decided ? 'done' : 'open',
    priority: 'normal',
    title: `Évaluer ${claim.exercise_code} · ${claim.member_name}`,
    member_id: claim.member_id,
    member_name: claim.member_name,
    current_assignee_id: claim.monitor_id,
    current_assignee_name: claim.monitor_name,
    current_assignee_type: 'monitor',
    context: {
      exercise_claim_id: claimId,
      exercise_code: claim.exercise_code,
      exercise_label: claim.exercise_label,
      logbook_entry_id: claim.context_entry_id,
      ...(claim.pool_session_id ? { pool_session_id: claim.pool_session_id } : {}),
      ...(claim.operation_id ? { operation_id: claim.operation_id } : {}),
    },
    available_actions: decided
      ? []
      : [{ key: 'open', label: 'Évaluer', target_screen: 'monitor_validation' }],
    notification_state: existingTask?.notification_state || { reminder_count: 0 },
    created_by: 'system',
    created_by_name: 'requestExerciseEvaluation',
    created_at: existingTask?.created_at || claim.created_at || now,
    updated_at: now,
  };
  if (decided) {
    task.completed_at = existingTask?.completed_at || claim.decision?.decided_at || now;
    task.completed_by = claim.decision?.decided_by || claim.monitor_id;
    task.completion_data = {
      decision: claim.status,
      claim_id: claimId,
      ...(claim.decision?.resulting_observation_id
        ? { observation_id: claim.decision.resulting_observation_id }
        : {}),
      ...(claim.decision?.revision
        ? { revision: claim.decision.revision }
        : {}),
    };
  }
  return task;
}

function evaluationIdentity({ memberId, exerciseId, contextEntryId, monitorId }) {
  return crypto
    .createHash('sha256')
    .update([memberId, exerciseId, contextEntryId, monitorId].join('|'))
    .digest('hex')
    .slice(0, 40);
}

function observationResult(status) {
  if (status === 'accepted') return 'acquis';
  if (status === 'corrected') return 'en_progres';
  return 'a_revoir';
}

function inferNiveauFromExerciseCode(code) {
  const match = String(code || '').match(/^P([1-4])/i);
  return match ? `${match[1]}*` : '';
}

const requestExerciseEvaluation = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');

  const clubId = cleanString(request.data?.clubId, 'clubId', { max: 80 });
  const exerciseId = cleanString(request.data?.exerciseId, 'exerciseId', { max: 120 });
  const contextEntryId = cleanString(request.data?.contextEntryId, 'contextEntryId', { max: 160 });
  const monitorId = cleanString(request.data?.monitorId, 'monitorId', { max: 160 });
  const contextType = cleanString(request.data?.contextType, 'contextType', { max: 20 });
  const notes = cleanString(request.data?.notes, 'notes', { max: 1000, optional: true });
  if (!VALID_CONTEXT_TYPES.has(contextType)) {
    throw new HttpsError('invalid-argument', 'Contexte d’évaluation invalide.');
  }

  const db = admin.firestore();
  const clubRef = db.collection('clubs').doc(clubId);
  const memberRef = clubRef.collection('members').doc(uid);
  const monitorRef = clubRef.collection('members').doc(monitorId);
  const exerciseRef = clubRef.collection('exercices_lifras').doc(exerciseId);
  const entryRef = clubRef.collection('student_logbook_entries').doc(contextEntryId);
  const identity = evaluationIdentity({ memberId: uid, exerciseId, contextEntryId, monitorId });
  const claimRef = clubRef.collection('exercise_claims').doc(`evaluation_${identity}`);
  const taskRef = clubRef.collection('formation_tasks').doc(`evaluation_review_${identity}`);

  return db.runTransaction(async transaction => {
    const [memberSnap, monitorSnap, exerciseSnap, entrySnap, claimSnap, taskSnap] =
      await Promise.all([
        transaction.get(memberRef),
        transaction.get(monitorRef),
        transaction.get(exerciseRef),
        transaction.get(entryRef),
        transaction.get(claimRef),
        transaction.get(taskRef),
      ]);
    if (!memberSnap.exists) {
      throw new HttpsError('permission-denied', 'Membre du club requis.');
    }
    if (!monitorSnap.exists || !isEligibleMonitor(monitorSnap.data())) {
      throw new HttpsError('failed-precondition', 'Le validateur choisi n’est pas habilité.');
    }
    if (monitorId === uid) {
      throw new HttpsError('failed-precondition', 'Une auto-évaluation n’est pas autorisée.');
    }
    if (!exerciseSnap.exists) {
      throw new HttpsError('not-found', 'Exercice introuvable.');
    }
    if (!entrySnap.exists || entrySnap.data().member_id !== uid) {
      throw new HttpsError('permission-denied', 'Cette entrée ne fait pas partie de ton carnet.');
    }
    const entry = entrySnap.data();
    const isPoolEntry = entry.source === 'piscine';
    if ((contextType === 'pool') !== isPoolEntry) {
      throw new HttpsError('invalid-argument', 'Le type de contexte ne correspond pas au carnet.');
    }
    const canonicalIdentity = canonicalClaimIdentity({
      memberId: uid,
      exerciseId,
      contextType,
      contextEntryId,
      monitorId,
      taskId: taskRef.id,
      entry,
    });
    if (claimSnap.exists) {
      const existingClaim = claimSnap.data();
      if (!claimMatchesCanonicalIdentity(existingClaim, canonicalIdentity)) {
        throw new HttpsError(
          'already-exists',
          'Cette identité d’évaluation correspond déjà à une autre demande.',
        );
      }
      if (!taskSnap.exists || !taskMatchesCanonicalIdentity(
        taskSnap.data(),
        { claimId: claimRef.id, claim: existingClaim, taskId: taskRef.id },
      )) {
        transaction.set(taskRef, buildEvaluationTask({
          claimId: claimRef.id,
          taskId: taskRef.id,
          claim: existingClaim,
          now: FieldValue.serverTimestamp(),
          existingTask: taskSnap.exists ? taskSnap.data() : null,
        }));
      }
      return {
        claimId: claimRef.id,
        taskId: taskRef.id,
        idempotent: true,
        taskRepaired: !taskSnap.exists || !taskMatchesCanonicalIdentity(
          taskSnap.data(),
          { claimId: claimRef.id, claim: existingClaim, taskId: taskRef.id },
        ),
      };
    }

    const exercise = exerciseSnap.data();
    const member = memberSnap.data();
    const monitor = monitorSnap.data();
    const now = FieldValue.serverTimestamp();
    const claim = {
      ...canonicalIdentity,
      member_name: memberName(member, uid),
      exercise_code: String(exercise.code || exerciseId),
      exercise_label: String(exercise.description || exercise.label || ''),
      status: 'submitted',
      context_date: entry.date || now,
      context_title: String(entry.location_name || entry.operation_title || 'Carnet'),
      monitor_name: memberName(monitor, monitorId),
      ...(notes ? { declaration_notes: notes } : {}),
      created_at: now,
      updated_at: now,
    };
    transaction.set(claimRef, claim);
    transaction.set(taskRef, buildEvaluationTask({
      claimId: claimRef.id,
      taskId: taskRef.id,
      claim,
      now,
    }));
    return { claimId: claimRef.id, taskId: taskRef.id, idempotent: false };
  });
});

const decideExerciseEvaluation = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const clubId = cleanString(request.data?.clubId, 'clubId', { max: 80 });
  const claimId = cleanString(request.data?.claimId, 'claimId', { max: 180 });
  const result = cleanString(request.data?.result, 'result', { max: 30 });
  const comment = cleanString(request.data?.comment, 'comment', { max: 1000, optional: true });
  const rejectionReason = cleanString(request.data?.rejectionReason, 'rejectionReason', {
    max: 1000,
    optional: true,
  });
  if (!VALID_RESULTS.has(result)) {
    throw new HttpsError('invalid-argument', 'Résultat d’évaluation invalide.');
  }
  if (result === 'rejected' && (!rejectionReason || rejectionReason.length < 10)) {
    throw new HttpsError('invalid-argument', 'Une raison de refus détaillée est requise.');
  }

  const db = admin.firestore();
  const clubRef = db.collection('clubs').doc(clubId);
  const claimRef = clubRef.collection('exercise_claims').doc(claimId);
  const monitorRef = clubRef.collection('members').doc(uid);
  const linkedTasksQuery = clubRef
    .collection('formation_tasks')
    .where('context.exercise_claim_id', '==', claimId);

  return db.runTransaction(async transaction => {
    const [claimSnap, monitorSnap, linkedTasksSnap] = await Promise.all([
      transaction.get(claimRef),
      transaction.get(monitorRef),
      transaction.get(linkedTasksQuery),
    ]);
    if (!claimSnap.exists) throw new HttpsError('not-found', 'Demande introuvable.');
    const claim = claimSnap.data();
    if (claim.request_kind !== 'student_evaluation' || claim.server_verified !== true
      || claim.monitor_id !== uid || claim.member_id === uid) {
      throw new HttpsError('permission-denied', 'Cette évaluation ne t’est pas attribuée.');
    }
    if (!monitorSnap.exists || !isEligibleMonitor(monitorSnap.data())) {
      throw new HttpsError('permission-denied', 'Droits de validation insuffisants.');
    }

    const taskId = String(claim.review_task_id || '');
    const taskRef = taskId ? clubRef.collection('formation_tasks').doc(taskId) : null;
    const existingObservationId = String(claim.decision?.resulting_observation_id || '');
    const observationRef = clubRef
      .collection('member_observations')
      .doc(existingObservationId || `evaluation_${claimId}`);
    const previousDecision = claim.decision || {};
    const revision = Number(previousDecision.revision || 0) + 1;
    const now = FieldValue.serverTimestamp();
    const decision = {
      decided_by: uid,
      decided_by_name: memberName(monitorSnap.data(), uid),
      decided_at: now,
      result,
      revision,
      resulting_observation_id: observationRef.id,
      ...(comment ? { comment } : {}),
      ...(result === 'rejected'
        ? { rejected_reason: rejectionReason, rejected_by: uid, rejected_at: now }
        : {}),
    };
    transaction.set(observationRef, {
      memberId: claim.member_id,
      memberName: claim.member_name || '',
      memberNiveau: inferNiveauFromExerciseCode(claim.exercise_code || claim.exercise_id),
      contextType: claim.context_type === 'pool' ? 'piscine' : 'plongee',
      contextId: claim.operation_id || claim.pool_session_id || claim.context_entry_id || claimId,
      contextDate: claim.context_date || now,
      contextTitle: claim.context_title || 'Évaluation',
      category: 'exercice_lifras',
      exerciceCode: claim.exercise_code || claim.exercise_id,
      exerciceDescription: claim.exercise_label || null,
      result: observationResult(result),
      notes: comment || null,
      observerId: uid,
      observerName: decision.decided_by_name,
      sourceClaimId: claimId,
      sourceType: 'student_evaluation',
      evaluationRevision: revision,
      updatedAt: now,
      ...(existingObservationId ? {} : { createdAt: now }),
    }, { merge: true });
    transaction.update(claimRef, {
      status: result,
      decision,
      updated_at: now,
    });
    if (taskRef) {
      transaction.set(taskRef, {
        status: 'done',
        completed_at: now,
        completed_by: uid,
        completion_data: {
          decision: result,
          claim_id: claimId,
          observation_id: observationRef.id,
          revision,
        },
        updated_at: now,
      }, { merge: true });
    }
    if (result !== 'rejected') {
      for (const task of linkedTasksSnap.docs) {
        if (task.data().type !== 'claim_rejected' || task.data().status !== 'open') continue;
        transaction.update(task.ref, {
          status: 'done',
          completed_at: now,
          completed_by: uid,
          completion_data: {
            superseded_by_evaluation_revision: revision,
            result,
          },
          updated_at: now,
        });
      }
    }
    return { observationId: observationRef.id, revision, corrected: revision > 1 };
  });
});

module.exports = {
  requestExerciseEvaluation,
  decideExerciseEvaluation,
  evaluationIdentity,
  isEligibleMonitor,
  observationResult,
  canonicalClaimIdentity,
  claimMatchesCanonicalIdentity,
  taskMatchesCanonicalIdentity,
  buildEvaluationTask,
};
