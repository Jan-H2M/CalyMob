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
}
