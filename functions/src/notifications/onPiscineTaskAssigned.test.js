const mockSendEachForMulticast = jest.fn();
let mockMemberDocs = [];

jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdated: (_options, handler) => handler,
}));

jest.mock('firebase-admin', () => {
  const membersCollection = {
    where: jest.fn(() => ({
      get: jest.fn(async () => ({
        empty: mockMemberDocs.length === 0,
        docs: mockMemberDocs,
      })),
    })),
    doc: jest.fn(() => ({
      update: jest.fn(async () => undefined),
    })),
  };
  const firestore = jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => membersCollection),
      })),
    })),
  }));
  firestore.FieldValue = {
    arrayRemove: jest.fn(value => value),
  };

  return {
    firestore,
    messaging: jest.fn(() => ({
      sendEachForMulticast: mockSendEachForMulticast,
    })),
  };
});

jest.mock('../utils/badge-helper', () => ({
  collectTokensAndMembers: jest.fn(),
  sendNotificationsWithBadge: jest.fn(),
}));

const {
  extractAssignedMembers,
  onPiscineTaskAssigned,
} = require('./onPiscineTaskAssigned');

const assignment = membreId => ({ membre_id: membreId });

const event = (before, after) => ({
  params: { clubId: 'calypso', sessionId: 'session-1' },
  data: {
    before: { data: () => before },
    after: { data: () => after },
  },
});

const memberDoc = (id, data) => ({
  id,
  data: () => data,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMemberDocs = [];
  mockSendEachForMulticast.mockResolvedValue({
    successCount: 1,
    failureCount: 0,
    responses: [{ success: true }],
  });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('extracts snake_case and camelCase course assignments and deduplicates parallel courses', () => {
  const members = extractAssignedMembers({
    niveaux: {
      '2*': {
        encadrants: [assignment('duplicate')],
        courses_by_hour: {
          '1ere_heure': [
            { encadrants: [assignment('duplicate'), assignment('snake')] },
            { encadrants: [assignment('duplicate')] },
          ],
        },
      },
      '3*': {
        coursesByHour: {
          '2eme_heure': [{ encadrants: [assignment('camel')] }],
        },
      },
    },
  });

  expect([...members.get('duplicate')]).toEqual(['Encadrant 2*']);
  expect([...members.get('snake')]).toEqual(['Encadrant 2*']);
  expect([...members.get('camel')]).toEqual(['Encadrant 3*']);
});

test('keeps the canonical gonflage key while exposing the rangement label', () => {
  const members = extractAssignedMembers({
    gonflage: { '22h30': [assignment('member-1')] },
  });

  expect([...members.get('member-1')]).toEqual([
    'Rangement 22h30',
  ]);
});

test('sends one successful notification for a newly added course assignment', async () => {
  mockMemberDocs = [memberDoc('member-1', {
    app_installed: true,
    fcm_tokens: ['token-1'],
  })];

  const result = await onPiscineTaskAssigned(event(
    {},
    {
      niveaux: {
        '2*': {
          courses_by_hour: {
            '1ere_heure': [{ encadrants: [assignment('member-1')] }],
          },
        },
      },
    },
  ));

  expect(result).toEqual({ success: 1, failure: 0 });
  expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
  expect(mockSendEachForMulticast.mock.calls[0][0].notification.body)
    .toContain('Tu es assigné(e) : Encadrant 2*');
});

test('notifies a member when a parallel-course assignment is removed', async () => {
  mockMemberDocs = [memberDoc('member-1', {
    app_installed: true,
    fcm_token: 'token-1',
  })];

  const result = await onPiscineTaskAssigned(event(
    {
      niveaux: {
        '2*': {
          coursesByHour: {
            '2eme_heure': [{ encadrants: [assignment('member-1')] }],
          },
        },
      },
    },
    { niveaux: { '2*': { coursesByHour: {} } } },
  ));

  expect(result).toEqual({ success: 1, failure: 0 });
  const payload = mockSendEachForMulticast.mock.calls[0][0];
  expect(payload.notification.title).toBe('🏊 Piscine — Tâche retirée');
  expect(payload.notification.body)
    .toContain("Tu n'es plus assigné(e) : Encadrant 2*");
});

test('skips an assigned member without a notification token', async () => {
  mockMemberDocs = [memberDoc('member-1', { app_installed: true })];

  const result = await onPiscineTaskAssigned(event(
    {},
    { accueil: [assignment('member-1')] },
  ));

  expect(result).toEqual({ success: 0, failure: 0 });
  expect(mockSendEachForMulticast).not.toHaveBeenCalled();
});

test('respects the disabled piscine task preference', async () => {
  mockMemberDocs = [memberDoc('member-1', {
    app_installed: true,
    fcm_token: 'token-1',
    notification_preferences: { piscine_tasks: false },
  })];

  const result = await onPiscineTaskAssigned(event(
    {},
    { accueil: [assignment('member-1')] },
  ));

  expect(result).toEqual({ success: 0, failure: 0 });
  expect(mockSendEachForMulticast).not.toHaveBeenCalled();
});
