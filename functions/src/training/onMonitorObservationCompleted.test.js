jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => '__server_timestamp__',
    arrayUnion: (...values) => ({ arrayUnion: values }),
  },
  Timestamp: { now: () => '__now__' },
}));

const {
  buildObservationCanonicalKey,
  completionDataChanged,
  firstNonBlank,
  handleMonitorObservationCompleted,
  normaliseAttendanceStatus,
  normaliseVerdict,
  observationDocumentId,
} = require('./onMonitorObservationCompleted');

describe('monitor observation completion helpers', () => {
  test('uses one stable document for legacy duplicate tasks', () => {
    const first = buildObservationCanonicalKey({
      clubId: 'calypso',
      poolSessionId: '2026-07-21',
      groupKey: '2star_groupe1',
      memberId: 'member-a',
    });
    const duplicate = buildObservationCanonicalKey({
      clubId: 'calypso',
      poolSessionId: '2026-07-21',
      groupKey: '2star_groupe1',
      memberId: 'member-a',
    });

    expect(first).toBe(duplicate);
    expect(observationDocumentId(first)).toBe(observationDocumentId(duplicate));
    expect(observationDocumentId(first)).toMatch(/^monitor_[a-f0-9]{40}$/);
  });

  test('keeps different sessions and members separate', () => {
    const base = {
      clubId: 'calypso',
      poolSessionId: '2026-07-21',
      groupKey: '2star_groupe1',
      memberId: 'member-a',
    };
    expect(
      observationDocumentId(buildObservationCanonicalKey(base)),
    ).not.toBe(
      observationDocumentId(
        buildObservationCanonicalKey({
          ...base,
          memberId: 'member-b',
        }),
      ),
    );
  });

  test('explicit valid completion theme wins and blank correction falls back', () => {
    expect(firstNonBlank('  Apnée dynamique ', 'Ancien thème')).toBe(
      'Apnée dynamique',
    );
    expect(firstNonBlank('   ', 'Ancien thème')).toBe('Ancien thème');
  });

  test('absence is explicit and does not require a verdict', () => {
    expect(normaliseAttendanceStatus(' ABSENT ')).toBe('absent');
    expect(normaliseAttendanceStatus('present')).toBe('present');
    expect(normaliseAttendanceStatus(null)).toBe('unknown');
    expect(normaliseVerdict('')).toBeNull();
  });

  test('distinguishes a correction from an unrelated done task update', () => {
    const before = {
      completion_data: { verdict: 'acquis', comment: 'Initial' },
    };
    expect(completionDataChanged(before, { ...before })).toBe(false);
    expect(
      completionDataChanged(before, {
        completion_data: { comment: 'Initial', verdict: 'acquis' },
      }),
    ).toBe(false);
    expect(
      completionDataChanged(before, {
        completion_data: { verdict: 'a_revoir', comment: 'Corrigé' },
      }),
    ).toBe(true);
  });

  test('completed absent task rereads source but makes no durable write', async () => {
    const task = completedTask({
      completion_data: { attendance_status: 'absent' },
    });
    const harness = firestoreHarness({
      'clubs/calypso/formation_tasks/observation-task': task,
    });

    await handleMonitorObservationCompleted(
      completionEvent({ before: { status: 'open' }, after: task }),
      harness.db,
    );

    expect(harness.writes).toHaveLength(0);
    expect(harness.reads).toEqual([
      'clubs/calypso/formation_tasks/observation-task',
    ]);
  });

  test('initial completion atomically materialises observation and logbook', async () => {
    const task = completedTask();
    const harness = firestoreHarness({
      'clubs/calypso/formation_tasks/observation-task': task,
      'clubs/calypso/student_logbook_entries/logbook-a': { title: 'Entry' },
    });

    await handleMonitorObservationCompleted(
      completionEvent({ before: { status: 'open' }, after: task }),
      harness.db,
    );

    const observation = harness.findDocument('member_observations');
    const logbook = harness.documents.get(
      'clubs/calypso/student_logbook_entries/logbook-a',
    );
    expect(observation.result).toBe('en_progres');
    expect(observation.correction_revision).toBe(0);
    expect(logbook.monitor_evaluation.result).toBe('en_progres');
    expect(logbook.monitor_evaluation.materialization_marker).toBe(
      observation.materialization_marker,
    );
    expect(harness.db.runTransaction).toHaveBeenCalledTimes(1);
  });

  test('legacy duplicate initial task links provenance without overwriting', async () => {
    const task = completedTask();
    const canonicalKey = buildObservationCanonicalKey({
      clubId: 'calypso',
      poolSessionId: 'session-a',
      groupKey: 'group-a',
      memberId: 'member-a',
    });
    const observationPath =
      `clubs/calypso/member_observations/${observationDocumentId(canonicalKey)}`;
    const harness = firestoreHarness({
      'clubs/calypso/formation_tasks/observation-task': task,
      [observationPath]: {
        result: 'acquis',
        comment: 'First evaluator wins',
        source_task_ids: ['other-task'],
        materialization_marker: 'other-task-marker',
      },
      'clubs/calypso/student_logbook_entries/logbook-a': {
        monitor_evaluation: { result: 'acquis' },
      },
    });

    await handleMonitorObservationCompleted(
      completionEvent({ before: { status: 'open' }, after: task }),
      harness.db,
    );

    expect(harness.documents.get(observationPath)).toEqual({
      result: 'acquis',
      comment: 'First evaluator wins',
      source_task_ids: ['other-task', 'observation-task'],
      materialization_marker: 'other-task-marker',
    });
    expect(
      harness.documents.get('clubs/calypso/student_logbook_entries/logbook-a'),
    ).toEqual({ monitor_evaluation: { result: 'acquis' } });
  });

  test.each([
    ['old then newest', ['A', 'B']],
    ['newest then old', ['B', 'A']],
  ])(
    'out-of-order %s correction always materialises only the current revision',
    async (_label, order) => {
      const revisionA = completedTask({
        correction_revision: 1,
        completion_data: completion('acquis', 'A'),
      });
      const revisionB = completedTask({
        correction_revision: 2,
        completion_data: completion('a_revoir', 'B'),
      });
      const harness = firestoreHarness({
        'clubs/calypso/formation_tasks/observation-task': revisionB,
        'clubs/calypso/student_logbook_entries/logbook-a': { title: 'Entry' },
      });
      const events = {
        A: completionEvent({
          before: completedTask({
            correction_revision: 0,
            completion_data: completion('en_progres', 'Initial'),
          }),
          after: revisionA,
        }),
        B: completionEvent({ before: revisionA, after: revisionB }),
      };

      for (const key of order) {
        await handleMonitorObservationCompleted(events[key], harness.db);
      }

      const observation = harness.findDocument('member_observations');
      const logbook = harness.documents.get(
        'clubs/calypso/student_logbook_entries/logbook-a',
      );
      expect(observation.result).toBe('a_revoir');
      expect(observation.comment).toBe('B');
      expect(observation.correction_revision).toBe(2);
      expect(logbook.monitor_evaluation.result).toBe('a_revoir');
      expect(logbook.monitor_evaluation.comment).toBe('B');
      expect(logbook.monitor_evaluation.correction_revision).toBe(2);
      expect(logbook.monitor_evaluation.materialization_marker).toBe(
        observation.materialization_marker,
      );

      const writesBeforeReplay = harness.writes.length;
      await handleMonitorObservationCompleted(events.B, harness.db);
      expect(harness.writes).toHaveLength(writesBeforeReplay);
    },
  );

  test('current source mismatch prevents both observation and logbook writes', async () => {
    const revisionA = completedTask({
      correction_revision: 1,
      completion_data: completion('acquis', 'A'),
    });
    const revisionB = completedTask({
      correction_revision: 2,
      completion_data: completion('a_revoir', 'B'),
    });
    const harness = firestoreHarness({
      'clubs/calypso/formation_tasks/observation-task': revisionB,
      'clubs/calypso/student_logbook_entries/logbook-a': { title: 'Entry' },
    });

    await handleMonitorObservationCompleted(
      completionEvent({
        before: completedTask({ correction_revision: 0 }),
        after: revisionA,
      }),
      harness.db,
    );

    expect(harness.writes).toHaveLength(0);
    expect(harness.findDocument('member_observations')).toBeUndefined();
    expect(
      harness.documents.get('clubs/calypso/student_logbook_entries/logbook-a'),
    ).toEqual({ title: 'Entry' });
  });

  test('unchanged done task update never touches Firestore', async () => {
    const completion = { verdict: 'acquis' };
    const event = {
      params: { clubId: 'calypso', taskId: 'observation-task' },
      data: {
        before: { data: () => ({ status: 'done', completion_data: completion }) },
        after: {
          data: () => ({
            type: 'monitor_observation',
            status: 'done',
            completion_data: completion,
          }),
        },
      },
    };
    const db = {
      collection: () => {
        throw new Error('Firestore must not be touched');
      },
    };

    await expect(
      handleMonitorObservationCompleted(event, db),
    ).resolves.toBeUndefined();
  });
});

function completion(verdict, comment) {
  return {
    verdict,
    comment,
    observer_id: 'monitor-a',
    observer_name: 'Monitor',
    logbook_entry_id: 'logbook-a',
  };
}

function completedTask(overrides = {}) {
  return {
    type: 'monitor_observation',
    status: 'done',
    member_id: 'member-a',
    member_name: 'Alice',
    completed_by: 'monitor-a',
    context: {
      pool_session_id: 'session-a',
      group_key: 'group-a',
      theme_snapshot: 'Apnée',
      logbook_entry_id: 'logbook-a',
    },
    completion_data: completion('en_progres', 'Initial'),
    correction_revision: 0,
    ...overrides,
  };
}

function completionEvent({ before, after }) {
  return {
    params: { clubId: 'calypso', taskId: 'observation-task' },
    data: {
      before: { data: () => before },
      after: { data: () => after },
    },
  };
}

function firestoreHarness(seed) {
  const documents = new Map(Object.entries(seed));
  const reads = [];
  const writes = [];

  function reference(path) {
    return {
      path,
      id: path.split('/').pop(),
      collection(name) {
        return collection(`${path}/${name}`);
      },
    };
  }

  function collection(path) {
    return { doc: (id) => reference(`${path}/${id}`) };
  }

  function snapshot(ref) {
    const value = documents.get(ref.path);
    return {
      exists: value !== undefined,
      data: () => value,
    };
  }

  function resolveFields(payload, existing = {}) {
    const resolved = { ...payload };
    for (const [key, value] of Object.entries(resolved)) {
      if (value && Array.isArray(value.arrayUnion)) {
        resolved[key] = [...new Set([...(existing[key] || []), ...value.arrayUnion])];
      }
    }
    return resolved;
  }

  const db = {
    collection,
    runTransaction: jest.fn(async (callback) => {
      const transaction = {
        get: jest.fn(async (ref) => {
          reads.push(ref.path);
          return snapshot(ref);
        }),
        set: jest.fn((ref, payload, options) => {
          const existing = documents.get(ref.path) || {};
          const resolved = resolveFields(payload, existing);
          documents.set(
            ref.path,
            options && options.merge ? { ...existing, ...resolved } : resolved,
          );
          writes.push({ operation: 'set', path: ref.path });
        }),
        update: jest.fn((ref, payload) => {
          const existing = documents.get(ref.path);
          if (!existing) throw new Error(`Missing document ${ref.path}`);
          documents.set(ref.path, {
            ...existing,
            ...resolveFields(payload, existing),
          });
          writes.push({ operation: 'update', path: ref.path });
        }),
      };
      return callback(transaction);
    }),
  };

  return {
    db,
    documents,
    reads,
    writes,
    findDocument(collectionName) {
      for (const [path, value] of documents.entries()) {
        if (path.includes(`/${collectionName}/`)) return value;
      }
      return undefined;
    },
  };
}
