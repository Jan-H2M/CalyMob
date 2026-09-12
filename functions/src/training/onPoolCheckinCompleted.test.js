jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdated: (_options, handler) => handler,
}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__server_timestamp__' },
  Timestamp: {},
}));

const admin = require('firebase-admin');
const {
  onPoolCheckinCompleted,
  buildAttendeeIdentityPatch,
  encadrantGroupContract,
  reconcileEncadrantGroups,
  resolveAttendeeRef,
  resolveGroupSupervision,
  selectedGroupContract,
} = require('./onPoolCheckinCompleted');

function makeDb({ memberIdDocs = [], legacyMemberIdDocs = [] } = {}) {
  const queries = [];
  const makeRef = (id) => ({
    id: String(id),
    path: `clubs/calypso/piscine_sessions/session-a/attendees/${id}`,
  });
  const docsFor = (field) => {
    const ids = field === 'memberId' ? memberIdDocs : legacyMemberIdDocs;
    return ids.map((id) => ({ id, ref: makeRef(id) }));
  };
  const attendeesRef = {
    doc: (id = 'generated') => makeRef(id),
    where: (field, op, value) => {
      queries.push({ field, op, value });
      return {
        limit: () => ({
          get: async () => {
            const docs = docsFor(field);
            return { empty: docs.length === 0, docs };
          },
        }),
      };
    },
  };
  const db = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({ collection: () => attendeesRef }),
        }),
      }),
    }),
  };
  return { db, queries };
}

describe('onPoolCheckinCompleted attendee identity', () => {
  test('writes identity fields without overwriting unknown names with null', () => {
    expect(buildAttendeeIdentityPatch({
      member_id: 'member-a',
      member_name: 'Alice Exemple',
    })).toEqual({ memberId: 'member-a', memberName: 'Alice Exemple' });
    expect(buildAttendeeIdentityPatch({ member_id: 'member-a' }))
      .toEqual({ memberId: 'member-a' });
  });

  test('uses context.attendee_id without running fallback queries', async () => {
    const { db, queries } = makeDb({ memberIdDocs: ['wrong-doc'] });
    const ref = await resolveAttendeeRef(db, 'calypso', 'session-a', {
      member_id: 'member-a',
      context: { attendee_id: 'scan-doc-123' },
    });
    expect(ref.id).toBe('scan-doc-123');
    expect(queries).toEqual([]);
  });

  test('falls back to an existing memberId attendee', async () => {
    const { db, queries } = makeDb({ memberIdDocs: ['legacy-random'] });
    const ref = await resolveAttendeeRef(db, 'calypso', 'session-a', {
      member_id: 'member-a', context: {},
    });
    expect(ref.id).toBe('legacy-random');
    expect(queries).toEqual([
      { field: 'memberId', op: '==', value: 'member-a' },
    ]);
  });

  test('falls back to a French legacy member identity', async () => {
    const { db, queries } = makeDb({ legacyMemberIdDocs: ['legacy-french'] });
    const ref = await resolveAttendeeRef(db, 'calypso', 'session-a', {
      member_id: 'member-a', context: {},
    });
    expect(ref.id).toBe('legacy-french');
    expect(queries).toEqual([
      { field: 'memberId', op: '==', value: 'member-a' },
      { field: 'membre_id', op: '==', value: 'member-a' },
    ]);
  });

  test('uses the canonical member document only as final fallback', async () => {
    const { db } = makeDb();
    const ref = await resolveAttendeeRef(db, 'calypso', 'session-a', {
      member_id: 'member-a', context: {},
    });
    expect(ref.id).toBe('member-a');
  });
});

function makeSupervisionDb(sessionData, groupData = null) {
  const sessionRef = {
    get: async () => ({ exists: true, data: () => sessionData }),
    collection: (name) => {
      if (name !== 'groups') throw new Error(`unexpected collection ${name}`);
      return {
        doc: () => ({
          get: async () => ({
            exists: groupData != null,
            data: () => groupData,
          }),
        }),
      };
    },
  };
  return {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => sessionRef,
        }),
      }),
    }),
  };
}

describe('onPoolCheckinCompleted selected group supervision', () => {
  const session = {
    niveaux: {
      '2*': {
        courses_by_hour: {
          '1ere_heure': [
            {
              order: 0,
              theme: 'Groupe un',
              encadrants: [{ membre_id: 'validator-group-1' }],
            },
            {
              order: 1,
              theme: 'Groupe deux',
              encadrants: [
                { membre_id: 'validator-group-2' },
                { membreId: 'monitor-group-2-b' },
              ],
            },
          ],
          '2eme_heure': [
            {
              order: 0,
              theme: 'Deuxième heure',
              encadrants: [{ membre_id: 'validator-second-hour' }],
            },
          ],
        },
      },
    },
  };

  test('normalizes current and production legacy completion contracts', () => {
    expect(selectedGroupContract({
      level: '2*',
      groupNumber: 2,
      groupKey: '2star_groupe2',
      moniteurIds: ['validator-group-2'],
    })).toMatchObject({
      level: '2*',
      groupNumber: 2,
      groupKey: '2star_groupe2',
      monitorIds: ['validator-group-2'],
    });

    expect(selectedGroupContract(null, {
      level: '2*',
      group_number: 2,
      group_key: '2*-2',
      moniteur_ids: ['validator-group-2'],
    })).toMatchObject({
      level: '2*',
      groupNumber: 2,
      groupKey: '2star_groupe2',
      monitorIds: ['validator-group-2'],
    });
  });

  test('resolves group 2 to group 2 monitors, never the first level course', async () => {
    const resolved = await resolveGroupSupervision(
      makeSupervisionDb(session),
      'calypso',
      'session-a',
      selectedGroupContract({
        level: '2*',
        groupNumber: 2,
        groupKey: '2star_groupe2',
        // Stale client data must not override the authoritative planning.
        moniteurIds: ['validator-group-1'],
      }, {}, '1ere_heure'),
    );

    expect(resolved).toEqual({
      validatorId: 'validator-group-2',
      monitorIds: ['validator-group-2', 'monitor-group-2-b'],
      themeSnapshot: 'Groupe deux',
    });
  });

  test('retains the one-group production legacy level shape', async () => {
    const resolved = await resolveGroupSupervision(
      makeSupervisionDb({
        niveaux: {
          '1*': {
            theme: 'Legacy theme',
            encadrants: [{ membre_id: 'legacy-validator' }],
          },
        },
      }),
      'calypso',
      'session-a',
      selectedGroupContract(null, {
        level: '1*',
        group_number: 1,
        group_key: '1*-1',
      }),
    );

    expect(resolved).toEqual({
      validatorId: 'legacy-validator',
      monitorIds: ['legacy-validator'],
      themeSnapshot: 'Legacy theme',
    });
  });

  test('uses payload monitors only for a proven legacy single-group session', async () => {
    const resolved = await resolveGroupSupervision(
      makeSupervisionDb({
        niveaux: {
          '1*': { theme: 'Legacy without persisted encadrants' },
        },
      }),
      'calypso',
      'session-a',
      {
        ...selectedGroupContract(null, {
          level: '1*',
          group_number: 1,
          group_key: '1*-1',
          moniteur_ids: ['legacy-payload-validator'],
        }),
        participantMemberId: 'student-a',
      },
    );

    expect(resolved).toEqual({
      validatorId: 'legacy-payload-validator',
      monitorIds: ['legacy-payload-validator'],
      themeSnapshot: 'Legacy without persisted encadrants',
    });
  });

  test('never accepts a student self-id from the legacy payload fallback', async () => {
    const resolved = await resolveGroupSupervision(
      makeSupervisionDb({ niveaux: { '1*': { theme: 'Legacy' } } }),
      'calypso',
      'session-a',
      {
        ...selectedGroupContract(null, {
          level: '1*',
          group_number: 1,
          group_key: '1*-1',
          moniteur_ids: ['student-a'],
        }),
        participantMemberId: 'student-a',
      },
    );

    expect(resolved).toEqual({
      validatorId: null,
      monitorIds: [],
      themeSnapshot: 'Legacy',
    });
  });

  test('modern planning ignores spoofed payload monitors when its group is empty', async () => {
    const emptyModernSession = {
      niveaux: {
        '2*': {
          courses_by_hour: {
            '1ere_heure': [{ order: 0, theme: 'No monitor', encadrants: [] }],
          },
        },
      },
    };
    const resolved = await resolveGroupSupervision(
      makeSupervisionDb(emptyModernSession),
      'calypso',
      'session-a',
      selectedGroupContract({
        level: '2*',
        groupNumber: 1,
        groupKey: '2star_groupe1',
        moniteurIds: ['spoofed-validator'],
      }, {}, '1ere_heure'),
    );

    expect(resolved).toEqual({
      validatorId: null,
      monitorIds: [],
      themeSnapshot: 'No monitor',
    });
  });

  test('v4 uses its outer hour key when no embedded hour is supplied', async () => {
    const selection = selectedGroupContract({
      level: '2*',
      groupNumber: 1,
      groupKey: '2star_groupe1',
    }, {}, '2eme_heure');

    expect(selection).toMatchObject({
      hourKey: '2eme_heure',
      contractConflict: { hourKey: false },
    });
    await expect(resolveGroupSupervision(
      makeSupervisionDb(session),
      'calypso',
      'session-a',
      selection,
    )).resolves.toEqual({
      validatorId: 'validator-second-hour',
      monitorIds: ['validator-second-hour'],
      themeSnapshot: 'Deuxième heure',
    });
  });

  test.each([
    ['first outer versus embedded second', '1ere_heure', 'heure', '2eme_heure'],
    ['second outer versus embedded first', '2eme_heure', 'hourKey', '1ere_heure'],
  ])('v4 fails closed for %s', async (
    _label,
    outerHour,
    embeddedField,
    embeddedHour,
  ) => {
    const selection = selectedGroupContract({
      level: '2*',
      groupNumber: 1,
      groupKey: '2star_groupe1',
      [embeddedField]: embeddedHour,
    }, {}, outerHour);

    expect(selection).toMatchObject({
      hourKey: outerHour,
      contractConflict: { hourKey: true },
    });
    await expect(resolveGroupSupervision(
      makeSupervisionDb(session),
      'calypso',
      'session-a',
      selection,
    )).resolves.toEqual({
      validatorId: null,
      monitorIds: [],
      themeSnapshot: null,
    });
  });

  test.each([
    ['first outer versus embedded second', '1ere_heure', 'heure', '2eme_heure'],
    ['second outer versus embedded first', '2eme_heure', 'hourKey', '1ere_heure'],
  ])('hour conflict never reaches legacy payload fallback: %s', async (
    _label,
    outerHour,
    embeddedField,
    embeddedHour,
  ) => {
    const selection = selectedGroupContract({
      level: '1*',
      groupNumber: 1,
      groupKey: '1star_groupe1',
      [embeddedField]: embeddedHour,
    }, {
      moniteur_ids: ['payload-must-not-win'],
    }, outerHour);

    await expect(resolveGroupSupervision(
      makeSupervisionDb({
        niveaux: {
          '1*': { theme: 'Legacy', encadrants: [] },
        },
      }),
      'calypso',
      'session-a',
      selection,
    )).resolves.toEqual({
      validatorId: null,
      monitorIds: [],
      themeSnapshot: null,
    });
  });

  test('flat legacy completion uses embedded hour without outer context', async () => {
    const selection = selectedGroupContract(null, {
      level: '2*',
      group_number: 1,
      group_key: '2*-1',
      hourKey: '2eme_heure',
    });

    expect(selection).toMatchObject({
      hourKey: '2eme_heure',
      contractConflict: { hourKey: false },
    });
    await expect(resolveGroupSupervision(
      makeSupervisionDb(session),
      'calypso',
      'session-a',
      selection,
    )).resolves.toEqual({
      validatorId: 'validator-second-hour',
      monitorIds: ['validator-second-hour'],
      themeSnapshot: 'Deuxième heure',
    });
  });

  test('v4 encadrant group keeps outer hour as authoritative context', () => {
    expect(encadrantGroupContract({
      level: '2*',
      group_number: 1,
    }, '2eme_heure')).toMatchObject({
      heure: '2eme_heure',
      contractConflict: { hourKey: false },
      contractPresence: { outerHourKey: true },
    });
  });

  test.each([
    ['level', { groupNumber: 2, groupKey: '2star_groupe2' }, '1ere_heure'],
    ['groupNumber', { level: '2*', groupKey: '2star_groupe2' }, '1ere_heure'],
    ['groupKey', { level: '2*', groupNumber: 2 }, '1ere_heure'],
    [
      'hour',
      { level: '2*', groupNumber: 2, groupKey: '2star_groupe2' },
      null,
    ],
  ])('modern planning fails closed when %s is missing', async (_field, raw, hour) => {
    const resolved = await resolveGroupSupervision(
      makeSupervisionDb(session),
      'calypso',
      'session-a',
      selectedGroupContract(
        { ...raw, moniteurIds: ['payload-must-not-win'] },
        {},
        hour,
      ),
    );

    expect(resolved).toEqual({
      validatorId: null,
      monitorIds: [],
      themeSnapshot: null,
    });
  });

  test.each([
    [
      'wrong group',
      { level: '2*', groupNumber: 3, groupKey: '2star_groupe3' },
    ],
    [
      'inconsistent group key',
      { level: '2*', groupNumber: 2, groupKey: '2star_groupe1' },
    ],
  ])('modern planning fails closed for %s', async (_label, raw) => {
    const resolved = await resolveGroupSupervision(
      makeSupervisionDb(session),
      'calypso',
      'session-a',
      selectedGroupContract(
        { ...raw, moniteurIds: ['payload-must-not-win'] },
        {},
        '1ere_heure',
      ),
    );

    expect(resolved).toEqual({
      validatorId: null,
      monitorIds: [],
      themeSnapshot: null,
    });
  });

  test('a conflicting group document cannot override the selected course', async () => {
    const resolved = await resolveGroupSupervision(
      makeSupervisionDb(session, {
        supervisorId: 'validator-wrong-group',
        level: '2*',
        groupNumber: 1,
        groupKey: '2star_groupe1',
        hourKey: '1ere_heure',
      }),
      'calypso',
      'session-a',
      selectedGroupContract({
        level: '2*',
        groupNumber: 2,
        groupKey: '2star_groupe2',
      }, {}, '1ere_heure'),
    );

    expect(resolved.validatorId).toBe('validator-group-2');
    expect(resolved.monitorIds).toEqual([
      'validator-group-2',
      'monitor-group-2-b',
    ]);
  });

  test('a matching group document may supply the explicit supervisor', async () => {
    const resolved = await resolveGroupSupervision(
      makeSupervisionDb(session, {
        supervisorId: 'explicit-supervisor',
        level: '2*',
        groupNumber: 2,
        groupKey: '2star_groupe2',
        hourKey: '1ere_heure',
      }),
      'calypso',
      'session-a',
      selectedGroupContract({
        level: '2*',
        groupNumber: 2,
        groupKey: '2star_groupe2',
      }, {}, '1ere_heure'),
    );

    expect(resolved.validatorId).toBe('explicit-supervisor');
    expect(resolved.monitorIds).toEqual([
      'validator-group-2',
      'monitor-group-2-b',
    ]);
  });

  test('an empty level object is not proof of a legacy single group', async () => {
    const resolved = await resolveGroupSupervision(
      makeSupervisionDb({ niveaux: { '1*': {} } }),
      'calypso',
      'session-a',
      selectedGroupContract(null, {
        level: '1*',
        group_number: 1,
        group_key: '1*-1',
        moniteur_ids: ['payload-must-not-win'],
      }),
    );

    expect(resolved).toEqual({
      validatorId: null,
      monitorIds: [],
      themeSnapshot: null,
    });
  });

  test('mixed planning is not downgraded to legacy payload fallback', async () => {
    const mixedSession = {
      niveaux: {
        '1*': { theme: 'Legacy-looking level' },
        '2*': session.niveaux['2*'],
      },
    };
    const resolved = await resolveGroupSupervision(
      makeSupervisionDb(mixedSession),
      'calypso',
      'session-a',
      selectedGroupContract(null, {
        level: '1*',
        group_number: 1,
        group_key: '1*-1',
        moniteur_ids: ['payload-must-not-win'],
      }),
    );

    expect(resolved).toEqual({
      validatorId: null,
      monitorIds: [],
      themeSnapshot: null,
    });
  });
});

describe('onPoolCheckinCompleted v4 encadrant hour contract', () => {
  function makeHandlerDb() {
    const attendeeSet = jest.fn().mockResolvedValue(undefined);
    const attendeeRef = { id: 'attendee-a', set: attendeeSet };
    const attendeesRef = { doc: jest.fn(() => attendeeRef) };
    const sessionRef = {
      collection: jest.fn((name) => {
        if (name !== 'attendees') throw new Error(`unexpected collection ${name}`);
        return attendeesRef;
      }),
    };
    const sessionsRef = { doc: jest.fn(() => sessionRef) };
    const clubRef = {
      collection: jest.fn((name) => {
        if (name !== 'piscine_sessions') {
          throw new Error(`unexpected collection ${name}`);
        }
        return sessionsRef;
      }),
    };
    const clubsRef = { doc: jest.fn(() => clubRef) };
    const db = {
      collection: jest.fn((name) => {
        if (name !== 'clubs') throw new Error(`unexpected collection ${name}`);
        return clubsRef;
      }),
      runTransaction: jest.fn(),
    };
    return { db, attendeeSet };
  }

  function completionEvent(outerHour, embeddedField, embeddedHour) {
    return {
      params: { clubId: 'calypso', taskId: 'task-a' },
      data: {
        before: { data: () => ({ status: 'pending' }) },
        after: {
          data: () => ({
            type: 'pool_checkin',
            status: 'done',
            member_id: 'monitor-a',
            context: {
              pool_session_id: 'session-a',
              attendee_id: 'attendee-a',
            },
            completion_data: {
              outcome: 'encadrant',
              hours: {
                [outerHour]: {
                  activity: 'formation',
                  role: 'encadrant',
                  groups: [{
                    level: '2*',
                    group_number: 1,
                    [embeddedField]: embeddedHour,
                  }],
                },
              },
            },
          }),
        },
      },
    };
  }

  test.each([
    ['first outer versus embedded second', '1ere_heure', 'heure', '2eme_heure'],
    ['second outer versus embedded first', '2eme_heure', 'hourKey', '1ere_heure'],
    ['snake-case alias conflicts', '1ere_heure', 'hour_key', '2eme_heure'],
  ])('handler rejects encadrant hour conflict before reconciliation: %s', async (
    _label,
    outerHour,
    embeddedField,
    embeddedHour,
  ) => {
    const { db, attendeeSet } = makeHandlerDb();
    admin.firestore.mockReturnValue(db);

    await onPoolCheckinCompleted(
      completionEvent(outerHour, embeddedField, embeddedHour)
    );

    expect(db.runTransaction).not.toHaveBeenCalled();
    expect(attendeeSet).toHaveBeenCalledTimes(1);
    expect(attendeeSet.mock.calls[0][0]).toMatchObject({
      encadrantReport: {
        groups: [{
          heure: outerHour,
          matched: false,
          contractConflict: { hourKey: true },
        }],
      },
      hoursReport: {
        [outerHour]: {
          role: 'encadrant',
          groups: [{
            heure: outerHour,
            matched: false,
            contractConflict: { hourKey: true },
          }],
        },
      },
    });
  });

  test('reconcile guard performs no transaction for a marked conflict', async () => {
    const db = { runTransaction: jest.fn() };
    const rawGroup = encadrantGroupContract({
      level: '2*',
      group_number: 1,
      heure: '2eme_heure',
    }, '1ere_heure');

    await expect(reconcileEncadrantGroups(
      db,
      'calypso',
      'session-a',
      'monitor-a',
      [rawGroup],
    )).resolves.toEqual([{ ...rawGroup, matched: false }]);
    expect(db.runTransaction).not.toHaveBeenCalled();
  });

  function plannedSession() {
    return {
      niveaux: {
        '2*': {
          courses_by_hour: {
            '1ere_heure': [{
              id: 'course-first',
              order: 0,
              encadrants: [],
            }],
            '2eme_heure': [{
              id: 'course-second',
              order: 0,
              encadrants: [],
            }],
          },
        },
      },
    };
  }

  function makeReconcileDb(session) {
    const sessionRef = {};
    const txUpdate = jest.fn();
    const transaction = {
      get: jest.fn(async () => ({ exists: true, data: () => session })),
      update: txUpdate,
    };
    const db = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          collection: jest.fn(() => ({
            doc: jest.fn(() => sessionRef),
          })),
        })),
      })),
      runTransaction: jest.fn(async (callback) => callback(transaction)),
    };
    return { db, txUpdate };
  }

  test.each([
    [
      'wrong authoritative hour',
      '1ere_heure',
      { course_id: 'course-second', level: '2*', group_number: 1 },
    ],
    [
      'wrong level',
      '1ere_heure',
      { course_id: 'course-first', level: '1*', group_number: 1 },
    ],
    [
      'wrong group number',
      '1ere_heure',
      { course_id: 'course-first', level: '2*', group_number: 2 },
    ],
    [
      'wrong group key',
      '1ere_heure',
      {
        course_id: 'course-first',
        level: '2*',
        group_number: 1,
        group_key: '2star_groupe2',
      },
    ],
  ])('v4 course_id fails closed for %s without planning write', async (
    _label,
    outerHour,
    rawGroup,
  ) => {
    const session = plannedSession();
    const { db, txUpdate } = makeReconcileDb(session);
    const group = encadrantGroupContract(rawGroup, outerHour);

    await expect(reconcileEncadrantGroups(
      db,
      'calypso',
      'session-a',
      'monitor-a',
      [group],
    )).resolves.toEqual([{ ...group, matched: false }]);
    expect(txUpdate).not.toHaveBeenCalled();
    expect(session.niveaux['2*'].courses_by_hour['1ere_heure'][0].encadrants)
      .toEqual([]);
    expect(session.niveaux['2*'].courses_by_hour['2eme_heure'][0].encadrants)
      .toEqual([]);
  });

  test('v4 course_id reconciles when outer hour and group contract match', async () => {
    const session = plannedSession();
    const { db, txUpdate } = makeReconcileDb(session);
    const group = encadrantGroupContract({
      course_id: 'course-first',
      level: '2*',
      group_number: 1,
      group_key: '2star_groupe1',
    }, '1ere_heure');

    await expect(reconcileEncadrantGroups(
      db,
      'calypso',
      'session-a',
      'monitor-a',
      [group],
    )).resolves.toEqual([{ ...group, matched: true }]);
    expect(txUpdate).toHaveBeenCalledTimes(1);
    expect(session.niveaux['2*'].courses_by_hour['1ere_heure'][0].encadrants)
      .toEqual([{ membre_id: 'monitor-a' }]);
  });

  test('flat legacy course_id remains compatible without outer hour context', async () => {
    const session = plannedSession();
    const { db, txUpdate } = makeReconcileDb(session);
    const legacyGroup = {
      course_id: 'course-second',
      level: '2*',
      group_number: 1,
    };

    await expect(reconcileEncadrantGroups(
      db,
      'calypso',
      'session-a',
      'monitor-a',
      [legacyGroup],
    )).resolves.toEqual([{ ...legacyGroup, matched: true }]);
    expect(txUpdate).toHaveBeenCalledTimes(1);
    expect(session.niveaux['2*'].courses_by_hour['2eme_heure'][0].encadrants)
      .toEqual([{ membre_id: 'monitor-a' }]);
  });
});
