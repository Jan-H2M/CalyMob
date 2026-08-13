const { summarizeReferences, hasReferences } = require('./deleteDiveLocationSafely');

describe('safe dive-location deletion', () => {
  test('summarizes all reference consumers', () => {
    const refs = {
      operations: [{}],
      logbookEntries: [{}, {}],
      confirmations: [],
      formationTasks: [{}],
      poolSessions: [],
    };
    expect(summarizeReferences(refs)).toEqual({
      operations: 1,
      logbookEntries: 2,
      confirmations: 0,
      formationTasks: 1,
      poolSessions: 0,
    });
    expect(hasReferences(refs)).toBe(true);
  });

  test('allows deletion only when every consumer list is empty', () => {
    expect(hasReferences({
      operations: [],
      logbookEntries: [],
      confirmations: [],
      formationTasks: [],
      poolSessions: [],
    })).toBe(false);
  });
});
