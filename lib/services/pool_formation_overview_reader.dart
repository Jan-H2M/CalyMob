import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

import '../models/pool_formation_snapshot_doc.dart';

typedef PoolFormationCallable = Future<Object?> Function(
  String functionName,
  Map<String, dynamic> payload,
);

/// Reads only the pool-safe DTO returned by the trusted backend.
///
/// The backend can derive this DTO from legacy full snapshots during rollout,
/// so existing students remain visible without a production backfill.
class PoolFormationOverviewReader {
  final PoolFormationCallable? _callableOverride;

  PoolFormationOverviewReader({PoolFormationCallable? callableInvoker})
      : _callableOverride = callableInvoker;

  Future<List<PoolFormationStudent>> getAllStudents(String clubId) async {
    try {
      final callableOverride = _callableOverride;
      final raw = callableOverride != null
          ? await callableOverride('getPoolFormationOverviewV1', {
              'clubId': clubId,
            })
          : (await FirebaseFunctions.instanceFor(
              region: 'europe-west1',
            ).httpsCallable('getPoolFormationOverviewV1').call({
              'clubId': clubId,
            }))
              .data;
      final data = raw is Map ? raw.cast<String, dynamic>() : const {};
      final students = data['students'];
      if (students is! List) return const [];
      return students
          .whereType<Map>()
          .map((item) =>
              PoolFormationStudent.fromMap(item.cast<String, dynamic>()))
          .where((student) => student.profile.id.isNotEmpty)
          .toList(growable: false);
    } catch (error) {
      debugPrint('⚠️ Vue formation piscine indisponible: $error');
      return const [];
    }
  }
}
