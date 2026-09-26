const { ensurePiscineSessionChatAclCore } = require('./ensurePiscineSessionChatAcl');
const { MemoryFirestore } = require('../../test-utils/memoryFirestore');

test('repairs missing ACL idempotently without granting the caller access', async () => {
  const db = new MemoryFirestore({
    'clubs/c/members/caller': { app_role: 'user' },
    'clubs/c/piscine_sessions/s': {
      accueil: [{ membre_id: 'assigned' }],
      baptemes: [],
      niveaux: {},
    },
  });
  expect(await ensurePiscineSessionChatAclCore({
    db, uid: 'caller', clubId: 'c', sessionId: 's',
  })).toEqual({ status: 'repaired' });
  expect(db.docs.get('clubs/c/piscine_sessions/s').chat_acl).toEqual({
    accueil: ['assigned'], encadrants: [], niveaux: {},
  });
  expect(await ensurePiscineSessionChatAclCore({
    db, uid: 'caller', clubId: 'c', sessionId: 's',
  })).toEqual({ status: 'ready' });
});

test('rejects a caller who is not a club member', async () => {
  const db = new MemoryFirestore({
    'clubs/c/piscine_sessions/s': { accueil: [], baptemes: [], niveaux: {} },
  });
  await expect(ensurePiscineSessionChatAclCore({
    db, uid: 'outsider', clubId: 'c', sessionId: 's',
  })).rejects.toMatchObject({ code: 'permission-denied' });
});

test('repairs legacy camelCase course-only encadrant assignments', async () => {
  const db = new MemoryFirestore({
    'clubs/c/members/caller': { member_status: 'active' },
    'clubs/c/piscine_sessions/s': {
      accueil: [],
      baptemes: [],
      niveaux: {
        P2: {
          coursesByHour: {
            h20: [{ encadrants: [{ membre_id: 'course-only' }] }],
          },
        },
      },
    },
  });
  await ensurePiscineSessionChatAclCore({
    db, uid: 'caller', clubId: 'c', sessionId: 's',
  });
  expect(db.docs.get('clubs/c/piscine_sessions/s').chat_acl).toEqual({
    accueil: [],
    encadrants: ['course-only'],
    niveaux: { P2: ['course-only'] },
  });
});
