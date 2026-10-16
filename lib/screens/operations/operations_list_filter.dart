import '../../models/activity_item.dart';

/// The past toggle must show historical rows first, while still retaining
/// exceptional future-dated closed/cancelled events with unread discussions.
List<ActivityItem> filterOperationsForView(
  List<ActivityItem> source, {
  required String selectedFilter,
  required bool includePast,
  required DateTime now,
}) {
  final isClosedMode = selectedFilter == 'closed';
  final filtered = source.where((item) {
    final isFinishedEvent =
        const {'ferme', 'annule'}.contains(item.operation?.statut);
    if (includePast &&
        !isClosedMode &&
        item.date.isAfter(now) &&
        !isFinishedEvent) {
      return false;
    }
    return isClosedMode ||
        selectedFilter == 'all' ||
        item.categorie == selectedFilter;
  }).toList();
  final mostRecentFirst = isClosedMode || includePast;
  filtered.sort((a, b) {
    if (includePast && !isClosedMode) {
      final aFuture = a.date.isAfter(now);
      final bFuture = b.date.isAfter(now);
      if (aFuture != bFuture) return aFuture ? 1 : -1;
      if (aFuture) return a.date.compareTo(b.date);
    }
    return mostRecentFirst
        ? b.date.compareTo(a.date)
        : a.date.compareTo(b.date);
  });
  return filtered;
}
