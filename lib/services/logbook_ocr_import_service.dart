import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../models/logbook_ocr_import.dart';
import '../models/student_logbook_entry.dart';
import 'student_logbook_service.dart';

class LogbookOcrImportService {
  final StudentLogbookService _logbookService;
  final FirebaseStorage _storage;
  final FirebaseFunctions _functions;

  LogbookOcrImportService({
    StudentLogbookService? logbookService,
    FirebaseStorage? storage,
    FirebaseFunctions? functions,
  })  : _logbookService = logbookService ?? StudentLogbookService(),
        _storage = storage ?? FirebaseStorage.instance,
        _functions =
            functions ?? FirebaseFunctions.instanceFor(region: 'europe-west1');

  Future<LogbookOcrImportDraft> analyzePage({
    required String clubId,
    required String memberId,
    required Uint8List imageBytes,
    required String contentType,
    required int defaultYear,
  }) async {
    final safeContentType = _supportedContentType(contentType);
    final extension = safeContentType == 'image/png'
        ? 'png'
        : safeContentType == 'image/webp'
            ? 'webp'
            : 'jpg';
    final jobId = DateTime.now().millisecondsSinceEpoch.toString();
    final storagePath =
        'clubs/$clubId/ocr_imports/$memberId/$jobId/page.$extension';

    await _storage.ref(storagePath).putData(
          imageBytes,
          SettableMetadata(contentType: safeContentType),
        );

    final result = await _functions.httpsCallable('analyzeLogbookPage').call({
      'clubId': clubId,
      'storagePath': storagePath,
      'defaultYear': defaultYear,
      'localeHints': ['fr', 'nl'],
    });

    return _draftFromFunctionData(result.data);
  }

  String _supportedContentType(String value) {
    if (value == 'image/png' || value == 'image/webp') return value;
    return 'image/jpeg';
  }

  LogbookOcrImportDraft _draftFromFunctionData(dynamic data) {
    final map = Map<String, dynamic>.from(data as Map);
    final rowsRaw = map['rows'] as List? ?? const [];
    return LogbookOcrImportDraft(
      importJobId: map['importJobId'] as String,
      detectedFormat: (map['detectedFormat'] as String?) ?? 'unknown',
      language: (map['language'] as String?) ?? 'unknown',
      overallConfidence: _double(map['overallConfidence']) ?? 0,
      warnings: _stringList(map['warnings']),
      rows: [
        for (final raw in rowsRaw)
          _rowFromMap(Map<String, dynamic>.from(raw as Map)),
      ],
    );
  }

  LogbookOcrSuggestedRow _rowFromMap(Map<String, dynamic> map) {
    final fields = Map<String, dynamic>.from((map['fields'] as Map?) ?? {});
    return LogbookOcrSuggestedRow(
      rowId: (map['rowId'] as String?) ?? 'row',
      selected: map['selected'] != false,
      confidence: _double(map['confidence']) ?? 0,
      warnings: _stringList(map['warnings']),
      diveNumber: _intField(fields['diveNumber']),
      date: _dateField(fields['date']),
      dateRaw: _stringField(fields['dateRaw']),
      entryTime: _stringField(fields['entryTime']),
      exitTime: _stringField(fields['exitTime']),
      locationName: _stringField(fields['locationName']),
      country: _stringField(fields['country']),
      depthMaxMeters: _doubleField(fields['depthMaxMeters']),
      durationMinutes: _intField(fields['durationMinutes']),
      deco: _boolField(fields['deco']),
      night: _boolField(fields['night']),
      sea: _boolField(fields['sea']),
      buddies: _stringListField(fields['buddies']),
      notes: _stringField(fields['notes']),
    );
  }

  LogbookOcrField<String> _stringField(dynamic raw) {
    final map = Map<String, dynamic>.from((raw as Map?) ?? {});
    final value = map['value'];
    return LogbookOcrField<String>(
      value: value is String && value.isNotEmpty ? value : null,
      confidence: _double(map['confidence']) ?? 0,
      raw: map['raw'] as String?,
      needsReview: map['needsReview'] == true,
    );
  }

  LogbookOcrField<int> _intField(dynamic raw) {
    final map = Map<String, dynamic>.from((raw as Map?) ?? {});
    final value = map['value'];
    return LogbookOcrField<int>(
      value: value is num ? value.toInt() : int.tryParse('$value'),
      confidence: _double(map['confidence']) ?? 0,
      raw: map['raw'] as String?,
      needsReview: map['needsReview'] == true,
    );
  }

  LogbookOcrField<double> _doubleField(dynamic raw) {
    final map = Map<String, dynamic>.from((raw as Map?) ?? {});
    final value = map['value'];
    return LogbookOcrField<double>(
      value: value is num ? value.toDouble() : double.tryParse('$value'),
      confidence: _double(map['confidence']) ?? 0,
      raw: map['raw'] as String?,
      needsReview: map['needsReview'] == true,
    );
  }

  LogbookOcrField<bool> _boolField(dynamic raw) {
    final map = Map<String, dynamic>.from((raw as Map?) ?? {});
    final value = map['value'];
    return LogbookOcrField<bool>(
      value: value is bool ? value : null,
      confidence: _double(map['confidence']) ?? 0,
      raw: map['raw'] as String?,
      needsReview: map['needsReview'] == true,
    );
  }

  LogbookOcrField<DateTime> _dateField(dynamic raw) {
    final map = Map<String, dynamic>.from((raw as Map?) ?? {});
    final value = map['value'];
    return LogbookOcrField<DateTime>(
      value: value is String ? DateTime.tryParse(value) : null,
      confidence: _double(map['confidence']) ?? 0,
      raw: map['raw'] as String?,
      needsReview: map['needsReview'] == true,
    );
  }

  LogbookOcrField<List<String>> _stringListField(dynamic raw) {
    final map = Map<String, dynamic>.from((raw as Map?) ?? {});
    return LogbookOcrField<List<String>>(
      value: _stringList(map['value']),
      confidence: _double(map['confidence']) ?? 0,
      raw: map['raw'] as String?,
      needsReview: map['needsReview'] == true,
    );
  }

  List<String> _stringList(dynamic raw) {
    if (raw is! List) return const [];
    return raw.whereType<String>().where((s) => s.trim().isNotEmpty).toList();
  }

  double? _double(dynamic value) {
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  Future<LogbookOcrImportDraft> analyzeMockPage({
    required Uint8List imageBytes,
    required int defaultYear,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 900));

    DateTime d(int month, int day) => DateTime(defaultYear, month, day);

    return LogbookOcrImportDraft(
      importJobId: 'local-mock-${DateTime.now().millisecondsSinceEpoch}',
      detectedFormat: 'lifras_carnet_table',
      language: 'fr',
      overallConfidence: 0.82,
      warnings: const [
        'Prototype local: suggestions simulées en attendant la Cloud Function IA.',
      ],
      rows: [
        LogbookOcrSuggestedRow(
          rowId: 'row-383',
          confidence: 0.90,
          diveNumber: const LogbookOcrField(value: 383, confidence: 0.98),
          date: LogbookOcrField(value: d(8, 24), confidence: 0.91),
          dateRaw: const LogbookOcrField(value: '24/8', confidence: 0.96),
          exitTime: const LogbookOcrField(value: '14:30', confidence: 0.88),
          locationName:
              const LogbookOcrField(value: 'Vodelée', confidence: 0.94),
          country: const LogbookOcrField(value: 'BE', confidence: 0.75),
          depthMaxMeters: const LogbookOcrField(value: 21, confidence: 0.98),
          durationMinutes: const LogbookOcrField(value: 34, confidence: 0.97),
          buddies: const LogbookOcrField(
            value: ['Flavie'],
            confidence: 0.75,
          ),
        ),
        LogbookOcrSuggestedRow(
          rowId: 'row-384',
          confidence: 0.72,
          warnings: const ['Lieu et date à vérifier.'],
          diveNumber: const LogbookOcrField(value: 384, confidence: 0.96),
          date: LogbookOcrField(
            value: d(9, 11),
            confidence: 0.68,
            needsReview: true,
          ),
          dateRaw: const LogbookOcrField(
            value: '11/9 ?',
            confidence: 0.68,
            needsReview: true,
          ),
          locationName: const LogbookOcrField(
            value: 'Kornjaca ? - Kuk - Croatie',
            confidence: 0.62,
            raw: 'kornjacol / kornjaca',
            needsReview: true,
          ),
          country: const LogbookOcrField(value: 'HR', confidence: 0.86),
          depthMaxMeters: const LogbookOcrField(value: 19, confidence: 0.97),
          durationMinutes: const LogbookOcrField(value: 55, confidence: 0.95),
          sea: const LogbookOcrField(value: true, confidence: 0.75),
          buddies: const LogbookOcrField(value: ['Flo'], confidence: 0.72),
          notes: const LogbookOcrField(
            value: 'Nudibranche, poulpe',
            confidence: 0.72,
          ),
        ),
        LogbookOcrSuggestedRow(
          rowId: 'row-385',
          confidence: 0.76,
          warnings: const ['Nom du site à vérifier.'],
          diveNumber: const LogbookOcrField(value: 385, confidence: 0.96),
          date: LogbookOcrField(value: d(9, 14), confidence: 0.94),
          dateRaw: const LogbookOcrField(value: '14/9', confidence: 0.94),
          locationName: const LogbookOcrField(
            value: 'Mari Plavnik ? - Kuk - Croatie',
            confidence: 0.66,
            raw: 'MARI plavnik',
            needsReview: true,
          ),
          country: const LogbookOcrField(value: 'HR', confidence: 0.88),
          depthMaxMeters: const LogbookOcrField(value: 20, confidence: 0.98),
          durationMinutes: const LogbookOcrField(value: 49, confidence: 0.94),
          sea: const LogbookOcrField(value: true, confidence: 0.76),
          buddies: const LogbookOcrField(value: ['Flo'], confidence: 0.70),
          notes: const LogbookOcrField(
            value: 'Nudibranche, rascasse',
            confidence: 0.70,
          ),
        ),
        LogbookOcrSuggestedRow(
          rowId: 'row-386',
          confidence: 0.82,
          diveNumber: const LogbookOcrField(value: 386, confidence: 0.95),
          date: LogbookOcrField(value: d(9, 15), confidence: 0.94),
          dateRaw: const LogbookOcrField(value: '15/9', confidence: 0.94),
          locationName:
              const LogbookOcrField(value: 'Seline - Kuk', confidence: 0.82),
          country: const LogbookOcrField(value: 'HR', confidence: 0.80),
          depthMaxMeters: const LogbookOcrField(value: 33, confidence: 0.97),
          durationMinutes: const LogbookOcrField(value: 54, confidence: 0.94),
          sea: const LogbookOcrField(value: true, confidence: 0.72),
          notes: const LogbookOcrField(
            value: 'Dalmatiens ?, nudibranche, poulpe',
            confidence: 0.62,
            needsReview: true,
          ),
        ),
        LogbookOcrSuggestedRow(
          rowId: 'row-387',
          confidence: 0.78,
          warnings: const ['Notes et signatures partiellement illisibles.'],
          diveNumber: const LogbookOcrField(value: 387, confidence: 0.94),
          date: LogbookOcrField(value: d(9, 15), confidence: 0.94),
          dateRaw: const LogbookOcrField(value: '15/9', confidence: 0.94),
          locationName: const LogbookOcrField(
            value: 'Blue Marine Cave - Kuk',
            confidence: 0.82,
          ),
          country: const LogbookOcrField(value: 'HR', confidence: 0.80),
          depthMaxMeters: const LogbookOcrField(value: 39, confidence: 0.96),
          durationMinutes: const LogbookOcrField(value: 46, confidence: 0.92),
          sea: const LogbookOcrField(value: true, confidence: 0.72),
          notes: const LogbookOcrField(
            value: 'Grotte ?, rascasse',
            confidence: 0.58,
            needsReview: true,
          ),
        ),
      ],
    );
  }

  Future<List<String>> importRows({
    required String clubId,
    required String memberId,
    required String memberName,
    required String importJobId,
    required List<LogbookOcrSuggestedRow> rows,
  }) async {
    final ids = <String>[];
    for (final row in rows.where((r) => r.selected && !r.hasBlockingIssues)) {
      final entry = StudentLogbookEntry(
        id: '',
        memberId: memberId,
        memberName: memberName.isEmpty ? null : memberName,
        source: 'ocr_import',
        date: row.date.value!,
        locationName: row.locationName.value!.trim(),
        country: row.country.value,
        depthMaxMeters: row.depthMaxMeters.value,
        durationMinutes: row.durationMinutes.value,
        counters: LogbookCounters(
          deco: row.deco.value == true ? true : null,
          nuit: row.night.value == true ? true : null,
          mer: row.sea.value == true ? true : null,
        ),
        buddies: (row.buddies.value ?? const [])
            .where((name) => name.trim().isNotEmpty)
            .map((name) => LogbookBuddy(name: name.trim()))
            .toList(),
        notes: _notesFor(row),
      );

      final id = await _logbookService.create(
        clubId: clubId,
        entry: entry,
        extras: {
          'ocr_import_id': importJobId,
          'ocr_row_id': row.rowId,
          'ocr_confidence': row.confidence,
          if (row.warnings.isNotEmpty) 'ocr_warnings': row.warnings,
          'ocr_reviewed_at': FieldValue.serverTimestamp(),
          if (row.exitTime.value != null) 'exit_time_str': row.exitTime.value,
          if (row.entryTime.value != null)
            'entry_time_str': row.entryTime.value,
        },
      );
      ids.add(id);
    }
    return ids;
  }

  String? _notesFor(LogbookOcrSuggestedRow row) {
    final parts = <String>[];
    final notes = row.notes.value?.trim();
    if (notes != null && notes.isNotEmpty) parts.add(notes);
    if (row.warnings.isNotEmpty) {
      parts.add('OCR à vérifier: ${row.warnings.join('; ')}');
    }
    return parts.isEmpty ? null : parts.join('\n');
  }
}
