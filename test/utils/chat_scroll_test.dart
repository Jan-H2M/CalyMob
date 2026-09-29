import 'package:calymob/utils/chat_scroll.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final first = DateTime(2026, 9, 29, 10);
  final second = DateTime(2026, 9, 29, 11);
  final third = DateTime(2026, 9, 29, 12);

  test('finds the first message strictly after the read cursor', () {
    expect(firstUnreadMessageIndex([first, second, third], first), 1);
  });

  test('returns null when every message is already read', () {
    expect(firstUnreadMessageIndex([first, second, third], third), isNull);
  });

  test('does not infer an unread divider before the pre-open cursor loads', () {
    expect(firstUnreadMessageIndex([first, second], null), isNull);
  });

  test('uses the server-normalized unread timestamp for a skewed message', () {
    final cursor = DateTime(2026, 9, 29, 11);
    final legacyCreatedAt = DateTime(2026, 9, 29, 10);
    final unreadCreatedAt = DateTime(2026, 9, 29, 12);

    expect(
      firstUnreadMessageIndex([legacyCreatedAt], cursor),
      isNull,
      reason: 'The legacy client timestamp is before the server cursor.',
    );
    expect(
      firstUnreadMessageIndex([unreadCreatedAt], cursor),
      0,
      reason: 'The canonical unread timestamp must place the divider.',
    );
  });

  test('cursor authority prefers the server cursor over a stale device mirror',
      () {
    expect(
      initialConversationReadCursor(
        usesCursorAuthority: true,
        canonicalCursor: second,
        legacyCursor: first,
      ),
      second,
    );
  });

  test('legacy authority keeps the device mirror during the rollout', () {
    expect(
      initialConversationReadCursor(
        usesCursorAuthority: false,
        canonicalCursor: third,
        legacyCursor: first,
      ),
      first,
    );
  });

  test('falls back to the install baseline only with no usable cursor', () {
    expect(
      initialConversationReadCursor(
        usesCursorAuthority: true,
        installBaseline: second,
      ),
      second,
    );
  });
}
