const { normalizeGroupKey } = require('./groupKey');

describe('normalizeGroupKey (WP-03)', () => {
  it('converts the legacy web format to canonical', () => {
    expect(normalizeGroupKey('2*-1')).toBe('2star_groupe1');
    expect(normalizeGroupKey('AM-2')).toBe('AM_groupe2');
  });

  it('leaves an already-canonical key unchanged', () => {
    expect(normalizeGroupKey('2star_groupe1')).toBe('2star_groupe1');
    expect(normalizeGroupKey('AM_groupe2')).toBe('AM_groupe2');
  });

  it('passes through empty / null / undefined unchanged', () => {
    expect(normalizeGroupKey('')).toBe('');
    expect(normalizeGroupKey(null)).toBeNull();
    expect(normalizeGroupKey(undefined)).toBeUndefined();
  });

  it('does not touch a value without a trailing -<digits>', () => {
    expect(normalizeGroupKey('random')).toBe('random');
    expect(normalizeGroupKey('3*')).toBe('3*');
  });
});
