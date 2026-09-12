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
  isAlreadyExistsError,
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
    expect(isAlreadyExistsError({ code: 6 })).toBe(true);
    expect(isAlreadyExistsError({ code: 'already-exists' })).toBe(true);
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

  test('completed absent task exits before any observation write', async () => {
    const event = {
      params: { clubId: 'calypso', taskId: 'legacy-duplicate' },
      data: {
        before: { data: () => ({ status: 'open' }) },
        after: {
          data: () => ({
            type: 'monitor_observation',
            status: 'done',
            member_id: 'member-a',
            completion_data: { attendance_status: 'absent' },
          }),
        },
      },
    };
    const db = {
      collection: () => {
        throw new Error('Firestore must not be touched for absence');
      },
    };

    await expect(
      handleMonitorObservationCompleted(event, db),
    ).resolves.toBeUndefined();
  });

  test('done-to-done correction updates the deterministic observation', async () => {
    const set = jest.fn().mockResolvedValue(undefined);
    const get = jest.fn().mockResolvedValue({ exists: true });
    const observationRef = {};
    const memberObservations = {
      doc: jest.fn().mockReturnValue(observationRef),
    };
    const clubRef = {
      collection: jest.fn((name) => {
        if (name === 'member_observations') return memberObservations;
        throw new Error(`Unexpected collection ${name}`);
      }),
    };
    const db = {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue(clubRef),
      }),
      runTransaction: jest.fn(async (callback) => callback({ get, set })),
    };
    const event = {
      params: { clubId: 'calypso', taskId: 'observation-task' },
      data: {
        before: {
          data: () => ({
            status: 'done',
            completion_data: { verdict: 'acquis', comment: 'Initial' },
          }),
        },
        after: {
          data: () => ({
            type: 'monitor_observation',
            status: 'done',
            member_id: 'member-a',
            member_name: 'Alice',
            completed_by: 'monitor-a',
            context: {
              pool_session_id: 'session-a',
              group_key: 'group-a',
              theme_snapshot: 'Apnée',
            },
            completion_data: {
              verdict: 'a_revoir',
              comment: 'Corrigé',
              observer_id: 'monitor-a',
            },
          }),
        },
      },
    };

    await handleMonitorObservationCompleted(event, db);

    expect(memberObservations.doc).toHaveBeenCalledWith(
      observationDocumentId(
        buildObservationCanonicalKey({
          clubId: 'calypso',
          poolSessionId: 'session-a',
          groupKey: 'group-a',
          memberId: 'member-a',
        }),
      ),
    );
    expect(get).toHaveBeenCalledWith(observationRef);
    expect(set).toHaveBeenCalledWith(
      observationRef,
      expect.objectContaining({
        result: 'a_revoir',
        comment: 'Corrigé',
        corrected_at: '__server_timestamp__',
      }),
      { merge: true },
    );
    expect(set.mock.calls[0][1]).not.toHaveProperty('created_at');
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
