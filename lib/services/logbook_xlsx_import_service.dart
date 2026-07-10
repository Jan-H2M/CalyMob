import 'dart:convert';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:xml/xml.dart';
import '../models/student_logbook_entry.dart';
import 'student_logbook_service.dart';

class ParsedLogbookXlsxRow {
  final int rowNumber;
  final DateTime? date;
  final String locationName;
  final String? country;
  final double? depthMaxMeters;
  final int? durationMinutes;
  final int? diveNumber;
  final LogbookCounters counters;
  final List<LogbookBuddy> buddies;
  final String? notes;
  final Map<String, dynamic> extras;
  final List<String> errors;
  final List<String> warnings;

  const ParsedLogbookXlsxRow({
    required this.rowNumber,
    required this.date,
    required this.locationName,
    this.country,
    this.depthMaxMeters,
    this.durationMinutes,
    this.diveNumber,
    required this.counters,
    required this.buddies,
    this.notes,
    this.extras = const {},
    this.errors = const [],
    this.warnings = const [],
  });

  bool get isValid => errors.isEmpty && date != null;
}

class LogbookXlsxParseResult {
  final List<ParsedLogbookXlsxRow> rows;
  final String? headerWarning;

  const LogbookXlsxParseResult({
    required this.rows,
    this.headerWarning,
  });

  int get validCount => rows.where((row) => row.isValid).length;
  int get invalidCount => rows.length - validCount;
}

/// Parser/importer for the canonical Calypso logbook .xlsx layout.
class LogbookXlsxImportService {
  final StudentLogbookService? _providedLogbookService;

  LogbookXlsxImportService({StudentLogbookService? logbookService})
      : _providedLogbookService = logbookService;

  StudentLogbookService get _logbookService =>
      _providedLogbookService ?? StudentLogbookService();

  static const Map<String, String> _headerKeys = {
    'n°': 'dive_number',
    'date': 'date',
    'heure immersion': 'entry_time',
    'heure sortie': 'exit_time',
    'lieu': 'location_name',
    'pays': 'country',
    'profondeur max (m)': 'depth_max_meters',
    'durée (min)': 'duration_minutes',
    'form.': 'cnt_exo',
    'exo': 'cnt_exo',
    'nitrox': 'cnt_nitrox',
    'déco': 'cnt_deco',
    'dp': 'cnt_dp',
    'sf': 'cnt_sf',
    'nuit': 'cnt_nuit',
    'mer': 'cnt_mer',
    'combi type': 'combi_type',
    'combi épaisseur (mm)': 'combi_thickness_mm',
    'combi marque': 'combi_brand',
    'combi étiquette': 'combi_label',
    'bouteille volume (l)': 'tank_volume_l',
    'bouteille pression (bar)': 'tank_pressure_bar',
    'bouteille étiquette': 'tank_label',
    'lestage (kg)': 'lestage_kg',
    'binômes': 'buddies',
    'notes': 'notes',
  };

  LogbookXlsxParseResult parse(Uint8List bytes) {
    if (bytes.isEmpty) throw const FormatException('Le fichier est vide.');
    final sheetRows = _decodeFirstSheet(bytes);
    if (sheetRows.isEmpty) return const LogbookXlsxParseResult(rows: []);

    final headerIndexes = <int, String>{};
    for (var index = 0; index < sheetRows.first.length; index++) {
      final label = _cellString(sheetRows.first[index]).toLowerCase();
      final key = _headerKeys[label];
      if (key != null) headerIndexes[index] = key;
    }
    if (!headerIndexes.containsValue('date')) {
      throw const FormatException(
        'Colonne « Date » introuvable. Utilise le modèle Calypso.',
      );
    }

    final rows = <ParsedLogbookXlsxRow>[];
    for (var rowIndex = 1; rowIndex < sheetRows.length; rowIndex++) {
      final cells = sheetRows[rowIndex];
      if (cells.every((cell) => _cellString(cell).isEmpty)) continue;
      final values = <String, Object?>{};
      for (final entry in headerIndexes.entries) {
        values[entry.value] =
            entry.key < cells.length ? cells[entry.key] : null;
      }
      rows.add(_parseRow(values, rowIndex + 1));
    }

    final missing = <String>[
      if (!headerIndexes.containsValue('location_name')) 'Lieu',
      if (!headerIndexes.containsValue('depth_max_meters')) 'Profondeur',
      if (!headerIndexes.containsValue('duration_minutes')) 'Durée',
    ];
    return LogbookXlsxParseResult(
      rows: rows,
      headerWarning: missing.isEmpty
          ? null
          : 'Colonnes absentes : ${missing.join(', ')}. Les lignes restent importables.',
    );
  }

  ParsedLogbookXlsxRow _parseRow(
    Map<String, Object?> values,
    int rowNumber,
  ) {
    final errors = <String>[];
    final warnings = <String>[];
    final date = _cellDate(values['date']);
    if (date == null) errors.add('Date manquante ou invalide.');

    var location = _cellString(values['location_name']);
    if (location.isEmpty) {
      location = '(à compléter)';
      warnings.add('Lieu manquant.');
    }

    final depth = _cellDouble(values['depth_max_meters']);
    if (depth != null && (depth < 0 || depth > 200)) {
      warnings.add('Profondeur invraisemblable ($depth m).');
    }
    final duration = _cellInt(values['duration_minutes']);
    if (duration != null && (duration < 1 || duration > 600)) {
      warnings.add('Durée invraisemblable ($duration min).');
    }

    final buddies = _cellString(values['buddies'])
        .split(RegExp(r'[;,\n]+'))
        .map((name) => name.trim())
        .where((name) => name.isNotEmpty)
        .map((name) => LogbookBuddy(name: name))
        .toList();
    final notes = _cellString(values['notes']);
    final entryTime = _cellTime(values['entry_time']);
    final exitTime = _cellTime(values['exit_time']);
    final extras = <String, dynamic>{
      if (entryTime != null && date != null)
        'entry_time': Timestamp.fromDate(
          DateTime(date.year, date.month, date.day, entryTime.$1, entryTime.$2),
        ),
      if (entryTime != null)
        'entry_time_str': _formatTime(entryTime.$1, entryTime.$2),
      if (exitTime != null && date != null)
        'exit_time': Timestamp.fromDate(
          DateTime(date.year, date.month, date.day, exitTime.$1, exitTime.$2),
        ),
      if (exitTime != null)
        'exit_time_str': _formatTime(exitTime.$1, exitTime.$2),
      if (_cellString(values['combi_type']).isNotEmpty)
        'combi': {
          'type': _cellString(values['combi_type']),
          if (_cellDouble(values['combi_thickness_mm']) != null)
            'thickness_mm': _cellDouble(values['combi_thickness_mm']),
          if (_cellString(values['combi_brand']).isNotEmpty)
            'brand': _cellString(values['combi_brand']),
          if (_cellString(values['combi_label']).isNotEmpty)
            'label': _cellString(values['combi_label']),
        },
      if (_cellDouble(values['tank_volume_l']) != null ||
          _cellDouble(values['tank_pressure_bar']) != null ||
          _cellString(values['tank_label']).isNotEmpty)
        'tank': {
          if (_cellDouble(values['tank_volume_l']) != null)
            'volume_l': _cellDouble(values['tank_volume_l']),
          if (_cellDouble(values['tank_pressure_bar']) != null)
            'pressure_bar': _cellDouble(values['tank_pressure_bar']),
          if (_cellString(values['tank_label']).isNotEmpty)
            'label': _cellString(values['tank_label']),
        },
      if (_cellDouble(values['lestage_kg']) != null)
        'lestage_kg': _cellDouble(values['lestage_kg']),
      if (_cellInt(values['dive_number']) != null)
        'dive_number': _cellInt(values['dive_number']),
      'binomes': buddies.map((buddy) => buddy.toMap()).toList(),
    };

    return ParsedLogbookXlsxRow(
      rowNumber: rowNumber,
      date: date,
      locationName: location,
      country: _cellString(values['country']).isEmpty
          ? null
          : _cellString(values['country']),
      depthMaxMeters: depth,
      durationMinutes: duration,
      diveNumber: _cellInt(values['dive_number']),
      counters: LogbookCounters(
        exo: _cellBool(values['cnt_exo']),
        nitrox: _cellBool(values['cnt_nitrox']),
        deco: _cellBool(values['cnt_deco']),
        dp: _cellBool(values['cnt_dp']),
        sf: _cellBool(values['cnt_sf']),
        nuit: _cellBool(values['cnt_nuit']),
        mer: _cellBool(values['cnt_mer']),
      ),
      buddies: buddies,
      notes: notes.isEmpty ? null : notes,
      extras: extras,
      errors: errors,
      warnings: warnings,
    );
  }

  Future<String> importRow({
    required String clubId,
    required String memberId,
    required String memberName,
    required ParsedLogbookXlsxRow row,
  }) {
    if (!row.isValid) {
      throw StateError('Une ligne invalide ne peut pas être importée.');
    }
    return _logbookService.create(
      clubId: clubId,
      entry: StudentLogbookEntry(
        id: '',
        memberId: memberId,
        memberName: memberName,
        source: 'imported',
        date: row.date!,
        locationName: row.locationName,
        country: row.country,
        depthMaxMeters: row.depthMaxMeters,
        durationMinutes: row.durationMinutes,
        counters: row.counters,
        buddies: row.buddies,
        notes: row.notes,
      ),
      extras: row.extras,
    );
  }

  static List<List<Object?>> _decodeFirstSheet(Uint8List bytes) {
    Archive archive;
    try {
      archive = ZipDecoder().decodeBytes(bytes);
    } catch (_) {
      throw const FormatException(
        'Ce fichier ne semble pas être un .xlsx valide.',
      );
    }

    ArchiveFile? findFile(String name) {
      for (final file in archive.files) {
        if (file.isFile && file.name == name) return file;
      }
      return null;
    }

    final sheetFiles = archive.files
        .where((file) =>
            file.isFile &&
            RegExp(r'^xl/worksheets/sheet\d+\.xml$').hasMatch(file.name))
        .toList()
      ..sort((a, b) => a.name.compareTo(b.name));
    if (sheetFiles.isEmpty) {
      throw const FormatException('Le fichier ne contient aucune feuille.');
    }

    final sharedStrings = <String>[];
    final sharedFile = findFile('xl/sharedStrings.xml');
    if (sharedFile != null) {
      final document = XmlDocument.parse(utf8.decode(sharedFile.content));
      for (final item in document.findAllElements('si')) {
        sharedStrings.add(
          item.findAllElements('t').map((node) => node.innerText).join(),
        );
      }
    }

    final sheet = XmlDocument.parse(utf8.decode(sheetFiles.first.content));
    final rows = <List<Object?>>[];
    for (final rowNode in sheet.findAllElements('row')) {
      final rowIndex =
          int.tryParse(rowNode.getAttribute('r') ?? '') ?? (rows.length + 1);
      while (rows.length < rowIndex) {
        rows.add(<Object?>[]);
      }
      final row = <Object?>[];
      for (final cell in rowNode.findElements('c')) {
        final reference = cell.getAttribute('r') ?? '';
        final columnIndex = _columnIndex(reference);
        while (row.length <= columnIndex) {
          row.add(null);
        }
        final type = cell.getAttribute('t');
        final raw = cell.findElements('v').firstOrNull?.innerText;
        Object? value;
        if (type == 'inlineStr') {
          value =
              cell.findAllElements('t').map((node) => node.innerText).join();
        } else if (type == 's') {
          final index = int.tryParse(raw ?? '');
          value = index != null && index >= 0 && index < sharedStrings.length
              ? sharedStrings[index]
              : null;
        } else if (type == 'b') {
          value = raw == '1';
        } else if (type == 'str' || type == 'e') {
          value = raw;
        } else if (raw != null && raw.isNotEmpty) {
          value = int.tryParse(raw) ?? double.tryParse(raw) ?? raw;
        }
        row[columnIndex] = value;
      }
      rows[rowIndex - 1] = row;
    }
    return rows;
  }

  static int _columnIndex(String reference) {
    final letters = RegExp(r'^[A-Za-z]+').stringMatch(reference) ?? 'A';
    var index = 0;
    for (final code in letters.toUpperCase().codeUnits) {
      index = index * 26 + (code - 64);
    }
    return index - 1;
  }

  static String _cellString(Object? value) => value?.toString().trim() ?? '';

  static int? _cellInt(Object? value) {
    if (value is int) return value;
    if (value is double) return value.round();
    return int.tryParse(_cellString(value));
  }

  static double? _cellDouble(Object? value) {
    if (value is int) return value.toDouble();
    if (value is double) return value;
    return double.tryParse(_cellString(value).replaceAll(',', '.'));
  }

  static bool _cellBool(Object? value) {
    if (value is bool) return value;
    if (value is int) return value != 0;
    if (value is double) return value != 0;
    return const {'1', 'true', 'x', 'oui', 'yes', 'y', '✓', 'v'}
        .contains(_cellString(value).toLowerCase());
  }

  static DateTime? _cellDate(Object? value) {
    final numeric = _cellDouble(value);
    if (numeric != null && numeric > 1000) {
      return DateTime.utc(1899, 12, 30).add(Duration(days: numeric.floor()));
    }
    final text = _cellString(value);
    final iso = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(text);
    if (iso != null) {
      return DateTime(
        int.parse(iso.group(1)!),
        int.parse(iso.group(2)!),
        int.parse(iso.group(3)!),
      );
    }
    final fr = RegExp(r'^(\d{2})/(\d{2})/(\d{4})$').firstMatch(text);
    if (fr != null) {
      return DateTime(
        int.parse(fr.group(3)!),
        int.parse(fr.group(2)!),
        int.parse(fr.group(1)!),
      );
    }
    return DateTime.tryParse(text);
  }

  static (int, int)? _cellTime(Object? value) {
    final numeric = _cellDouble(value);
    if (numeric != null && numeric >= 0 && numeric < 1) {
      final minutes = (numeric * 24 * 60).round();
      return ((minutes ~/ 60) % 24, minutes % 60);
    }
    final match = RegExp(r'^(\d{1,2})[:hH](\d{2})').firstMatch(
      _cellString(value),
    );
    if (match == null) return null;
    final hour = int.parse(match.group(1)!);
    final minute = int.parse(match.group(2)!);
    if (hour > 23 || minute > 59) return null;
    return (hour, minute);
  }

  static String _formatTime(int hour, int minute) =>
      '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';
}
