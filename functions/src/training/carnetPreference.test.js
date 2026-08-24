const { usesCarnet, isCarnetTaskType } = require('./carnetPreference');

describe('usesCarnet', () => {
  test('defaults to true when the field is missing', () => {
    expect(usesCarnet({})).toBe(true);
    expect(usesCarnet(null)).toBe(true);
  });

  test('is false only on an explicit false', () => {
    expect(usesCarnet({ uses_carnet: false })).toBe(false);
    expect(usesCarnet({ uses_carnet: true })).toBe(true);
  });
});

describe('isCarnetTaskType', () => {
  test('matches logbook invite types only', () => {
    expect(isCarnetTaskType('logbook_completion')).toBe(true);
    expect(isCarnetTaskType('buddy_confirmation')).toBe(true);
    expect(isCarnetTaskType('pool_checkin')).toBe(false);
    expect(isCarnetTaskType('monitor_validation')).toBe(false);
  });
});
