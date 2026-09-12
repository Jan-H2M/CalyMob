jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options, handler) => handler,
  HttpsError: class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: jest.fn(() => 'server-time') },
}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));

const admin = require('firebase-admin');
const {
  requestExerciseEvaluation,
  decideExerciseEvaluation,
  evaluationIdentity,
  isEligibleMonitor,
  observationResult,
  canonicalClaimIdentity,
} = require('./evaluationRequests');

function ref(path) {
  return {
    path,
    id: path.split('/').pop(),
    collection(name) {
      return collection(`${path}/${name}`);
    },
  };
}

function collection(path) {
  return {
    path,
    doc(id) {
      return ref(`${path}/${id}`);
    },
    where(field, op, value) {
      return { path, query: { field, op, value } };
    },
  };
}

function snap(path, data) {
  return {
    exists: data != null,
    ref: ref(path),
    id: path.split('/').pop(),
    data: () => data,
  };
}

function setupDb(documents, queryDocs = []) {
  const transaction = {
    get: jest.fn(async target => {
      if (target.query) return { docs: queryDocs };
      return snap(target.path, documents[target.path]);
    }),
    set: jest.fn(),
    update: jest.fn(),
  };
  const db = {
    collection,
    runTransaction: jest.fn(callback => callback(transaction)),
  };
  admin.firestore.mockReturnValue(db);
  return { db, transaction };
}

const club = 'clubs/calypso';
const eligibleMonitor = {
  prenom: 'Marie',
  nom: 'Moniteur',
  plongeur_code: 'MC',
  clubStatuten: ['Encadrants'],
};

describe('evaluation request policy', () => {
  beforeEach(() => jest.clearAllMocks());

  test('uses a stable opaque identity and maps durable results', () => {
    const input = {
      memberId: 'student',
      exerciseId: 'P2-DP',
      contextEntryId: 'dive-10',
      monitorId: 'monitor',
    };
    expect(evaluationIdentity(input)).toMatch(/^[a-f0-9]{40}$/);
    expect(evaluationIdentity(input)).toBe(evaluationIdentity(input));
    expect(observationResult('accepted')).toBe('acquis');
    expect(observationResult('corrected')).toBe('en_progres');
    expect(observationResult('rejected')).toBe('a_revoir');
    expect(isEligibleMonitor(eligibleMonitor)).toBe(true);
    expect(isEligibleMonitor({ ...eligibleMonitor, plongeur_code: 'AM' })).toBe(false);
    expect(isEligibleMonitor({ ...eligibleMonitor, plongeur_code: 'MF' })).toBe(true);
    expect(isEligibleMonitor({ ...eligibleMonitor, plongeur_code: 'MN' })).toBe(true);
    expect(isEligibleMonitor({ ...eligibleMonitor, clubStatuten: ['Membres'] })).toBe(false);
    expect(isEligibleMonitor({ app_role: 'admin', plongeur_code: 'P3' })).toBe(false);
  });

  test('creates the authoritative claim and review task atomically', async () => {
    const identity = evaluationIdentity({
      memberId: 'student', exerciseId: 'exercise-1', contextEntryId: 'entry-1', monitorId: 'monitor',
    });
    const { transaction } = setupDb({
      [`${club}/members/student`]: { prenom: 'Sam', nom: 'Student' },
      [`${club}/members/monitor`]: eligibleMonitor,
      [`${club}/exercices_lifras/exercise-1`]: { code: 'P2.DP', description: 'Direction de palanquée' },
      [`${club}/student_logbook_entries/entry-1`]: {
        member_id: 'student', source: 'manual', date: 'dive-date', location_name: 'Zélande',
      },
    });

    const result = await requestExerciseEvaluation({
      auth: { uid: 'student' },
      data: {
        clubId: 'calypso', exerciseId: 'exercise-1', contextEntryId: 'entry-1',
        contextType: 'dive', monitorId: 'monitor', notes: 'À contrôler',
      },
    });

    expect(result).toEqual({
      claimId: `evaluation_${identity}`,
      taskId: `evaluation_review_${identity}`,
      idempotent: false,
    });
    const claimWrite = transaction.set.mock.calls.find(
      ([target]) => target.path.includes('/exercise_claims/'),
    );
    const taskWrite = transaction.set.mock.calls.find(
      ([target]) => target.path.includes('/formation_tasks/'),
    );
    expect(claimWrite[1]).toMatchObject({
      member_id: 'student', exercise_code: 'P2.DP', monitor_id: 'monitor',
      context_type: 'dive', logbook_entry_id: 'entry-1', request_kind: 'student_evaluation',
      server_verified: true,
    });
    expect(taskWrite[1]).toMatchObject({
      type: 'monitor_validation', current_assignee_id: 'monitor', status: 'open',
    });
  });

  test('rejects a context entry owned by another member before writing', async () => {
    const { transaction } = setupDb({
      [`${club}/members/student`]: { prenom: 'Sam' },
      [`${club}/members/monitor`]: eligibleMonitor,
      [`${club}/exercices_lifras/exercise-1`]: { code: 'P2.DP' },
      [`${club}/student_logbook_entries/entry-1`]: { member_id: 'other', source: 'manual' },
    });
    await expect(requestExerciseEvaluation({
      auth: { uid: 'student' },
      data: {
        clubId: 'calypso', exerciseId: 'exercise-1', contextEntryId: 'entry-1',
        contextType: 'dive', monitorId: 'monitor',
      },
    })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(transaction.set).not.toHaveBeenCalled();
  });

  test('returns the same request without creating a second task', async () => {
    const identity = evaluationIdentity({
      memberId: 'student', exerciseId: 'exercise-1', contextEntryId: 'entry-1', monitorId: 'monitor',
    });
    const claimId = `evaluation_${identity}`;
    const taskId = `evaluation_review_${identity}`;
    const canonical = canonicalClaimIdentity({
      memberId: 'student',
      exerciseId: 'exercise-1',
      contextType: 'pool',
      contextEntryId: 'entry-1',
      monitorId: 'monitor',
      taskId,
      entry: { member_id: 'student', source: 'piscine' },
    });
    const { transaction } = setupDb({
      [`${club}/members/student`]: { prenom: 'Sam' },
      [`${club}/members/monitor`]: eligibleMonitor,
      [`${club}/exercices_lifras/exercise-1`]: { code: 'P2.DP' },
      [`${club}/student_logbook_entries/entry-1`]: { member_id: 'student', source: 'piscine' },
      [`${club}/exercise_claims/${claimId}`]: {
        ...canonical,
        status: 'submitted',
        member_name: 'Sam',
        monitor_name: 'Marie Moniteur',
        exercise_code: 'P2.DP',
        exercise_label: 'Direction',
      },
      [`${club}/formation_tasks/${taskId}`]: {
        type: 'monitor_validation',
        status: 'open',
        member_id: 'student',
        current_assignee_id: 'monitor',
        current_assignee_type: 'monitor',
        context: {
          exercise_claim_id: claimId,
          logbook_entry_id: 'entry-1',
          pool_session_id: 'entry-1',
        },
      },
    });
    const result = await requestExerciseEvaluation({
      auth: { uid: 'student' },
      data: {
        clubId: 'calypso', exerciseId: 'exercise-1', contextEntryId: 'entry-1',
        contextType: 'pool', monitorId: 'monitor',
      },
    });
    expect(result.idempotent).toBe(true);
    expect(result.taskRepaired).toBe(false);
    expect(transaction.set).not.toHaveBeenCalled();
  });

  test('rejects a deterministic claim collision with forged canonical fields', async () => {
    const identity = evaluationIdentity({
      memberId: 'student', exerciseId: 'exercise-1', contextEntryId: 'entry-1', monitorId: 'monitor',
    });
    const { transaction } = setupDb({
      [`${club}/members/student`]: { prenom: 'Sam' },
      [`${club}/members/monitor`]: eligibleMonitor,
      [`${club}/exercices_lifras/exercise-1`]: { code: 'P2.DP' },
      [`${club}/student_logbook_entries/entry-1`]: { member_id: 'student', source: 'piscine' },
      [`${club}/exercise_claims/evaluation_${identity}`]: {
        member_id: 'attacker', server_verified: false,
      },
    });
    await expect(requestExerciseEvaluation({
      auth: { uid: 'student' },
      data: {
        clubId: 'calypso', exerciseId: 'exercise-1', contextEntryId: 'entry-1',
        contextType: 'pool', monitorId: 'monitor',
      },
    })).rejects.toMatchObject({ code: 'already-exists' });
    expect(transaction.set).not.toHaveBeenCalled();
  });

  test.each([
    ['missing', null],
    ['corrupt', {
      type: 'monitor_validation', member_id: 'other', current_assignee_id: 'attacker',
      context: { exercise_claim_id: 'wrong', logbook_entry_id: 'wrong' },
    }],
  ])('atomically repairs a %s review task for a valid claim', async (_label, taskData) => {
    const identity = evaluationIdentity({
      memberId: 'student', exerciseId: 'exercise-1', contextEntryId: 'entry-1', monitorId: 'monitor',
    });
    const claimId = `evaluation_${identity}`;
    const taskId = `evaluation_review_${identity}`;
    const entry = { member_id: 'student', source: 'piscine' };
    const canonical = canonicalClaimIdentity({
      memberId: 'student', exerciseId: 'exercise-1', contextType: 'pool',
      contextEntryId: 'entry-1', monitorId: 'monitor', taskId, entry,
    });
    const documents = {
      [`${club}/members/student`]: { prenom: 'Sam' },
      [`${club}/members/monitor`]: eligibleMonitor,
      [`${club}/exercices_lifras/exercise-1`]: { code: 'P2.DP' },
      [`${club}/student_logbook_entries/entry-1`]: entry,
      [`${club}/exercise_claims/${claimId}`]: {
        ...canonical,
        status: 'submitted',
        member_name: 'Sam',
        monitor_name: 'Marie Moniteur',
        exercise_code: 'P2.DP',
        exercise_label: 'Direction',
      },
      ...(taskData ? { [`${club}/formation_tasks/${taskId}`]: taskData } : {}),
    };
    const { transaction } = setupDb(documents);
    const result = await requestExerciseEvaluation({
      auth: { uid: 'student' },
      data: {
        clubId: 'calypso', exerciseId: 'exercise-1', contextEntryId: 'entry-1',
        contextType: 'pool', monitorId: 'monitor',
      },
    });
    expect(result).toMatchObject({ idempotent: true, taskRepaired: true });
    expect(transaction.set).toHaveBeenCalledTimes(1);
    expect(transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${club}/formation_tasks/${taskId}` }),
      expect.objectContaining({
        type: 'monitor_validation', member_id: 'student',
        current_assignee_id: 'monitor', status: 'open',
      }),
    );
  });

  test('forbids requesting an evaluation from oneself', async () => {
    const { transaction } = setupDb({
      [`${club}/members/student`]: eligibleMonitor,
      [`${club}/exercices_lifras/exercise-1`]: { code: 'P2.DP' },
      [`${club}/student_logbook_entries/entry-1`]: { member_id: 'student', source: 'piscine' },
    });
    await expect(requestExerciseEvaluation({
      auth: { uid: 'student' },
      data: {
        clubId: 'calypso', exerciseId: 'exercise-1', contextEntryId: 'entry-1',
        contextType: 'pool', monitorId: 'student',
      },
    })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(transaction.set).not.toHaveBeenCalled();
  });

  test('repairs a missing task as done when the valid claim was already decided', async () => {
    const identity = evaluationIdentity({
      memberId: 'student', exerciseId: 'exercise-1', contextEntryId: 'entry-1', monitorId: 'monitor',
    });
    const claimId = `evaluation_${identity}`;
    const taskId = `evaluation_review_${identity}`;
    const entry = { member_id: 'student', source: 'manual', operation_id: 'dive-1' };
    const canonical = canonicalClaimIdentity({
      memberId: 'student', exerciseId: 'exercise-1', contextType: 'dive',
      contextEntryId: 'entry-1', monitorId: 'monitor', taskId, entry,
    });
    const { transaction } = setupDb({
      [`${club}/members/student`]: { prenom: 'Sam' },
      [`${club}/members/monitor`]: eligibleMonitor,
      [`${club}/exercices_lifras/exercise-1`]: { code: 'P2.DP' },
      [`${club}/student_logbook_entries/entry-1`]: entry,
      [`${club}/exercise_claims/${claimId}`]: {
        ...canonical,
        status: 'accepted',
        member_name: 'Sam',
        monitor_name: 'Marie Moniteur',
        exercise_code: 'P2.DP',
        exercise_label: 'Direction',
        decision: {
          decided_by: 'monitor', revision: 1,
          resulting_observation_id: 'observation-1', decided_at: 'decision-time',
        },
      },
    });
    const result = await requestExerciseEvaluation({
      auth: { uid: 'student' },
      data: {
        clubId: 'calypso', exerciseId: 'exercise-1', contextEntryId: 'entry-1',
        contextType: 'dive', monitorId: 'monitor',
      },
    });
    expect(result).toMatchObject({ idempotent: true, taskRepaired: true });
    expect(transaction.set).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        status: 'done', completed_by: 'monitor',
        completion_data: expect.objectContaining({ observation_id: 'observation-1' }),
      }),
    );
  });
});

describe('durable monitor decision and correction', () => {
  beforeEach(() => jest.clearAllMocks());

  test('writes the result, closes the review and increments revisions', async () => {
    const claimId = 'evaluation_claim';
    const task = snap(`${club}/formation_tasks/evaluation_review`, {
      type: 'monitor_validation', status: 'open',
    });
    const { transaction } = setupDb({
      [`${club}/members/monitor`]: eligibleMonitor,
      [`${club}/exercise_claims/${claimId}`]: {
        request_kind: 'student_evaluation', server_verified: true,
        monitor_id: 'monitor', member_id: 'student',
        member_name: 'Sam Student', exercise_code: 'P2.DP', exercise_label: 'Direction',
        context_type: 'dive', context_entry_id: 'entry-1', context_date: 'dive-date',
        context_title: 'Zélande', review_task_id: 'evaluation_review',
        decision: { revision: 1, resulting_observation_id: 'observation-1' },
      },
    }, [task]);

    const result = await decideExerciseEvaluation({
      auth: { uid: 'monitor' },
      data: { clubId: 'calypso', claimId, result: 'corrected', comment: 'Encore à stabiliser' },
    });

    expect(result).toEqual({ observationId: 'observation-1', revision: 2, corrected: true });
    expect(transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${club}/member_observations/observation-1` }),
      expect.objectContaining({ result: 'en_progres', evaluationRevision: 2, contextDate: 'dive-date' }),
      { merge: true },
    );
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${club}/exercise_claims/${claimId}` }),
      expect.objectContaining({ status: 'corrected' }),
    );
    expect(transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${club}/formation_tasks/evaluation_review` }),
      expect.objectContaining({ status: 'done' }),
      { merge: true },
    );
  });

  test('only the assigned eligible monitor may revise an evaluation', async () => {
    const { transaction } = setupDb({
      [`${club}/members/other-monitor`]: eligibleMonitor,
      [`${club}/exercise_claims/evaluation_claim`]: {
        request_kind: 'student_evaluation', server_verified: true,
        monitor_id: 'monitor', member_id: 'student',
      },
    });
    await expect(decideExerciseEvaluation({
      auth: { uid: 'other-monitor' },
      data: { clubId: 'calypso', claimId: 'evaluation_claim', result: 'accepted' },
    })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
  });

  test('an assigned admin without MC/MF/MN plus Encadrant cannot decide', async () => {
    const { transaction } = setupDb({
      [`${club}/members/admin`]: { app_role: 'admin', plongeur_code: 'P3', clubStatuten: [] },
      [`${club}/exercise_claims/evaluation_claim`]: {
        request_kind: 'student_evaluation', server_verified: true,
        monitor_id: 'admin', member_id: 'student',
      },
    });
    await expect(decideExerciseEvaluation({
      auth: { uid: 'admin' },
      data: { clubId: 'calypso', claimId: 'evaluation_claim', result: 'accepted' },
    })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
  });

  test('rejects a legacy server-verified self-evaluation at decision time', async () => {
    const { transaction } = setupDb({
      [`${club}/members/monitor`]: eligibleMonitor,
      [`${club}/exercise_claims/evaluation_claim`]: {
        request_kind: 'student_evaluation', server_verified: true,
        monitor_id: 'monitor', member_id: 'monitor',
      },
    });
    await expect(decideExerciseEvaluation({
      auth: { uid: 'monitor' },
      data: { clubId: 'calypso', claimId: 'evaluation_claim', result: 'accepted' },
    })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
  });
});
