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
  }) async {
    // Start/duration similarity is deliberately advisory: a client-side query
    // cannot safely be the authority that refuses a new dive. Exact source
    // hashes below are atomically reserved and are the only hard refusal.
    final importRef = _imports(clubId).doc('${memberId}_${preview.sourceHash}');
    await _firestore.runTransaction((transaction) async {
      final existing = await transaction.get(importRef);
      if (existing.exists) {
        throw DuplicateDiveComputerImport(
            (existing.data()?['entry_id'] as String?) ?? '');
      }
      transaction.set(importRef, {
        'owner_id': memberId,
        'source_hash': preview.sourceHash,
        'vendor': preview.vendor,
        'status': 'pending',
        'created_at': FieldValue.serverTimestamp(),
      });
    });
    // Privacy-safe v1: no raw vendor source is uploaded. Storage Rules cannot
    // inspect arbitrary payloads, so client filtering is not a trust boundary.
    final Uint8List? safeSource = null;
    final base =
        'clubs/$clubId/dive_computer_imports/$memberId/${importRef.id}';
    String? createdEntryId;
    try {
      if (safeSource != null) {
        await _storage.ref('$base/source.json').putData(
            safeSource, SettableMetadata(contentType: 'application/json'));
      }
      await _storage.ref('$base/profile-v1.json').putString(
          jsonEncode(preview.profile.toStorageJson()),
          metadata: SettableMetadata(contentType: 'application/json'));
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
            importId: importRef.id,
            retention: retention),
        if (preview.maxDepthValue != null)
          'computer_source_depth_max_value': preview.maxDepthValue,
        'entry_time': Timestamp.fromDate(preview.startedAt),
        'entry_time_str': _formatTime(preview.startedAt),
        'tank_summaries': preview.tanks.map((tank) => tank.toMap()).toList(),
        'computer_events':
            preview.events.map((event) => event.toMap()).toList(),
      });
      createdEntryId = entryId;
      await importRef.update({
        'owner_id': memberId,
        'entry_id': entryId,
        'source_hash': preview.sourceHash,
        'vendor': preview.vendor,
        'started_at': Timestamp.fromDate(preview.startedAt),
        'duration_seconds': preview.durationSeconds,
        'retention': retention,
        if (safeSource != null) 'source_path': '$base/source.json',
        'profile_path': '$base/profile-v1.json',
        'status': 'complete',
        'updated_at': FieldValue.serverTimestamp(),
      });
      return entryId;
    } catch (_) {
      // Roll back pending metadata and uploaded objects after a partial save.
      if (safeSource != null) {
        try {
          await _storage.ref('$base/source.json').delete();
        } catch (_) {}
      }
      try {
        await _storage.ref('$base/profile-v1.json').delete();
      } catch (_) {}
      if (createdEntryId != null) {
        try {
          await _logbook.delete(clubId: clubId, entryId: createdEntryId);
        } catch (_) {}
      }
      try {
        await importRef.delete();
      } catch (_) {}
      rethrow;
    }
  }

  Future<String?> findNearDuplicateAdvisory(
      String clubId, String memberId, DiveComputerImportPreview preview) async {
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

  /// Removes the Carnet entry, private metadata and both Storage objects.
  Future<void> deleteImportAndEntry({
    required String clubId,
    required String importId,
    required String entryId,
  }) async {
    final ref = _imports(clubId).doc(importId);
    final snapshot = await ref.get();
    if (!snapshot.exists) throw StateError('Import introuvable.');
    final data = snapshot.data()!;
    for (final field in ['source_path', 'profile_path']) {
      final path = data[field];
      if (path is String && path.isNotEmpty) {
        try {
          await _storage.ref(path).delete();
        } on FirebaseException catch (error) {
          if (error.code != 'object-not-found') rethrow;
        }
      }
    }
    await _logbook.delete(clubId: clubId, entryId: entryId);
    await ref.delete();
  }

  /// Public pure helper for emulator/unit tests. It is the only source object
  /// allowed to reach Storage; original device bytes are never uploaded.
  static Uint8List privacyFilteredSource(Uint8List original) {
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
        if (sensitive.contains(name) || route) continue;
        out[name] = strip(raw.value, name);
      }
      return out;
    }

    return Uint8List.fromList(utf8.encode(jsonEncode(strip(decoded))));
  }

  String _formatTime(DateTime value) =>
      '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
}
