import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/services/logbook_xlsx_import_service.dart';

void main() {
  group('LogbookXlsxImportService.parse', () {
    test('parses the canonical Calypso workbook and preserves extras', () {
      final dateSerial = DateTime.utc(2026, 7, 10)
          .difference(DateTime.utc(1899, 12, 30))
          .inDays;

      final result = LogbookXlsxImportService().parse(
        _xlsx([
          [
            'N°',
            'Date',
            'Heure immersion',
            'Lieu',
            'Pays',
            'Profondeur max (m)',
            'Durée (min)',
            'Form.',
            'Binômes',
            'Notes',
          ],
          [
            12,
            dateSerial,
            14.5 / 24,
            'Vodelée',
            'BE',
            22.5,
            45,
            1,
            'Pierre Dupont; Patrick V.',
            'Bonne visibilité',
          ],
        ]),
      );

      expect(result.validCount, 1);
      expect(result.invalidCount, 0);
      final row = result.rows.single;
      expect(row.diveNumber, 12);
      expect(row.date, DateTime.utc(2026, 7, 10));
      expect(row.locationName, 'Vodelée');
      expect(row.depthMaxMeters, 22.5);
      expect(row.durationMinutes, 45);
      expect(row.counters.exo, isTrue);
      expect(row.buddies.map((buddy) => buddy.name),
          ['Pierre Dupont', 'Patrick V.']);
      expect(row.extras['entry_time_str'], '14:30');
    });

    test('reports invalid dates and warns without a location', () {
      final result = LogbookXlsxImportService().parse(
        _xlsx([
          ['Date', 'Lieu'],
          ['pas-une-date', ''],
        ]),
      );

      expect(result.validCount, 0);
      expect(result.rows.single.errors, isNotEmpty);
      expect(result.rows.single.warnings, contains('Lieu manquant.'));
      expect(result.rows.single.locationName, '(à compléter)');
    });

    test('refuses a workbook without the Date header', () {
      expect(
        () => LogbookXlsxImportService().parse(
          _xlsx([
            ['Lieu'],
          ]),
        ),
        throwsFormatException,
      );
    });
  });
}

Uint8List _xlsx(List<List<Object?>> rows) {
  final rowXml = <String>[];
  for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    final cells = <String>[];
    for (var columnIndex = 0;
        columnIndex < rows[rowIndex].length;
        columnIndex++) {
      final value = rows[rowIndex][columnIndex];
      final reference = '${_columnName(columnIndex)}${rowIndex + 1}';
      if (value is String) {
        final escaped = value
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
        cells.add(
          '<c r="$reference" t="inlineStr"><is><t>$escaped</t></is></c>',
        );
      } else if (value != null) {
        cells.add('<c r="$reference"><v>$value</v></c>');
      }
    }
    rowXml.add(
      '<row r="${rowIndex + 1}">${cells.join()}</row>',
    );
  }
  final sheet = '<?xml version="1.0" encoding="UTF-8"?>'
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      '<sheetData>${rowXml.join()}</sheetData>'
      '</worksheet>';
  final archive = Archive()
    ..addFile(ArchiveFile.string('xl/worksheets/sheet1.xml', sheet));
  return Uint8List.fromList(ZipEncoder().encode(archive));
}

String _columnName(int index) {
  var value = index + 1;
  var name = '';
  while (value > 0) {
    value--;
    name = String.fromCharCode(65 + value % 26) + name;
    value ~/= 26;
  }
  return name;
}
