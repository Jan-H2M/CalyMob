const { resolveMemberStatus, isActiveMember } = require('./memberStatus');

describe('member status resolver', () => {
  test('canonical inactive status wins over stale active legacy fields', () => {
    const record = {
      member_status: 'inactive',
      app_status: 'active',
      status: 'active',
      isActive: true,
      actif: true,
    };

    expect(resolveMemberStatus(record)).toBe('inactive');
    expect(isActiveMember(record)).toBe(false);
  });

  test('legacy fields remain fallback-only while member_status is absent', () => {
    expect(resolveMemberStatus({ status: 'ACTIVE' })).toBe('active');
    expect(isActiveMember({ isActive: true })).toBe(true);
    expect(isActiveMember({ actif: false })).toBe(false);
  });

  test('supports the historical active default used by projections', () => {
    expect(resolveMemberStatus({}, { defaultStatus: 'active' })).toBe('active');
  });
});
