import 'dart:convert';
import 'dart:typed_data';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import '../models/dive_computer_import.dart';
import '../models/student_logbook_entry.dart';
import 'student_logbook_service.dart';

class DuplicateDiveComputerImport implements Exception {
  final String entryId;
  const DuplicateDiveComputerImport(this.entryId);
}

/// Persists only privacy-filtered source/profile objects. The original bytes
/// must never be uploaded because a Suunto export can contain GPS, serials and
/// personal fields. Route is copied only when explicit opt-in is supplied.
class DiveComputerImportService {
  final FirebaseFirestore _firestore;
  final FirebaseStorage _storage;
  final StudentLogbookService _logbook;
  DiveComputerImportService(
      {FirebaseFirestore? firestore,
      FirebaseStorage? storage,
      StudentLogbookService? logbook})
      : _firestore = firestore ?? FirebaseFirestore.instance,
        _storage = storage ?? FirebaseStorage.instance,
        _logbook = logbook ?? StudentLogbookService();

  CollectionReference<Map<String, dynamic>> _imports(String clubId) =>
      _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('dive_computer_imports');

  Future<String> saveAsNewEntry({
    required String clubId,
    required String memberId,
    required String memberName,
    required DiveComputerImportPreview preview,
    required Uint8List originalBytes,
    required String retention,
    String? locationId,
    String? locationName,
    bool routeOptIn = false,
  }) async {
    final duplicate = await _findDuplicate(clubId, memberId, preview);
    if (duplicate != null) throw DuplicateDiveComputerImport(duplicate);
    final importRef = _imports(clubId).doc();
    final safeSource =
        privacyFilteredSource(originalBytes, allowRoute: routeOptIn);
    final base =
        'clubs/$clubId/dive_computer_imports/$memberId/${importRef.id}';
    await _storage
        .ref('$base/source.json')
        .putData(safeSource, SettableMetadata(contentType: 'application/json'));
    await _storage.ref('$base/profile-v1.json').putString(
        jsonEncode(preview.profile.toStorageJson()),
        SettableMetadata(contentType: 'application/json'));
    final entry = StudentLogbookEntry(
      id: '', memberId: memberId, memberName: memberName,
      source: 'dive_computer',
      date: preview.startedAt, locationId: locationId,
      locationName: locationName ?? '(à compléter)',
      // The shared Carnet field is explicitly metres: only populate it when
      // the adapter has a declared unit. Inferred/raw values remain metadata.
      depthMaxMeters: preview.depthUnit == UnitProvenance.declared
          ? preview.maxDepthValue
          : null,
      durationMinutes: preview.durationMinutes,
    );
    final entryId =
        await _logbook.create(clubId: clubId, entry: entry, extras: {
      'computer_import': preview.computerImportMetadata(
          importId: importRef.id, retention: retention, routeOptIn: routeOptIn),
      if (preview.maxDepthValue != null)
        'computer_source_depth_max_value': preview.maxDepthValue,
      'entry_time': Timestamp.fromDate(preview.startedAt),
      'entry_time_str': _formatTime(preview.startedAt),
      'tank_summaries': preview.tanks.map((tank) => tank.toMap()).toList(),
      'computer_events': preview.events.map((event) => event.toMap()).toList(),
    });
    await importRef.set({
      'owner_id': memberId,
      'entry_id': entryId,
      'source_hash': preview.sourceHash,
      'vendor': preview.vendor,
      'started_at': Timestamp.fromDate(preview.startedAt),
      'duration_seconds': preview.durationSeconds,
      'retention': retention,
      'route_opt_in': routeOptIn,
      'source_path': '$base/source.json',
      'profile_path': '$base/profile-v1.json',
      'created_at': FieldValue.serverTimestamp(),
    });
    return entryId;
  }

  Future<String?> _findDuplicate(
      String clubId, String memberId, DiveComputerImportPreview preview) async {
    final exact = await _imports(clubId)
        .where('owner_id', isEqualTo: memberId)
        .where('source_hash', isEqualTo: preview.sourceHash)
        .limit(1)
        .get();
    if (exact.docs.isNotEmpty)
      return exact.docs.first.data()['entry_id'] as String?;
    final from = Timestamp.fromDate(
        preview.startedAt.subtract(const Duration(minutes: 2)));
    final until =
        Timestamp.fromDate(preview.startedAt.add(const Duration(minutes: 2)));
    final candidates = await _imports(clubId)
        .where('owner_id', isEqualTo: memberId)
        .where('started_at', isGreaterThanOrEqualTo: from)
        .where('started_at', isLessThanOrEqualTo: until)
        .get();
    for (final doc in candidates.docs) {
      final data = doc.data();
      if ((((data['duration_seconds'] as num?)?.toInt() ?? -999) -
                  preview.durationSeconds)
              .abs() <=
          60) {
        return data['entry_id'] as String?;
      }
    }
    return null;
  }

  /// Public pure helper for emulator/unit tests. It is the only source object
  /// allowed to reach Storage; original device bytes are never uploaded.
  static Uint8List privacyFilteredSource(Uint8List original,
      {required bool allowRoute}) {
    final decoded = jsonDecode(utf8.decode(original));
    dynamic strip(dynamic value, [String key = '']) {
      if (value is List) return value.map((item) => strip(item, key)).toList();
      if (value is! Map) return value;
      final out = <String, dynamic>{};
      for (final raw in value.entries) {
        final name = raw.key.toString();
        final sensitive = const {
          'SerialNumber',
          'Name',
          'Personal',
          'Latitude',
          'Longitude',
          'GPSAltitude',
          'DeviceLocation'
        };
        final route = name == 'DiveRoute' ||
            name == 'DiveRouteOrigin' ||
            name == 'DiveRouteDistance' ||
            name == 'DiveRouteQuality';
        if (sensitive.contains(name) || (!allowRoute && route)) continue;
        out[name] = strip(raw.value, name);
      }
      return out;
    }

    return Uint8List.fromList(utf8.encode(jsonEncode(strip(decoded))));
  }

  String _formatTime(DateTime value) =>
      '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
}
