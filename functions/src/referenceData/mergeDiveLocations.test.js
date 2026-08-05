const { publicCounts, targetEnrichment } = require('./mergeDiveLocations');

describe('dive-location merge helpers', () => {
  test('keeps club-authored target values and fills only missing reference data', () => {
    expect(targetEnrichment(
      { description: 'Source description', latitude: 50.1, longitude: 4.2, reference_match: { provider: 'ssi' } },
      { description: 'Club description', latitude: 50.2, longitude: 4.3 },
    )).toEqual({ reference_match: { provider: 'ssi' } });
  });

  test('summarizes each type of affected record', () => {
    expect(publicCounts({
      operations: [{}], entries: [{}, {}], confirmations: [], tasks: [{}], sessions: [], unlinkedExactNameEntries: [{}, {}],
    })).toEqual({
      operations: 1, logbookEntries: 2, confirmations: 0, formationTasks: 1, poolSessions: 0, exactNameEntriesAvailable: 2,
    });
  });
});
