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
});
