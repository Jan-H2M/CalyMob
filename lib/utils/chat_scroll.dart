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
