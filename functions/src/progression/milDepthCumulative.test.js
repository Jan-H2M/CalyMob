const { computeExperienceCounts } = require('./rebuildFormationSnapshot');
const cases = require('../../../test/fixtures/mil_depth_cumulative.json');
describe('MIL cumulative general depths: shared boundary oracle', () => {
  test.each(cases)('$name', ({entry, expected}) => {
    const counts = computeExperienceCounts([entry], {});
    for (const [key, value] of Object.entries(expected)) expect(counts[key]).toBe(value);
  });
});
