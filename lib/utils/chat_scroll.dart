import 'package:flutter/widgets.dart';

/// Returns the first message that was created strictly after [lastRead].
///
/// A null result means the conversation has no unread messages; callers then
/// use their normal "latest message" fallback.
int? firstUnreadMessageIndex(
  Iterable<DateTime> messageTimes,
  DateTime? lastRead,
) {
  if (lastRead == null) return null;

  var index = 0;
  for (final createdAt in messageTimes) {
    if (createdAt.isAfter(lastRead)) return index;
    index++;
  }
  return null;
}

/// Selects the authority that was in force when the conversation was opened.
///
/// Cursor v1 is server-owned, so its value must win over this device's legacy
/// rollback mirror. The local value remains the fallback while the rollout is
/// explicitly in legacy mode or when the server has no cursor for this scope.
DateTime initialConversationReadCursor({
  required bool usesCursorAuthority,
  DateTime? canonicalCursor,
  DateTime? legacyCursor,
  DateTime? installBaseline,
}) =>
    usesCursorAuthority && canonicalCursor != null
        ? canonicalCursor
        : legacyCursor ?? installBaseline ?? DateTime(2024);

/// Brings an initially off-screen unread divider into the viewport.
///
/// A lazily built list has no [targetKey] context until it is near the
/// viewport. Start at a proportional estimate, let the list build that area,
/// then use [Scrollable.ensureVisible] once the divider exists. A chat with no
/// unread target retains the established latest-message fallback.
Future<void> anchorToIndex({
  required ScrollController controller,
  required GlobalKey targetKey,
  required int? targetIndex,
  required int itemCount,
  int maxAttempts = 6,
}) async {
  if (!controller.hasClients) return;
  if (targetIndex == null || itemCount <= 0) {
    controller.jumpTo(controller.position.maxScrollExtent);
    return;
  }

  final fraction = (targetIndex / itemCount).clamp(0.0, 1.0);
  for (var attempt = 0; attempt < maxAttempts; attempt++) {
    if (!controller.hasClients) return;
    final target = controller.position.maxScrollExtent * fraction;
    controller.jumpTo(target);
    await WidgetsBinding.instance.endOfFrame;

    final context = targetKey.currentContext;
    if (context != null && context.mounted) {
      await Scrollable.ensureVisible(
        context,
        alignment: 0.15,
        duration: Duration.zero,
      );
      return;
    }
  }
}
