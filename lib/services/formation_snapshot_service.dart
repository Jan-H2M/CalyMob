import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../models/exercice_lifras.dart';
import '../models/exercice_valide.dart';
import 'exercice_valide_service.dart';
import 'lifras_service.dart';

class FormationMemberInput {
  final String memberId;
  final String? currentCode;
  final String? targetFormationLevel;

  const FormationMemberInput({
    required this.memberId,
    this.currentCode,
    this.targetFormationLevel,
  });
}

class FormationDiveStats {
  final int totalDives;
  final int outdoorDives;
  final int seaDives;
  final int exerciseDives;
  final double? maxDepthMeters;
  final int totalMinutes;
  final DateTime? lastDiveDate;

  const FormationDiveStats({
    required this.totalDives,
    required this.outdoorDives,
    required this.seaDives,
    required this.exerciseDives,
    required this.maxDepthMeters,
    required this.totalMinutes,
    required this.lastDiveDate,
  });
}

class FormationPendingClaim {
  final String id;
  final String exerciseCode;
  final String? exerciseLabel;
  final String status;
  final String? monitorId;
  final String? operationId;
  final String? palanqueeId;

  const FormationPendingClaim({
    required this.id,
    required this.exerciseCode,
    this.exerciseLabel,
    required this.status,
    this.monitorId,
    this.operationId,
    this.palanqueeId,
  });
}

class FormationRecentDive {
  final String id;
  final DateTime? date;
  final String locationName;
  final double? depthMaxMeters;
  final int? durationMinutes;
  final Map<String, dynamic> counters;

  const FormationRecentDive({
    required this.id,
    required this.date,
    required this.locationName,
    this.depthMaxMeters,
    this.durationMinutes,
    this.counters = const {},
  });
}

class FormationSnapshotCounts {
  final int totalRequired;
  final int validated;
  final int pending;
  final int pendingClaims;
  final int remaining;

  const FormationSnapshotCounts({
    required this.totalRequired,
    required this.validated,
    required this.pending,
    required this.pendingClaims,
    required this.remaining,
  });
}

class FormationSnapshot {
  final String memberId;
  final String currentCode;
  final NiveauLIFRAS? targetLevel;
  final String targetLabel;
  final FormationDiveStats diveStats;
  final List<ExerciceValide> validatedExercises;
  final List<ExerciceValide> pendingExercises;
  final List<FormationPendingClaim> pendingClaims;
  final List<ExerciceLIFRAS> remainingExercises;
  final List<FormationRecentDive> recentDives;
  final FormationSnapshotCounts counts;

  const FormationSnapshot({
    required this.memberId,
    required this.currentCode,
    required this.targetLevel,
    required this.targetLabel,
    required this.diveStats,
    required this.validatedExercises,
    required this.pendingExercises,
    required this.pendingClaims,
    required this.remainingExercises,
    required this.recentDives,
    required this.counts,
  });
}

class FormationSnapshotService {
  final FirebaseFirestore _firestore;
  final LifrasService _lifrasService;
  final ExerciceValideService _exerciceValideService;

  FormationSnapshotService({
    FirebaseFirestore? firestore,
    LifrasService? lifrasService,
    ExerciceValideService? exerciceValideService,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _lifrasService = lifrasService ?? LifrasService(),
        _exerciceValideService =
            exerciceValideService ?? ExerciceValideService();

  Future<Map<String, FormationSnapshot>> getFormationSnapshots(
    String clubId,
    List<FormationMemberInput> members,
  ) async {
    final entries = await Future.wait(
      members.where((member) => member.memberId.isNotEmpty).map((member) async {
        final snapshot = await getFormationSnapshot(clubId, member);
        return MapEntry(snapshot.memberId, snapshot);
      }),
    );
    return Map.fromEntries(entries);
  }

  Future<FormationSnapshot> getFormationSnapshot(
    String clubId,
    FormationMemberInput member,
  ) async {
    final targetLevel = _targetFromExplicit(member.targetFormationLevel) ??
        _targetFromCurrentCode(member.currentCode);

    final futures = await Future.wait<dynamic>([
      _exerciceValideService.getMemberExercicesValides(
        clubId,
        member.memberId,
      ),
      _getLogbookEntries(clubId, member.memberId),
      _getPendingClaims(clubId, member.memberId),
      targetLevel != null
          ? _lifrasService.getExercicesByNiveau(clubId, targetLevel)
          : Future.value(<ExerciceLIFRAS>[]),
    ]);

    final validatedDocs = (futures[0] as List<ExerciceValide>);
    final logbookEntries = (futures[1] as List<Map<String, dynamic>>);
    final pendingClaims = (futures[2] as List<FormationPendingClaim>);
    final exercises = (futures[3] as List<ExerciceLIFRAS>);

    final validatedExercises = validatedDocs
        .where((ex) => ex.status == ExerciceValideStatus.validated)
        .toList();
    final pendingExercises = validatedDocs
        .where((ex) => ex.status == ExerciceValideStatus.pending)
        .toList();
    final validatedCodes =
        validatedExercises.map((ex) => ex.exerciceCode).toSet();
    final pendingCodes = pendingExercises.map((ex) => ex.exerciceCode).toSet();
    final pendingClaimCodes =
        pendingClaims.map((claim) => claim.exerciseCode).toSet();

    final remainingExercises = exercises
        .where((ex) => !validatedCodes.contains(ex.code))
        .where((ex) => !pendingCodes.contains(ex.code))
        .where((ex) => !pendingClaimCodes.contains(ex.code))
        .toList();

    final outdoorEntries = logbookEntries
        .where((entry) => entry['source']?.toString() != 'piscine')
        .toList();

    return FormationSnapshot(
      memberId: member.memberId,
      currentCode: member.currentCode ?? '',
      targetLevel: targetLevel,
      targetLabel: targetLevel?.label ?? '',
      diveStats: _computeDiveStats(outdoorEntries),
      validatedExercises: validatedExercises,
      pendingExercises: pendingExercises,
      pendingClaims: pendingClaims,
      remainingExercises: remainingExercises,
      recentDives: outdoorEntries.take(3).map(_recentDiveFromEntry).toList(),
      counts: FormationSnapshotCounts(
        totalRequired: exercises.length,
        validated: validatedExercises.length,
        pending: pendingExercises.length,
        pendingClaims: pendingClaims.length,
        remaining: remainingExercises.length,
      ),
    );
  }

  Future<List<Map<String, dynamic>>> _getLogbookEntries(
    String clubId,
    String memberId,
  ) async {
    final ref = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('student_logbook_entries');
    try {
      final snap = await ref
          .where('member_id', isEqualTo: memberId)
          .orderBy('date', descending: true)
          .get();
      return snap.docs.map((doc) => {'id': doc.id, ...doc.data()}).toList();
    } catch (e) {
      debugPrint(
        '⚠️ Requête carnet ordonnée impossible, fallback sans tri: $e',
      );
      final snap = await ref.where('member_id', isEqualTo: memberId).get();
      final entries =
          snap.docs.map((doc) => {'id': doc.id, ...doc.data()}).toList();
      entries.sort((a, b) {
        final aDate = _toDate(a['date'])?.millisecondsSinceEpoch ?? 0;
        final bDate = _toDate(b['date'])?.millisecondsSinceEpoch ?? 0;
        return bDate.compareTo(aDate);
      });
      return entries;
    }
  }

  Future<List<FormationPendingClaim>> _getPendingClaims(
    String clubId,
    String memberId,
  ) async {
    const openStatuses = [
      'draft',
      'submitted',
      'waiting_monitor',
      'waiting_external_review',
    ];
    final ref = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('exercise_claims');
    try {
      final snap = await ref
          .where('member_id', isEqualTo: memberId)
          .where('status', whereIn: openStatuses)
          .get();
      return snap.docs.map((doc) {
        final data = doc.data();
        return FormationPendingClaim(
          id: doc.id,
          exerciseCode:
              (data['exercise_code'] ?? data['exercise_id'] ?? '?').toString(),
          exerciseLabel: data['exercise_label']?.toString(),
          status: data['status']?.toString() ?? '',
          monitorId: data['monitor_id']?.toString(),
          operationId: data['operation_id']?.toString(),
          palanqueeId: data['palanquee_id']?.toString(),
        );
      }).toList();
    } catch (e) {
      debugPrint('⚠️ Requête validations en attente impossible: $e');
      return [];
    }
  }

  FormationDiveStats _computeDiveStats(List<Map<String, dynamic>> entries) {
    var totalDives = 0;
    var seaDives = 0;
    var exerciseDives = 0;
    var totalMinutes = 0;
    double? maxDepthMeters;
    DateTime? lastDiveDate;

    for (final entry in entries) {
      totalDives += 1;
      final date = _toDate(entry['date']);
      if (date != null &&
          (lastDiveDate == null || date.isAfter(lastDiveDate))) {
        lastDiveDate = date;
      }

      final counters =
          (entry['counters'] as Map?)?.cast<String, dynamic>() ?? const {};
      if (counters['mer'] == true || entry['water_type'] == 'sea') {
        seaDives += 1;
      }
      if (counters['exo'] == true) exerciseDives += 1;

      final duration = _toInt(entry['duration_minutes']);
      if (duration != null) totalMinutes += duration;

      final depth = _toDouble(entry['depth_max_meters']);
      if (depth != null) {
        maxDepthMeters = maxDepthMeters == null
            ? depth
            : (depth > maxDepthMeters ? depth : maxDepthMeters);
      }
    }

    return FormationDiveStats(
      totalDives: totalDives,
      outdoorDives: totalDives,
      seaDives: seaDives,
      exerciseDives: exerciseDives,
      maxDepthMeters: maxDepthMeters,
      totalMinutes: totalMinutes,
      lastDiveDate: lastDiveDate,
    );
  }

  FormationRecentDive _recentDiveFromEntry(Map<String, dynamic> entry) {
    return FormationRecentDive(
      id: entry['id']?.toString() ?? '',
      date: _toDate(entry['date']),
      locationName: entry['location_name']?.toString().trim().isNotEmpty == true
          ? entry['location_name'].toString()
          : 'Lieu inconnu',
      depthMaxMeters: _toDouble(entry['depth_max_meters']),
      durationMinutes: _toInt(entry['duration_minutes']),
      counters:
          (entry['counters'] as Map?)?.cast<String, dynamic>() ?? const {},
    );
  }

  NiveauLIFRAS? _targetFromExplicit(String? value) {
    final raw = (value ?? '').trim().toUpperCase();
    if (raw.isEmpty) return null;
    switch (raw) {
      case '1':
      case '1*':
      case 'P1':
      case 'NB':
        return NiveauLIFRAS.nb;
      case '2':
      case '2*':
      case 'P2':
        return NiveauLIFRAS.p2;
      case '3':
      case '3*':
      case 'P3':
        return NiveauLIFRAS.p3;
      case '4':
      case '4*':
      case 'P4':
        return NiveauLIFRAS.p4;
      case 'AM':
        return NiveauLIFRAS.am;
      case 'MC':
        return NiveauLIFRAS.mc;
      case 'MF':
        return NiveauLIFRAS.mf;
      case 'MN':
        return NiveauLIFRAS.mn;
      default:
        return null;
    }
  }

  NiveauLIFRAS? _targetFromCurrentCode(String? value) {
    final raw = (value ?? '').trim().toUpperCase();
    switch (raw) {
      case 'NB':
        return NiveauLIFRAS.nb;
      case '1':
      case '1*':
      case 'P1':
        return NiveauLIFRAS.p2;
      case '2':
      case '2*':
      case 'P2':
        return NiveauLIFRAS.p3;
      case '3':
      case '3*':
      case 'P3':
        return NiveauLIFRAS.p4;
      case '4':
      case '4*':
      case 'P4':
        return NiveauLIFRAS.am;
      case 'AM':
        return NiveauLIFRAS.mc;
      case 'MC':
        return NiveauLIFRAS.mf;
      case 'MF':
        return NiveauLIFRAS.mn;
      default:
        return null;
    }
  }

  DateTime? _toDate(dynamic value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    if (value is Timestamp) return value.toDate();
    if (value is String) return DateTime.tryParse(value);
    if (value is int) return DateTime.fromMillisecondsSinceEpoch(value);
    return null;
  }

  int? _toInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value);
    return null;
  }

  double? _toDouble(dynamic value) {
    if (value is double) return value;
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value.replaceAll(',', '.'));
    return null;
  }
}
