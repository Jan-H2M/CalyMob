const { MemoryFirestore } = require('../../test-utils/memoryFirestore');
const {
  normalizeTimestampMode,
  effectiveTimestampMode,
  usesUnreadTimestampV2,
} = require('./unreadTimestampFeatureFlag');

describe('unread timestamp v2 rollout gate', () => {
  test('defaults OFF and shadow enables only an explicit pilot', () => {
    expect(normalizeTimestampMode({})).toBe('off');
    const flags = {
      unreadTimestampV2Enabled: true,
      unreadTimestampV2Mode: 'shadow',
      unreadTimestampV2PilotMemberIds: ['pilot'],
    };
    expect(effectiveTimestampMode(flags, 'pilot')).toBe('on');
    expect(effectiveTimestampMode(flags, 'other')).toBe('shadow');
  });

  test.each([
    ['missing marker', undefined],
    ['backfilled while legacy writers remain', {
      schema_version: 2,
      status: 'backfilled',
      missing_count: 0,
      writer_contract: 'optional_legacy',
    }],
    ['complete without mandatory writer contract', {
      schema_version: 2,
      status: 'complete',
      missing_count: 0,
    }],
  ])('%s remains on cursor-v1 timestamp fields', async (_name, marker) => {
    const documents = {
      'clubs/c/settings/feature_flags': {
        unreadTimestampV2Enabled: true,
        unreadTimestampV2Mode: 'on',
      },
    };
    if (marker) documents['clubs/c/settings/unread_timestamp_v2_migration'] = marker;
    expect(await usesUnreadTimestampV2(
      new MemoryFirestore(documents), 'c', 'member',
    )).toBe(false);
  });

  test('requires final scan plus mandatory writer contract', async () => {
    const db = new MemoryFirestore({
      'clubs/c/settings/feature_flags': {
        unreadTimestampV2Enabled: true,
        unreadTimestampV2Mode: 'on',
      },
      'clubs/c/settings/unread_timestamp_v2_migration': {
        schema_version: 2,
        status: 'complete',
        missing_count: 0,
        writer_contract: 'required',
      },
    });
    expect(await usesUnreadTimestampV2(db, 'c', 'member')).toBe(true);
  });
});
