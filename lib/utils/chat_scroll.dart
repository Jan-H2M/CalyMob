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
  required ChatAnchorRegistry registry,
  required int? targetIndex,
  required int itemCount,
  int maxAttempts = 16,
}) async {
  if (!controller.hasClients) return;
  if (targetIndex == null || itemCount <= 0) {
    await _settleAtBottom(controller, maxAttempts: maxAttempts);
    return;
  }

  var lower = 0.0;
  var upper = controller.position.maxScrollExtent;
  var target = upper * (targetIndex / itemCount).clamp(0.0, 1.0);
  for (var attempt = 0; attempt < maxAttempts; attempt++) {
    if (!controller.hasClients) return;
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
    final range = registry.builtRange;
    if (range == null) continue;
    if (targetIndex > range.$2) {
      lower = target;
      // [maxScrollExtent] is only an estimate while ListView lazily lays out
      // variable-height rows. Refresh the upper bound after every forward
      // seek, otherwise the initial short-row estimate can permanently keep
      // the target outside the search interval.
      upper = upper < controller.position.maxScrollExtent
          ? controller.position.maxScrollExtent
          : upper;
      target = lower >= upper - 1 ? upper : (lower + upper) / 2;
    } else if (targetIndex < range.$1) {
      upper = target;
      target = (lower + upper) / 2;
    }
  }
  final context = targetKey.currentContext;
  if (context != null && context.mounted) {
    await Scrollable.ensureVisible(context,
        alignment: 0.15, duration: Duration.zero);
    return;
  }
  await _settleAtBottom(controller, maxAttempts: maxAttempts);
}

/// Reaches the real bottom of a finite, lazily built variable-height list.
///
/// `maxScrollExtent` begins as an estimate and may grow after a jump reveals
/// later rows. Re-read it after each frame until it settles, rather than
/// leaving an all-read conversation short of its latest message.
Future<void> _settleAtBottom(
  ScrollController controller, {
  required int maxAttempts,
}) async {
  for (var attempt = 0; attempt < maxAttempts; attempt++) {
    if (!controller.hasClients) return;
    final before = controller.position.maxScrollExtent;
    controller.jumpTo(before);
    await WidgetsBinding.instance.endOfFrame;
    if (!controller.hasClients) return;
    final after = controller.position.maxScrollExtent;
    if ((after - before).abs() < 1) {
      controller.jumpTo(after);
      return;
    }
  }
  if (controller.hasClients) {
    controller.jumpTo(controller.position.maxScrollExtent);
  }
}

class ChatAnchorRegistry {
  final Map<int, BuildContext> _contexts = {};
  void register(int index, BuildContext context) => _contexts[index] = context;
  void unregister(int index, BuildContext context) {
    if (identical(_contexts[index], context)) _contexts.remove(index);
  }

  (int, int)? get builtRange {
    if (_contexts.isEmpty) return null;
    final keys = _contexts.keys;
    return (
      keys.reduce((a, b) => a < b ? a : b),
      keys.reduce((a, b) => a > b ? a : b)
    );
  }
}

class ChatAnchorRow extends StatefulWidget {
  const ChatAnchorRow(
      {super.key,
      required this.index,
      required this.registry,
      required this.child});
  final int index;
  final ChatAnchorRegistry registry;
  final Widget child;
  @override
  State<ChatAnchorRow> createState() => _ChatAnchorRowState();
}

class _ChatAnchorRowState extends State<ChatAnchorRow> {
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    widget.registry.register(widget.index, context);
  }

  @override
  void dispose() {
    widget.registry.unregister(widget.index, context);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    widget.registry.register(widget.index, context);
    return widget.child;
  }
}
