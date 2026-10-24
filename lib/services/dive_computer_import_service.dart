import 'dart:convert';
import 'dart:typed_data';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/dive_computer_import.dart';
import '../models/student_logbook_entry.dart';
import 'student_logbook_service.dart';

class DuplicateDiveComputerImport implements Exception {
  final String entryId;
  const DuplicateDiveComputerImport(this.entryId);
}

/// Persists compact, privacy-filtered profile metadata in the Carnet entry.
/// Original bytes never leave the device.
class DiveComputerImportService {
  final FirebaseFirestore _firestore;
  final StudentLogbookService _logbook;
  DiveComputerImportService(
      {FirebaseFirestore? firestore,
      StudentLogbookService? logbook})
      : _firestore = firestore ?? FirebaseFirestore.instance,
        _logbook = logbook ?? StudentLogbookService();

  CollectionReference<Map<String, dynamic>> _entries(String clubId) =>
      _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('student_logbook_entries');

  Future<String> saveAsNewEntry({
    required String clubId,
    required String memberId,
    required String memberName,
    required DiveComputerImportPreview preview,
    required Uint8List originalBytes,
    String? locationId,
    String? locationName,
    String? country,
    bool? isSea,
    String? zone,
  }) async {
    final entries = await _entries(clubId).where('member_id', isEqualTo: memberId).get();
    for (final doc in entries.docs) {
      final data = doc.data();
      final metadata = data['computer_import'];
      if (data['computer_source_hash'] == preview.sourceHash ||
          metadata is Map && metadata['source_hash'] == preview.sourceHash) {
        throw DuplicateDiveComputerImport(doc.id);
      }
    }
    final entry = StudentLogbookEntry(
        id: '', memberId: memberId, memberName: memberName,
        source: 'dive_computer',
        date: preview.startedAt, locationId: locationId,
        locationName: locationName ?? '(à compléter)',
        country: country,
        zone: zone,
        depthMaxMeters: preview.maxDepthValue,
        durationMinutes: preview.durationMinutes,
      );
    return _logbook.create(clubId: clubId, entry: entry, extras: {
        'computer_source_hash': preview.sourceHash,
        'computer_import': preview.computerImportMetadata(
            importId: '${memberId}_${preview.sourceHash}')
          ..['profile'] = preview.profile.toStorageJson(maxPointsPerSeries: 240),
        'computer_profile': preview.profile.toStorageJson(maxPointsPerSeries: 240),
        if (preview.maxDepthValue != null)
          'computer_source_depth_max_value': preview.maxDepthValue,
        'entry_time': Timestamp.fromDate(preview.startedAt),
        'entry_time_str': _formatTime(preview.startedAt),
        'tank_summaries': preview.tanks.map((tank) => tank.toMap()).toList(),
        'computer_events':
            preview.events.map((event) => event.toMap()).toList(),
        if (isSea != null) 'is_sea': isSea,
      });
  }

  Future<String?> findNearDuplicateAdvisory(
      String clubId, String memberId, DiveComputerImportPreview preview) async {
    final candidates = await _entries(clubId).where('member_id', isEqualTo: memberId).get();
    for (final doc in candidates.docs) {
      final data = doc.data();
      final at = data['entry_time'];
      final start = at is Timestamp ? at.toDate() : data['date'] is Timestamp ? (data['date'] as Timestamp).toDate() : null;
      final metadata = data['computer_import'];
      final seconds = metadata is Map ? (metadata['duration_seconds'] as num?)?.toInt() : null;
      final minutes = (data['duration_minutes'] as num?)?.toInt();
      final candidateSeconds = seconds ?? (minutes == null ? null : minutes * 60);
      if (start != null && start.difference(preview.startedAt).inSeconds.abs() <= 120 &&
          candidateSeconds != null && (candidateSeconds - preview.durationSeconds).abs() <= 60) {
        return doc.id;
      }
    }
    return null;
  }

  /// New imports are inline-only; legacy cleanup is deliberately best-effort.
  Future<void> deleteImportAndEntry({
    required String clubId,
    required String importId,
    required String entryId,
  }) async {
    await _logbook.delete(clubId: clubId, entryId: entryId);
  }

  /// Legacy pure helper retained for migration tests; save never uploads it.
  static Uint8List privacyFilteredSource(Uint8List original) {
    final decoded = jsonDecode(utf8.decode(original));
    dynamic strip(dynamic value) {
      if (value is List) return value.map(strip).toList();
      if (value is! Map) return value;
      final out = <String, dynamic>{};
      for (final entry in value.entries) {
        final key = entry.key.toString();
        if (const {'SerialNumber', 'Name', 'Personal', 'Latitude', 'Longitude', 'GPSAltitude', 'DeviceLocation', 'DiveRoute', 'DiveRouteOrigin', 'DiveRouteDistance', 'DiveRouteQuality'}.contains(key)) continue;
        out[key] = strip(entry.value);
      }
      return out;
    }
    return Uint8List.fromList(utf8.encode(jsonEncode(strip(decoded))));
  }

  String _formatTime(DateTime value) =>
      '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
}
