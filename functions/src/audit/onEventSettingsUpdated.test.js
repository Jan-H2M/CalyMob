'use strict';
jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdatedWithAuthContext: (_options, handler) => handler,
}));
jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => 'server-time' } },
}));

const { onEventSettingsUpdated } = require('./onEventSettingsUpdated');

function makeEvent(create) {
  return {
    id: 'eventarc-delivery-1', time: '2026-11-07T12:00:00Z', authType: 'user', authId: 'user-1',
    data: {
      before: { data: () => ({ type: 'evenement', payment_required: false }) },
      after: {
        data: () => ({ type: 'evenement', payment_required: true }),
        ref: { collection: () => ({ doc: () => ({ create }) }) },
      },
    },
  };
}

test('writes one immutable entry containing the actual change and actor', async () => {
  const create = jest.fn().mockResolvedValue(undefined);
  await onEventSettingsUpdated(makeEvent(create));
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0][0]).toMatchObject({ actor_id: 'user-1', recorded_at: 'server-time',
    changes: [{ field: 'payment_required', old_present: true, new_present: true, old_value: false, new_value: true }] });
});

test('a duplicate delivery does not modify the existing history', async () => {
  const create = jest.fn().mockRejectedValue({ code: 6 });
  await expect(onEventSettingsUpdated(makeEvent(create))).resolves.toBeUndefined();
});

test('other write failures are propagated so delivery can retry', async () => {
  const create = jest.fn().mockRejectedValue(new Error('database unavailable'));
  await expect(onEventSettingsUpdated(makeEvent(create))).rejects.toThrow('database unavailable');
});
