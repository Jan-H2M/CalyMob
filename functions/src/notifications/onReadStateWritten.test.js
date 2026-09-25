const { cursorAdvanced } = require('./onReadStateWritten');

const timestamp = (millis) => ({ toMillis: () => millis });

describe('read-state badge reconciliation guards', () => {
  test('does not reconcile unchanged or older cursors', () => {
    expect(cursorAdvanced({ last_seen_at: timestamp(10) }, { last_seen_at: timestamp(10) })).toBe(false);
    expect(cursorAdvanced({ last_seen_at: timestamp(10) }, { last_seen_at: timestamp(9) })).toBe(false);
  });

  test('reconciles an advancing root or scoped cursor', () => {
    expect(cursorAdvanced({}, { last_seen_at: timestamp(10) })).toBe(true);
    expect(cursorAdvanced({ global_last_seen_at: timestamp(10) }, { global_last_seen_at: timestamp(11) })).toBe(true);
  });
});
