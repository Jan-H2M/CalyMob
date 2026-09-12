jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options, handler) => handler,
  HttpsError: class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: jest.fn(() => '__SERVER_TIMESTAMP__') },
}));

const { updateBirthdaySharingHandler } = require('./updateBirthdaySharing');

function createDb(memberData, staleDirectoryData = {}) {
  const state = new Map([
    ['clubs/calypso/members/member-1', { ...memberData }],
    ['clubs/calypso/member_directory/member-1', { ...staleDirectoryData }],
  ]);
  const ref = path => ({
    path,
    collection: name => ref(`${path}/${name}`),
    doc: id => ref(`${path}/${id}`),
  });
  const db = {
    collection: name => ref(name),
    runTransaction: jest.fn(async callback => callback({
      get: jest.fn(async documentRef => ({
        exists: state.has(documentRef.path),
        data: () => state.get(documentRef.path),
      })),
      update: jest.fn((documentRef, payload) => {
        state.set(documentRef.path, {
          ...(state.get(documentRef.path) || {}),
          ...payload,
        });
      }),
      set: jest.fn((documentRef, payload) => {
        state.set(documentRef.path, { ...payload });
      }),
    })),
    state,
  };
  return db;
}

describe('updateBirthdaySharing callable', () => {
  const belgianBirthday = new Date('1991-07-06T22:00:00.000Z');

  test('requires authentication before touching Firestore', async () => {
    const db = createDb({});
    await expect(updateBirthdaySharingHandler(
      { auth: null, data: { clubId: 'calypso', shareBirthday: false } },
      { db },
    )).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(db.runTransaction).not.toHaveBeenCalled();
  });

  test('rejects attempts to modify another member', async () => {
    const db = createDb({});
    await expect(updateBirthdaySharingHandler({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso',
        memberId: 'member-2',
        shareBirthday: false,
      },
    }, { db })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(db.runTransaction).not.toHaveBeenCalled();
  });

  test('atomically revokes a stale public birthday projection', async () => {
    const db = createDb(
      {
        first_name: 'Alice',
        last_name: 'Example',
        birth_date: belgianBirthday,
        share_birthday: true,
      },
      {
        share_birthday: true,
        birth_month: 7,
        birth_day: 7,
      },
    );

    const result = await updateBirthdaySharingHandler({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso',
        memberId: 'member-1',
        shareBirthday: false,
      },
    }, { db });

    expect(result).toEqual({
      shareBirthday: false,
      birthMonth: null,
      birthDay: null,
    });
    expect(db.state.get('clubs/calypso/members/member-1').share_birthday)
      .toBe(false);
    expect(db.state.get('clubs/calypso/member_directory/member-1'))
      .toMatchObject({
        share_birthday: false,
        birth_month: null,
        birth_day: null,
      });
  });

  test.each(['UTC', 'America/New_York'])(
    'projects 7 July in Brussels when the process timezone is %s',
    async processTimeZone => {
      const previous = process.env.TZ;
      process.env.TZ = processTimeZone;
      try {
        const db = createDb({
          first_name: 'Alice',
          last_name: 'Example',
          birth_date: belgianBirthday,
          share_birthday: false,
        });
        const result = await updateBirthdaySharingHandler({
          auth: { uid: 'member-1' },
          data: {
            clubId: 'calypso',
            memberId: 'member-1',
            shareBirthday: true,
          },
        }, { db });

        expect(result).toEqual({
          shareBirthday: true,
          birthMonth: 7,
          birthDay: 7,
        });
        expect(db.state.get('clubs/calypso/member_directory/member-1'))
          .toMatchObject({
            share_birthday: true,
            birth_month: 7,
            birth_day: 7,
          });
      } finally {
        process.env.TZ = previous;
      }
    },
  );
});
