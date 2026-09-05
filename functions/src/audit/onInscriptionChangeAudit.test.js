jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_options, handler) => handler,
}));

jest.mock('firebase-admin', () => ({
  firestore: Object.assign(jest.fn(), {
    FieldValue: { serverTimestamp: jest.fn(() => 'server-time') },
    Timestamp: { fromDate: jest.fn(date => date) },
  }),
}));

const {
  actorMetadata,
  changedFields,
  classifyEvent,
} = require('./onInscriptionChangeAudit');

describe('registration audit classification', () => {
  test('classifies a preserved cancellation as an unregistration', () => {
    expect(classifyEvent(
      { registration_status: 'pending_payment' },
      { registration_status: 'canceled', last_action: 'unregistered' },
    )).toBe('unregistered');
  });

  test('flags every unexpected document deletion as a hard-delete incident', () => {
    expect(classifyEvent({ registration_status: 'confirmed' }, null)).toBe('hard_deleted');
    expect(actorMetadata(
      { last_action_by: 'old-actor', last_action_source: 'calymob' },
      null,
      'hard_deleted',
    )).toEqual(expect.objectContaining({
      actor_uid: null,
      source: 'unattributed_direct_delete',
      reason: 'unexpected_hard_delete',
    }));
  });

  test('records all changed business fields while ignoring timestamp noise', () => {
    expect(changedFields(
      { paye: false, prix: 10, updated_at: 'old', selected_supplements: [] },
      { paye: true, prix: 10, updated_at: 'new', selected_supplements: [{ id: 'meal' }] },
    )).toEqual(['paye', 'selected_supplements']);
  });

  test('uses server-stamped actor, source, version and reason metadata', () => {
    expect(actorMetadata({
      last_action_at: 'old',
    }, {
      last_action_at: 'new',
      last_action_by: 'admin-1',
      last_action_by_name: 'Alice Admin',
      last_action_by_role: 'admin',
      last_action_source: 'calycompta',
      last_action_app_version: 'web-204',
      last_action_reason: 'admin_cancellation',
    }, 'unregistered')).toEqual({
      actor_uid: 'admin-1',
      actor_name: 'Alice Admin',
      actor_role: 'admin',
      source: 'calycompta',
      app_version: 'web-204',
      reason: 'admin_cancellation',
    });
  });

  test('never attributes an update to stale actor metadata', () => {
    const stale = {
      last_action_at: 'same',
      last_action_by: 'member-1',
      last_action_by_name: 'Ancien acteur',
      last_action_source: 'calymob',
    };
    expect(actorMetadata(stale, { ...stale, paye: true }, 'updated')).toEqual({
      actor_uid: null,
      actor_name: null,
      actor_role: null,
      source: 'unattributed_update',
      app_version: null,
      reason: 'missing_fresh_action_metadata',
    });
  });
});
