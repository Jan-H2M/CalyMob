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
      if (raw is! Map) {
        throw const FormatException('Réponse formation piscine invalide.');
      }
      final data = raw.cast<String, dynamic>();
      final students = data['students'];
      if (students is! List) {
        throw const FormatException('Liste des élèves absente.');
      }
      final result = <PoolFormationStudent>[];
      for (final item in students) {
        if (item is! Map) {
          throw const FormatException('Élève piscine invalide.');
        }
        final student =
            PoolFormationStudent.fromMap(item.cast<String, dynamic>());
        if (student.profile.id.isEmpty) {
          throw const FormatException('Identifiant élève absent.');
        }
        result.add(student);
      }
      return List.unmodifiable(result);
    } catch (error) {
      debugPrint('⚠️ Vue formation piscine indisponible: $error');
      rethrow;
    }
  }
}
