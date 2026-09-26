const {
  memberHasChannelAccess,
  normalizeRoles,
} = require('./onNewTeamMessage');
const { hasTeamAccess } = require('./canonicalUnreadBadge');

describe('team notification/count audience parity', () => {
  test.each(['E', 'Encadrant', 'encadrants', 'Encadrant Carrière'])(
    'career encadrant alias %s receives and counts encadrants messages',
    (role) => {
      const member = { clubStatuten: [role] };
      expect(normalizeRoles(member.clubStatuten)).toContain('encadrant');
      expect(memberHasChannelAccess(member, 'encadrants')).toBe(true);
      expect(hasTeamAccess(member, { type: 'encadrants' })).toBe(true);
    },
  );

  test.each(['CA', 'ca', 'comite', 'Comite', 'comité', 'Comité'])(
    'CA alias %s receives and counts CA messages',
    (role) => {
      const member = { clubStatuten: [role] };
      expect(memberHasChannelAccess(member, 'ca')).toBe(true);
      expect(hasTeamAccess(member, { type: 'ca' })).toBe(true);
    },
  );

  test.each([
    [{ clubStatuten: ['conseil administration'] }, 'ca'],
    [{ clubStatuten: ['a'] }, 'accueil'],
    [{ clubStatuten: ['e'] }, 'encadrants'],
  ])('aliases outside the Firestore allowlist are denied by push and count', (member, type) => {
    expect(memberHasChannelAccess(member, type)).toBe(false);
    expect(hasTeamAccess(member, { type })).toBe(false);
  });

  test('Bureau is BS-only even for an administrator or CA member', () => {
    expect(memberHasChannelAccess({ app_role: 'admin' }, 'bureau')).toBe(false);
    expect(memberHasChannelAccess({ clubStatuten: ['CA'] }, 'bureau')).toBe(false);
    expect(memberHasChannelAccess({ clubStatuten: ['BS'] }, 'bureau')).toBe(true);
    expect(hasTeamAccess({ app_role: 'admin' }, { type: 'bureau' })).toBe(false);
    expect(hasTeamAccess({ clubStatuten: ['CA'] }, { type: 'bureau' })).toBe(false);
    expect(hasTeamAccess({ clubStatuten: ['BS'] }, { type: 'bureau' })).toBe(true);
  });

  test('formation target stays inaccessible until formation_active is true', () => {
    const inactive = { clubStatuten: ['M'], target_formation_level: '2*' };
    const active = { ...inactive, formation_active: true };
    expect(memberHasChannelAccess(inactive, 'formation_2_etoiles')).toBe(false);
    expect(hasTeamAccess(inactive, { type: 'formation_2_etoiles' })).toBe(false);
    expect(memberHasChannelAccess(active, 'formation_2_etoiles')).toBe(true);
    expect(hasTeamAccess(active, { type: 'formation_2_etoiles' })).toBe(true);
  });

  test('encadrant alone does not broaden formation access beyond Firestore rules', () => {
    const encadrant = { clubStatuten: ['E'] };
    expect(memberHasChannelAccess(encadrant, 'encadrants')).toBe(true);
    expect(hasTeamAccess(encadrant, { type: 'encadrants' })).toBe(true);
    expect(memberHasChannelAccess(encadrant, 'formation_2_etoiles')).toBe(false);
    expect(hasTeamAccess(encadrant, { type: 'formation_2_etoiles' })).toBe(false);

    const activeTarget = {
      clubStatuten: ['E'],
      formation_active: true,
      target_formation_level: '2*',
    };
    expect(memberHasChannelAccess(activeTarget, 'formation_2_etoiles')).toBe(true);
    expect(hasTeamAccess(activeTarget, { type: 'formation_2_etoiles' })).toBe(true);
  });

  test('formation matching is exact and ignores legacy push-only fields', () => {
    for (const member of [
      { formation_active: true, target_formation_level: 'Formation P2' },
      { formation_active: true, plongeur_code: 'Plongeur 1 étoile' },
      { formation_active: true, plongeur_niveau: 'P1' },
    ]) {
      expect(memberHasChannelAccess(member, 'formation_2_etoiles')).toBe(false);
      expect(hasTeamAccess(member, { type: 'formation_2_etoiles' })).toBe(false);
    }
  });

  test('club status admin is not an app-role admin override', () => {
    const statusOnly = { clubStatuten: ['admin'] };
    expect(memberHasChannelAccess(statusOnly, 'ca')).toBe(false);
    expect(hasTeamAccess(statusOnly, { type: 'ca' })).toBe(false);
    expect(memberHasChannelAccess({ ...statusOnly, app_role: 'admin' }, 'ca')).toBe(true);
    expect(hasTeamAccess({ ...statusOnly, app_role: 'admin' }, { type: 'ca' })).toBe(true);
  });
});
