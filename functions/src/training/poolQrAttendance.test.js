jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options, handler) => handler,
  HttpsError: class extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
}));

jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: { fromMillis: millis => ({ millis, toMillis: () => millis }) },
  Filter: {
    where: (field, operator, value) => ({ field, operator, value }),
    or: (...filters) => ({ filters }),
  },
}));

const { executeQrAttendance } = require('./poolQrAttendance');
const { mayScan } = require('./poolQrAttendance');

const NOW = Date.parse('2026-11-04T20:00:00.000Z');
const scannerPath = 'clubs/calypso/members/scanner';
const memberPath = 'clubs/calypso/members/member';
const sessionPath = 'clubs/calypso/piscine_sessions/session';
const attendeePath = `${sessionPath}/attendees/member`;
const receiptPath = `${sessionPath}/qr_scan_receipts/member`;

function fixture({ scanner, member, session, attendee } = {}) {
  const data = new Map([
    [scannerPath, scanner || {
      member_status: 'active',
      app_role: 'admin',
    }],
    [memberPath, member || {
      member_status: 'active',
      prenom: 'Alice',
      nom: 'Exemple',
    }],
    [sessionPath, session || {
      type: 'piscine',
      date: { toMillis: () => NOW },
    }],
  ]);
  if (attendee) data.set(attendeePath, attendee);

  const reference = path => ({
    path,
    collection: name => collection(`${path}/${name}`),
  });
  const collection = path => ({
    path,
    doc: id => reference(`${path}/${id}`),
    where: filter => ({ path, filter, isQuery: true }),
  });
  const documentSnapshot = path => ({
    id: path.split('/').at(-1),
    exists: data.has(path),
    data: () => data.get(path),
  });
  const querySnapshot = query => {
    const prefix = `${query.path}/`;
    const docs = [...data.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .filter(([, value]) => query.filter.filters.some(filter => value?.[filter.field] === filter.value))
      .map(([path]) => documentSnapshot(path));
    return { docs, empty: docs.length === 0 };
  };

  const db = {
    collection,
    runTransaction: async callback => {
      const writes = [];
      const result = await callback({
        get: async target => target.isQuery
          ? querySnapshot(target)
          : documentSnapshot(target.path),
        set: (target, value) => writes.push(() => data.set(target.path, value)),
        create: (target, value) => writes.push(() => {
          if (data.has(target.path)) throw new Error('already exists');
          data.set(target.path, value);
        }),
      });
      writes.forEach(write => write());
      return result;
    },
  };
  const request = {
    clubId: 'calypso',
    sessionId: 'session',
    memberId: 'member',
  };
  return { db, data, request };
}

async function expectRefusal(setup, code) {
  const state = fixture(setup);
  const before = JSON.stringify([...state.data]);
  await expect(executeQrAttendance(state.db, 'scanner', state.request, NOW))
    .rejects.toMatchObject({ code });
  expect(JSON.stringify([...state.data])).toBe(before);
}

test('refuses a scanner without an authorized role', async () => {
  await expectRefusal({
    scanner: {
      member_status: 'active',
      app_role: 'user',
      clubStatuten: ['Membre'],
    },
  }, 'permission-denied');
});

test('refuses an inactive member', async () => {
  await expectRefusal({
    member: {
      member_status: 'inactive',
      prenom: 'Alice',
      nom: 'Exemple',
    },
  }, 'failed-precondition');
});

test('allows administrative attendance entry outside the former 36-hour window', async () => {
  const { db, data, request } = fixture({
    session: {
      type: 'piscine',
      date: { toMillis: () => NOW + 37 * 60 * 60 * 1000 },
    },
  });

  await expect(executeQrAttendance(db, 'scanner', request, NOW))
    .resolves.toEqual({ registered: true });
  expect(data.get(attendeePath)?.memberId).toBe('member');
});

test('refuses a theory session', async () => {
  await expectRefusal({
    session: {
      type: 'theorie',
      date: { toMillis: () => NOW },
    },
  }, 'failed-precondition');
});

test('refuses a member who is already present', async () => {
  await expectRefusal({
    attendee: { memberId: 'member', memberName: 'Alice Exemple' },
  }, 'already-exists');
});

test('writes the attendee and QR receipt on success', async () => {
  const { db, data, request } = fixture();

  await expect(executeQrAttendance(db, 'scanner', request, NOW))
    .resolves.toEqual({ registered: true });

  const receipt = data.get(receiptPath);
  expect(receipt).toMatchObject({
    version: 1,
    scannerUid: 'scanner',
    memberId: 'member',
    sessionId: 'session',
  });
  expect(receipt.scannedAt.toMillis()).toBe(NOW);
  expect(data.get(attendeePath)).toEqual({
    memberId: 'member',
    memberName: 'Alice Exemple',
    scannedAt: receipt.scannedAt,
    scannedBy: 'scanner',
    isGuest: false,
    qrVerified: receipt,
  });
});

test.each(['Membre', 'MC', 'AM', '', 'G'])(
  'ordinary/non-scanner function %s cannot create trusted attendance',
  role => {
    expect(mayScan({
      member_status: 'active',
      app_role: 'user',
      clubStatuten: [role],
    })).toBe(false);
  },
);

test.each(['Accueil', 'Encadrant', 'Encadrants et assistants', 'CA'])(
  'active existing scanner function %s remains authorized',
  role => {
    expect(mayScan({ member_status: 'active', clubStatuten: [role] }))
      .toBe(true);
  },
);

test('inactive scanners/admins fail closed and legacy default is explicit', () => {
  expect(mayScan({ member_status: 'inactive', app_role: 'admin' })).toBe(false);
  expect(mayScan({ member_status: 'active', fonctionDefaut: 'Accueil' }))
    .toBe(true);
  expect(mayScan({ member_status: 'active', clubStatuten: 'Accueil' }))
    .toBe(false);
});
