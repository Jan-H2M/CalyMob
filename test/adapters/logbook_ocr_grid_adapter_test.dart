import 'package:calymob/adapters/logbook_ocr_grid_adapter.dart';
import 'package:calymob/models/logbook_ocr_import.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const adapter = LogbookOcrGridAdapter();

  test('maps OCR values and keeps review provenance', () {
    final row = LogbookOcrSuggestedRow(
      rowId: 'row-1',
      confidence: 0.81,
      date: LogbookOcrField(
        value: DateTime(2026, 7, 24),
        confidence: 0.72,
        raw: '24/7',
        needsReview: true,
      ),
      locationName: const LogbookOcrField(
        value: 'Vodelée',
        confidence: 0.93,
        raw: 'Vodelee',
      ),
      country: const LogbookOcrField(
        value: 'BE',
        confidence: 0.89,
        raw: 'Belgique',
      ),
      depthMaxMeters: const LogbookOcrField(
        value: 22.5,
        confidence: 0.88,
        raw: '22,5',
      ),
      dp: const LogbookOcrField(
        value: true,
        confidence: 0.67,
        raw: 'DP',
        needsReview: true,
      ),
      buddies: const LogbookOcrField(
        value: ['Pierre', 'Marie'],
        confidence: 0.76,
        raw: 'Pierre; Marie',
      ),
    );

    final fields = adapter.fields(row);
    final date = fields.singleWhere((field) => field.id == 'date');
    final depth = fields.singleWhere((field) => field.id == 'depth');
    final country = fields.singleWhere((field) => field.id == 'country');
    final dp = fields.singleWhere((field) => field.id == 'dp');
    final buddies = fields.singleWhere((field) => field.id == 'buddy');

    expect(date.value, '24/07/2026');
    expect(date.raw, '24/7');
    expect(date.confidence, 0.72);
    expect(date.needsReview, isTrue);
    expect(depth.value, '22.5 m');
    expect(country.value, 'BE');
    expect(country.raw, 'Belgique');
    expect(dp.isToggle, isTrue);
    expect(dp.selected, isTrue);
    expect(dp.raw, 'DP');
    expect(dp.needsReview, isTrue);
    expect(buddies.value, 'Pierre, Marie');
  });

  test('maps equipment summaries without mutating the source row', () {
    const tank = {
      'label': 'Ma 12 L',
      'volume_l': 12,
      'pressure_bar': 200,
    };
    const row = LogbookOcrSuggestedRow(
      rowId: 'row-2',
      confidence: 0.95,
      tank: LogbookOcrField(value: tank, confidence: 0.9, raw: '12L 200b'),
      combi: LogbookOcrField(
        value: {'type': 'etanche'},
        confidence: 0.8,
        raw: 'étanche',
      ),
    );

    final fields = adapter.fields(row);

    expect(
      fields.singleWhere((field) => field.id == 'tank').value,
      'Ma 12 L · 12 L · 200 bar',
    );
    expect(
      fields.singleWhere((field) => field.id == 'combi').value,
      'Étanche',
    );
    expect(row.tank.value, same(tank));
    expect(row.tank.raw, '12L 200b');
  });
}
