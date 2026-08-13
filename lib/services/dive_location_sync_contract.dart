import 'package:cloud_firestore/cloud_firestore.dart';

/// Shared state vocabulary for every dive-location read.
enum DiveLocationLoadState { fresh, cached, offline, error, empty }

class DiveLocationLoadResult<T> {
  final List<T> items;
  final DiveLocationLoadState state;
  final Object? error;

  const DiveLocationLoadResult({
    required this.items,
    required this.state,
    this.error,
  });
}

bool isTransientFirestoreError(Object error) {
  if (error is! FirebaseException) return false;
  return const {
    'unavailable',
    'deadline-exceeded',
    'network-request-failed',
  }.contains(error.code);
}

DiveLocationLoadState stateForSnapshot<T>(
  QuerySnapshot<T> snapshot,
  int itemCount,
) {
  if (itemCount == 0) return DiveLocationLoadState.empty;
  return snapshot.metadata.isFromCache
      ? DiveLocationLoadState.cached
      : DiveLocationLoadState.fresh;
}
