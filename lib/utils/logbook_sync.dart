/// Canonical projection of a Firestore logbook document into UI/cache data.
///
/// Firestore owns the offline queue. Keeping pending-write metadata in the row
/// lets both list and service consumers show that a locally saved dive still
/// needs server acknowledgement.
Map<String, dynamic> logbookRowWithSyncState({
  required String id,
  required Map<String, dynamic> data,
  required bool hasPendingWrites,
}) {
  return <String, dynamic>{
    'id': id,
    '_pending': hasPendingWrites,
    ...data,
  };
}
