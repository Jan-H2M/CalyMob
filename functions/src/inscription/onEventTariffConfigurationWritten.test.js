jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (options, handler) => ({ options, handler }),
}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('../utils/badge-helper', () => ({
  collectTokensAndMembers: jest.fn(),
  sendNotificationsWithBadge: jest.fn(),
}));

const admin = require('firebase-admin');
const { collectTokensAndMembers, sendNotificationsWithBadge } = require('../utils/badge-helper');
const { missingPaidMemberTariffProblem } = require('./eventTariffSafety');
const { onEventTariffConfigurationWritten: trigger } = require('./onEventTariffConfigurationWritten');

const ref = { path: 'clubs/calypso/operations/event' };
const params = { clubId: 'calypso', operationId: 'event' };
const member = { id: 'member', label: 'Membre', price: 27 };
const valid = { type: 'evenement', titre: 'Sortie', organisateur_id: 'owner', creator_user_id: 'creator', event_tariffs: [member] };
const invalid = { ...valid, event_tariffs: [{ ...member, is_guest_tariff: true }] };
const problemsField = 'tariff_configuration_problems';
const checkedAtField = 'tariff_configuration_checked_at';
const deleteField = Symbol('delete');
const timestamp = Symbol('timestamp');

function snapshot(data) {
  return { ref, exists: data != null, data: () => data };
}

function write(before, after) {
  return trigger.handler({ params, data: { before: snapshot(before), after: snapshot(after) } });
}

let current;
let db;
let transaction;

beforeEach(() => {
  jest.clearAllMocks();
  current = undefined;
  let queue = Promise.resolve();
  transaction = {
    get: jest.fn(async () => snapshot(current)),
    update: jest.fn((_ref, patch) => {
      current = { ...current };
      for (const [key, value] of Object.entries(patch)) {
        if (value === deleteField) delete current[key];
        else current[key] = value;
      }
    }),
  };
  db = {
    runTransaction: jest.fn((callback) => {
      queue = queue.then(() => callback(transaction));
      return queue;
    }),
    doc: jest.fn(path => path),
    getAll: jest.fn(async (...paths) => paths),
  };
  admin.firestore.mockReturnValue(db);
  admin.firestore.FieldValue = {
    delete: () => deleteField,
    serverTimestamp: () => timestamp,
  };
  collectTokensAndMembers.mockReturnValue({ memberTokenGroups: new Map([['owner', ['token']]]) });
});

test('targets operations in europe-west1 and ignores deletions and non-events', async () => {
  expect(trigger.options).toEqual({ document: 'clubs/{clubId}/operations/{operationId}', region: 'europe-west1' });
  await write(invalid, undefined);
  await write(undefined, { ...invalid, type: 'autre' });
  expect(admin.firestore).not.toHaveBeenCalled();
});

test('stores diagnostics once and alerts the organiser and distinct creator on new problems only', async () => {
  current = invalid;
  await Promise.all([write(valid, invalid), write(valid, invalid)]);
  expect(transaction.update).toHaveBeenCalledTimes(1);
  expect(transaction.update).toHaveBeenCalledWith(ref, {
    [problemsField]: [expect.stringContaining('membres ordinaires')],
    [checkedAtField]: timestamp,
  });
  expect(db.getAll).toHaveBeenCalledWith('clubs/calypso/members/owner', 'clubs/calypso/members/creator');
  expect(sendNotificationsWithBadge).toHaveBeenCalledTimes(1);
  expect(sendNotificationsWithBadge).toHaveBeenCalledWith(
    'calypso', expect.any(Map),
    expect.objectContaining({
      data: expect.objectContaining({ type: 'event_tariff_configuration', operation_id: 'event' }),
    }),
    'event_tariff_configuration',
  );

  await write(invalid, current); // The trigger's own diagnostic write.
  current = { ...current, titre: 'Autre titre', creator_user_id: 'owner' };
  await write(invalid, current);
  expect(transaction.update).toHaveBeenCalledTimes(1);
  expect(sendNotificationsWithBadge).toHaveBeenCalledTimes(1);

  current = { ...current, event_tariffs: [{ ...current.event_tariffs[0], price: -1 }] };
  await write(invalid, current);
  expect(transaction.update).toHaveBeenCalledTimes(2);
  expect(db.getAll).toHaveBeenLastCalledWith('clubs/calypso/members/owner');
  expect(sendNotificationsWithBadge).toHaveBeenCalledTimes(2);
});

test('clears both fields when fixed and ignores stale deliveries after the repair', async () => {
  current = { ...valid, [problemsField]: ['Old problem'], [checkedAtField]: timestamp };
  await write(invalid, current);
  expect(transaction.update).toHaveBeenCalledWith(ref, {
    [problemsField]: deleteField,
    [checkedAtField]: deleteField,
  });
  await write(valid, invalid);
  expect(transaction.update).toHaveBeenCalledTimes(1);
  expect(sendNotificationsWithBadge).not.toHaveBeenCalled();
});

test('keeps the diagnosis when the last legacy paid tariff was removed', async () => {
  const removal = { ...valid, event_tariffs: [] };
  current = { ...removal, titre: 'Edited in the meantime' };
  await write(valid, removal);
  expect(current[problemsField]).toEqual([missingPaidMemberTariffProblem]);
  await write(removal, current);
  expect(transaction.update).toHaveBeenCalledTimes(1);
  expect(sendNotificationsWithBadge).toHaveBeenCalledTimes(1);

  current = { ...current, event_tariffs: [{ ...member, price: 0 }] };
  await write(removal, current);
  expect(current).not.toHaveProperty(problemsField);
});
