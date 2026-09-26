const {
  assertBoutiqueAccess,
  hasBoutiqueResponsibility,
  isActiveBoutiqueMember,
  resolveBoutiqueAccessMode,
} = require('./shared');

class TestHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function snapshot(data) {
  return {
    exists: data != null,
    data: () => data,
  };
}

function clubRef({ flags = {}, member = null } = {}) {
  return {
    collection(name) {
      return {
        doc() {
          return {
            get: jest.fn(async () => snapshot(name === 'settings' ? flags : member)),
          };
        },
      };
    },
  };
}

function access({ flags, member }) {
  return assertBoutiqueAccess({
    clubRef: clubRef({ flags, member }),
    authUid: 'member-1',
    HttpsError: TestHttpsError,
  });
}

function activeMember(overrides = {}) {
  return {
    member_status: 'active',
    clubStatuten: [],
    app_role: 'user',
    feature_access: { boutique: false },
    ...overrides,
  };
}

describe('Boutique access helpers', () => {
  test.each([
    'Responsable boutique',
    'Responsable Boutique',
    'responsable boutique',
    'RESPONSABLE BOUTIQUE',
    'RB',
    'rb',
    'Rb',
    'rB',
  ])('accepts the Responsable boutique role variant %p', (role) => {
    expect(hasBoutiqueResponsibility(activeMember({ clubStatuten: [role] }))).toBe(true);
  });

  test('requires the exact active member status', () => {
    expect(isActiveBoutiqueMember(activeMember())).toBe(true);
    expect(isActiveBoutiqueMember(activeMember({ member_status: 'ACTIVE' }))).toBe(false);
    expect(isActiveBoutiqueMember(activeMember({ member_status: 'inactive' }))).toBe(false);
    expect(isActiveBoutiqueMember({})).toBe(false);
  });

  test.each([
    [{ boutiqueAccess: 'tous' }, 'tous'],
    [{ boutiqueAccess: 'testeurs' }, 'testeurs'],
    [{ boutiqueAccess: 'masque' }, 'masque'],
    [{ boutiqueAccess: 'unknown' }, 'testeurs'],
    [{}, 'testeurs'],
    [null, 'testeurs'],
  ])('normalizes access mode %#', (flags, expected) => {
    expect(resolveBoutiqueAccessMode(flags)).toBe(expected);
  });
});

describe('assertBoutiqueAccess', () => {
  const enabledPreparation = {
    boutiqueEnabled: true,
    boutiqueAccess: 'testeurs',
  };
  const enabledOnline = {
    boutiqueMobileEnabled: true,
    boutiqueAccess: 'tous',
  };

  test('allows an active Responsable boutique during preparation', async () => {
    await expect(access({
      flags: enabledPreparation,
      member: activeMember({ clubStatuten: ['Responsable boutique'] }),
    })).resolves.toMatchObject({
      isActiveMember: true,
      hasBoutiqueResponsibility: true,
    });
  });

  test('rejects an active ordinary member during preparation', async () => {
    await expect(access({
      flags: enabledPreparation,
      member: activeMember(),
    })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('rejects admin and legacy feature access without Boutique responsibility', async () => {
    await expect(access({
      flags: enabledPreparation,
      member: activeMember({
        app_role: 'superadmin',
        feature_access: { boutique: true },
      }),
    })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('allows every active member when online', async () => {
    await expect(access({
      flags: enabledOnline,
      member: activeMember(),
    })).resolves.toMatchObject({ isActiveMember: true });
  });

  test.each(['inactive', 'pending', ''])('rejects member status %p in every mode', async (status) => {
    const member = activeMember({
      member_status: status,
      clubStatuten: ['RB'],
    });

    await expect(access({
      flags: enabledPreparation,
      member,
    })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(access({
      flags: enabledOnline,
      member,
    })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('rejects a missing member document', async () => {
    await expect(access({
      flags: enabledOnline,
      member: null,
    })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('defensively rejects the legacy hidden mode', async () => {
    await expect(access({
      flags: {
        boutiqueEnabled: true,
        boutiqueAccess: 'masque',
      },
      member: activeMember({ clubStatuten: ['RB'] }),
    })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('rejects access while both enable flags are off', async () => {
    await expect(access({
      flags: {
        boutiqueEnabled: false,
        boutiqueMobileEnabled: false,
        boutiqueAccess: 'tous',
      },
      member: activeMember(),
    })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('invalid mode falls back to preparation', async () => {
    const flags = {
      boutiqueEnabled: true,
      boutiqueAccess: 'invalid',
    };

    await expect(access({
      flags,
      member: activeMember(),
    })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(access({
      flags,
      member: activeMember({ clubStatuten: ['rb'] }),
    })).resolves.toMatchObject({ hasBoutiqueResponsibility: true });
  });
});
