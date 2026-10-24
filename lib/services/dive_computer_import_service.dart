import 'dart:convert';
import 'dart:typed_data';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/dive_computer_import.dart';
import '../models/student_logbook_entry.dart';
import 'student_logbook_service.dart';
import 'dive_site_source.dart';

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
      {FirebaseFirestore? firestore, StudentLogbookService? logbook})
      : _firestore = firestore ?? FirebaseFirestore.instance,
        _logbook = logbook ?? StudentLogbookService(firestore: firestore);

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
    final entries =
        await _entries(clubId).where('member_id', isEqualTo: memberId).get();
    QueryDocumentSnapshot<Map<String, dynamic>>? duplicate;
    for (final doc in entries.docs) {
      final data = doc.data();
      final metadata = data['computer_import'];
      if (data['source_hash'] == preview.sourceHash ||
          data['computer_source_hash'] == preview.sourceHash ||
          metadata is Map && metadata['source_hash'] == preview.sourceHash) {
        if (!needsRepair(data)) throw DuplicateDiveComputerImport(doc.id);
        duplicate = doc;
        break;
      }
    }
    final existing = duplicate?.data() ?? <String, dynamic>{};
    // Keep a site already corrected by the member when repairing an import.
    final location = await _resolvedLocation(
      clubId: clubId,
      hint: preview.locationHint,
      current: {
        ...existing,
        if (isMissingLocation(existing['location_name'])) ...{
          'location_name': locationName,
          'location_id': locationId,
          'country': country,
          'zone': zone,
          'is_sea': isSea,
        },
      },
    );
    final start = startTime({
          ...existing,
          'date': existing['date'] ?? Timestamp.fromDate(preview.startedAt),
        }) ??
        preview.startedAt;
    final exit = _dateTime(existing['exit_time']) ??
        start.add(Duration(seconds: preview.durationSeconds));
    final profile = preview.profile.toStorageJson(maxPointsPerSeries: 240);
    final defaults = _entryDefaults(
      current: {...existing, ...location},
      others: entries.docs
          .where((doc) => doc.id != duplicate?.id)
          .map((doc) => doc.data())
          .toList(),
      start: start,
      hint: preview.locationHint,
      events: preview.events.map((event) => event.toMap()).toList(),
    );
    final extras = <String, dynamic>{
      ...location,
      ...defaults,
      'computer_source_hash': preview.sourceHash,
      'computer_import': preview.computerImportMetadata(
          importId: '${memberId}_${preview.sourceHash}')
        ..['profile'] = profile,
      'computer_profile': profile,
      // Keep the compact recorded channels available to older carnet readers.
      'profile_samples': profile['recorded'],
      if (preview.maxDepthValue != null)
        'computer_source_depth_max_value': preview.maxDepthValue,
      'entry_time': existing['entry_time'] ?? Timestamp.fromDate(start),
      'exit_time': existing['exit_time'] ?? Timestamp.fromDate(exit),
      'entry_time_str':
          _nonEmpty(existing['entry_time_str']) ?? formatTime(start),
      'exit_time_str': _nonEmpty(existing['exit_time_str']) ?? formatTime(exit),
      if (existing['water_temp_c'] == null &&
          preview.minTemperatureValue != null)
        'water_temp_c': preview.minTemperatureValue,
      'tank_summaries': preview.tanks.map((tank) => tank.toMap()).toList(),
      'computer_events': preview.events.map((event) => event.toMap()).toList(),
    };
    if (duplicate != null) {
      await duplicate.reference.update({
        ...extras,
        'updated_at': FieldValue.serverTimestamp(),
      });
      return duplicate.id;
    }
    final entry = StudentLogbookEntry(
      id: '',
      memberId: memberId,
      memberName: memberName,
      source: 'dive_computer',
      date: start,
      locationName: location['location_name'] as String,
      depthMaxMeters: preview.maxDepthValue,
      durationMinutes: preview.durationMinutes,
    );
    return _logbook.create(clubId: clubId, entry: entry, extras: extras);
  }

  /// Repair legacy imports on open without creating another carnet entry.
  /// Read the current document again so stale list data cannot undo an edit.
  Future<Map<String, dynamic>?> repairExistingEntry({
    required String clubId,
    required String memberId,
    required String entryId,
  }) async {
    final reference = _entries(clubId).doc(entryId);
    final snapshot = await reference.get();
    final current = snapshot.data();
    if (current == null ||
        current['member_id'] != memberId ||
        current['source'] != 'dive_computer') {
      return null;
    }
    if (!needsRepair(current)) return current;
    final entries =
        await _entries(clubId).where('member_id', isEqualTo: memberId).get();
    final hint = _locationHint(current);
    final location =
        await _resolvedLocation(clubId: clubId, current: current, hint: hint);
    final start = startTime(current);
    final exit = inferredExitTime(current);
    final metadata = current['computer_import'];
    final profile = current['computer_profile'] ??
        (metadata is Map ? metadata['profile'] : null);
    final recorded =
        profile is Map ? profile['recorded'] : current['profile_samples'];
    final events = current['computer_events'] ??
        (recorded is Map ? recorded['events'] : null);
    final temperatures = recorded is Map ? recorded['temperature'] : null;
    final values = temperatures is List
        ? temperatures
            .whereType<Map>()
            .map((p) => p['value'])
            .whereType<num>()
            .toList()
        : <num>[];
    final patch = <String, dynamic>{
      ...location,
      ..._entryDefaults(
        current: {...current, ...location},
        others: entries.docs
            .where((doc) => doc.id != entryId)
            .map((doc) => doc.data())
            .toList(),
        start: start,
        hint: hint,
        events: events is List ? events : const [],
      ),
      if (start != null) ...{
        if (current['entry_time'] == null)
          'entry_time': Timestamp.fromDate(start),
        if (_nonEmpty(current['entry_time_str']) == null)
          'entry_time_str': formatTime(start),
      },
      if (exit != null) ...{
        if (current['exit_time'] == null) 'exit_time': Timestamp.fromDate(exit),
        if (_nonEmpty(current['exit_time_str']) == null)
          'exit_time_str': formatTime(exit),
      },
      if (current['water_temp_c'] == null && values.isNotEmpty)
        'water_temp_c':
            _temperatureC(values.reduce((a, b) => a < b ? a : b).toDouble()),
      'updated_at': FieldValue.serverTimestamp(),
    };
    await reference.update(patch);
    return (await reference.get()).data();
  }

  static bool isMissingLocation(dynamic name) =>
      _nonEmpty(name) == null || _nonEmpty(name) == '(à compléter)';

  static bool hasEquipment(Map<String, dynamic> data) =>
      const ['combi', 'combi_type', 'tank', 'lestage_kg'].any((key) {
        final value = data[key];
        return value is Map
            ? value.isNotEmpty
            : value is String
                ? value.trim().isNotEmpty
                : value != null;
      });

  static bool needsRepair(Map<String, dynamic> data) =>
      isMissingLocation(data['location_name']) ||
      _nonEmpty(data['exit_time_str']) == null ||
      data['counters'] is! Map ||
      (data['counters'] as Map).isEmpty ||
      !hasEquipment(data);

  static bool isSeaLocation(
      {String? name, String? country, bool? isSea, DiveLocationHint? hint}) {
    if (isSea == true) return true;
    final countryCode = country?.trim().toUpperCase();
    if (const {'MT', 'MALTA', 'MALTE', 'EG', 'GR', 'HR', 'ES', 'IT', 'PT'}
        .contains(countryCode)) {
      return true;
    }
    final text =
        '${name ?? ''} ${country ?? ''}'.toLowerCase().replaceAll('é', 'e');
    if ([
      'gozo',
      'malta',
      'malte',
      'mer',
      'sea',
      'zelande',
      'zeeland',
      'oosterschelde',
      'grevelingen'
    ].any(text.contains)) {
      return true;
    }
    return hint != null &&
        hint.latitude >= 35 &&
        hint.latitude <= 37 &&
        hint.longitude >= 14 &&
        hint.longitude <= 15;
  }

  Future<Map<String, dynamic>> _resolvedLocation(
      {required String clubId,
      required Map<String, dynamic> current,
      DiveLocationHint? hint}) async {
    if (isMissingLocation(current['location_name']) && hint != null) {
      final sites =
          await FirestoreDiveSiteSource(firestore: _firestore, clubId: clubId)
              .nearby(hint);
      if (sites.isNotEmpty) {
        final site = sites.first;
        return {
          'location_name': site.name,
          'location_id': site.id,
          'country': site.country,
          'zone': site.zone,
          'is_sea': site.isSea
        };
      }
    }
    return {
      'location_name': _nonEmpty(current['location_name']) ?? '(à compléter)',
      for (final key in ['location_id', 'country', 'zone', 'is_sea'])
        if (current[key] != null) key: current[key],
    };
  }

  Map<String, dynamic> _entryDefaults(
      {required Map<String, dynamic> current,
      required List<Map<String, dynamic>> others,
      DateTime? start,
      DiveLocationHint? hint,
      required List events}) {
    var highest = 0;
    for (final entry in others) {
      final number = entry['dive_number'];
      if (number is num && number > highest) highest = number.toInt();
    }
    final equipped = others.where(hasEquipment).toList()
      ..sort((a, b) => (_dateTime(b['date']) ?? DateTime(1970))
          .compareTo(_dateTime(a['date']) ?? DateTime(1970)));
    final equipment = equipped.isEmpty
        ? <String, dynamic>{}
        : Map<String, dynamic>.from(equipped.first);
    final combi = current['combi'];
    if (combi is Map && combi.isNotEmpty) {
      // The legacy type must describe this entry's suit, not the default suit.
      equipment['combi_type'] = combi['type'];
    } else if (_nonEmpty(current['combi_type']) != null) {
      equipment.remove('combi');
    }
    return {
      if (current['dive_number'] == null) 'dive_number': highest + 1,
      'counters': {
        if (isSeaLocation(
            name: current['location_name'] as String?,
            country: current['country'] as String?,
            isSea: current['is_sea'] as bool?,
            hint: hint))
          'mer': true,
        if (events.whereType<Map>().any((event) => const {'deco', 'ceiling'}
            .contains(event['type']?.toString().toLowerCase())))
          'deco': true,
        if (start != null && (start.hour >= 20 || start.hour < 6)) 'nuit': true,
        if (current['counters'] is Map)
          ...Map<String, dynamic>.from(current['counters']),
      },
      for (final key in ['combi', 'combi_type', 'tank', 'lestage_kg'])
        if ((current[key] == null ||
                current[key] is Map && (current[key] as Map).isEmpty ||
                current[key] is String &&
                    (current[key] as String).trim().isEmpty) &&
            equipment[key] != null)
          key: equipment[key],
    };
  }

  static DiveLocationHint? _locationHint(Map<String, dynamic> data) {
    final lat = data['start_latitude'] ?? data['startLatitude'];
    final lon = data['start_longitude'] ?? data['startLongitude'];
    return lat is num && lon is num
        ? DiveLocationHint(lat.toDouble(), lon.toDouble())
        : null;
  }

  static DateTime? _dateTime(dynamic value) => value is Timestamp
      ? value.toDate()
      : value is DateTime
          ? value
          : value is String
              ? DateTime.tryParse(value)
              : null;

  static DateTime? startTime(Map<String, dynamic> data) {
    final explicit = _dateTime(data['entry_time']);
    if (explicit != null) return explicit;
    final date = _dateTime(data['date']);
    final clock = _nonEmpty(data['entry_time_str']);
    final parts = clock?.split(':');
    if (date != null && parts != null && parts.length == 2) {
      final hour = int.tryParse(parts[0]);
      final minute = int.tryParse(parts[1]);
      if (hour != null && minute != null) {
        return DateTime(date.year, date.month, date.day, hour, minute);
      }
    }
    final metadata = data['computer_import'];
    final recorded = metadata is Map ? _dateTime(metadata['started_at']) : null;
    return recorded ??
        (date != null &&
                (date.hour != 0 || date.minute != 0 || date.second != 0)
            ? date
            : null);
  }

  static DateTime? inferredExitTime(Map<String, dynamic> data) {
    final explicit = _dateTime(data['exit_time']);
    if (explicit != null) return explicit;
    final start = startTime(data);
    if (start == null) return null;
    final metadata = data['computer_import'];
    final seconds = metadata is Map ? metadata['duration_seconds'] : null;
    final minutes = data['duration_minutes'];
    if (seconds is num && seconds > 0) {
      return start.add(Duration(seconds: seconds.round()));
    }
    if (minutes is num && minutes > 0) {
      return start.add(Duration(minutes: minutes.round()));
    }
    return null;
  }

  static String? _nonEmpty(dynamic value) =>
      value is String && value.trim().isNotEmpty ? value.trim() : null;

  static double _temperatureC(double value) =>
      value > 150 ? ((value - 273.15) * 10).round() / 10 : value;

  Future<String?> findNearDuplicateAdvisory(
      String clubId, String memberId, DiveComputerImportPreview preview) async {
    final candidates =
        await _entries(clubId).where('member_id', isEqualTo: memberId).get();
    for (final doc in candidates.docs) {
      final data = doc.data();
      final at = data['entry_time'];
      final start = at is Timestamp
          ? at.toDate()
          : data['date'] is Timestamp
              ? (data['date'] as Timestamp).toDate()
              : null;
      final metadata = data['computer_import'];
      final seconds = metadata is Map
          ? (metadata['duration_seconds'] as num?)?.toInt()
          : null;
      final minutes = (data['duration_minutes'] as num?)?.toInt();
      final candidateSeconds =
          seconds ?? (minutes == null ? null : minutes * 60);
      if (start != null &&
          start.difference(preview.startedAt).inSeconds.abs() <= 120 &&
          candidateSeconds != null &&
          (candidateSeconds - preview.durationSeconds).abs() <= 60) {
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
        if (const {
          'SerialNumber',
          'Name',
          'Personal',
          'Latitude',
          'Longitude',
          'GPSAltitude',
          'DeviceLocation',
          'DiveRoute',
          'DiveRouteOrigin',
          'DiveRouteDistance',
          'DiveRouteQuality'
        }.contains(key)) {
          continue;
        }
        out[key] = strip(entry.value);
      }
      return out;
    }

    return Uint8List.fromList(utf8.encode(jsonEncode(strip(decoded))));
  }

  static String formatTime(DateTime value) =>
      '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
}
