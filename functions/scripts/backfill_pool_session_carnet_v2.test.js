const { parseArgs } = require('./backfill_pool_session_carnet_v2.cjs');

describe('backfill_pool_session_carnet_v2 CLI guard', () => {
  test('defaults to dry-run for the production club', () => {
    expect(parseArgs([])).toEqual({
      apply: false,
      clubId: 'calypso',
      allowlist: [],
      help: false,
    });
  });

  test('accepts apply only as an explicit flag and preserves the exact allowlist', () => {
    expect(parseArgs([
      '--club=calypso',
      '--apply',
      '--session=session-a',
      '--session',
      'session-b',
    ])).toEqual({
      apply: true,
      clubId: 'calypso',
      allowlist: ['session-a', 'session-b'],
      help: false,
    });
  });

  test('fails closed on unknown arguments', () => {
    expect(() => parseArgs(['--all'])).toThrow('Unknown argument: --all');
  });
});
