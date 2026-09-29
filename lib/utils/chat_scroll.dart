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
