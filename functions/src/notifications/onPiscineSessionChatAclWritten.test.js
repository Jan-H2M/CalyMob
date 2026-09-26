const { MemoryFirestore } = require('../../test-utils/memoryFirestore');

jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (options, handler) => ({ options, handler }),
}));

const {
  maintainSessionChatAcl,
  onPiscineSessionChatAclWritten,
} = require('./onPiscineSessionChatAclWritten');

test('the ACL write trigger keeps retry enabled', () => {
  expect(onPiscineSessionChatAclWritten.options).toMatchObject({
    region: 'europe-west1',
    retry: true,
  });
});

test('a late retry derives ACL from the current document, not the stale event', async () => {
  const path = 'clubs/c/piscine_sessions/s';
  const currentAcl = {
    accueil: ['new-assignment'],
    encadrants: [],
    niveaux: {},
  };
  const db = new MemoryFirestore({
    [path]: {
      accueil: [{ membre_id: 'new-assignment' }],
      baptemes: [],
      niveaux: {},
      chat_acl: currentAcl,
    },
  });
  const staleEvent = {
    exists: true,
    ref: db.doc(path),
    data: () => ({
      accueil: [{ membre_id: 'old-assignment' }],
      baptemes: [],
      niveaux: {},
      chat_acl: { accueil: [], encadrants: [], niveaux: {} },
    }),
  };

  await expect(maintainSessionChatAcl(staleEvent, db))
    .resolves.toEqual({ skipped: 'unchanged' });
  expect(db.docs.get(path).chat_acl).toEqual(currentAcl);

  await expect(maintainSessionChatAcl(staleEvent, db))
    .resolves.toEqual({ skipped: 'unchanged' });
  expect(db.docs.get(path).chat_acl).toEqual(currentAcl);
});

test('an outdated current ACL is repaired from current assignments', async () => {
  const path = 'clubs/c/piscine_sessions/s';
  const db = new MemoryFirestore({
    [path]: {
      accueil: [{ membre_id: 'current-assignment' }],
      baptemes: [],
      niveaux: {},
      chat_acl: { accueil: ['old-assignment'], encadrants: [], niveaux: {} },
    },
  });
  const staleEvent = {
    exists: true,
    ref: db.doc(path),
    data: () => ({
      accueil: [{ membre_id: 'old-assignment' }],
      baptemes: [],
      niveaux: {},
      chat_acl: { accueil: [], encadrants: [], niveaux: {} },
    }),
  };

  await expect(maintainSessionChatAcl(staleEvent, db)).resolves.toEqual({
    updated: true,
    chatAcl: { accueil: ['current-assignment'], encadrants: [], niveaux: {} },
  });
  expect(db.docs.get(path).chat_acl).toEqual({
    accueil: ['current-assignment'],
    encadrants: [],
    niveaux: {},
  });
});

test('a late ACL retry does not recreate a deleted session', async () => {
  const path = 'clubs/c/piscine_sessions/deleted';
  const db = new MemoryFirestore();
  const staleEvent = {
    exists: true,
    ref: db.doc(path),
    data: () => ({
      accueil: [{ membre_id: 'old-assignment' }],
      baptemes: [],
      niveaux: {},
    }),
  };

  await expect(maintainSessionChatAcl(staleEvent, db))
    .resolves.toEqual({ skipped: 'deleted' });
  expect(db.docs.has(path)).toBe(false);
});
