import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/utils/dive_number_policy.dart';

void main() {
  test('labels automatic previews provisional but not manual numbers', () {
    expect(formatDiveNumberPreview('355', isAutomaticSuggestion: true),
        'N°355 (provisoire)');
    expect(
        formatDiveNumberPreview('355', isAutomaticSuggestion: false), 'N°355');
  });

  test('a stale suggestion 355 is never written as an allocated number', () {
    final result = resolveDiveNumber(
      typed: 355,
      isEditing: false,
      isAutomaticSuggestion: true,
      usedNumbers: {354, 360},
    );
    expect(result.value, isNull);
    expect(result.conflict, isFalse);
  });

  test('preserves a manual historical number below the current maximum', () {
    final result = resolveDiveNumber(
      typed: 12,
      isEditing: false,
      isAutomaticSuggestion: false,
      usedNumbers: {1, 2, 45},
    );
    expect(result.value, 12);
    expect(result.conflict, isFalse);
  });

  test('rejects an exact duplicate manual number', () {
    final result = resolveDiveNumber(
      typed: 12,
      isEditing: false,
      isAutomaticSuggestion: false,
      usedNumbers: {12, 45},
    );
    expect(result.value, isNull);
    expect(result.conflict, isTrue);
  });

  test('omits an automatic suggestion so the server allocates atomically', () {
    final result = resolveDiveNumber(
      typed: 46,
      isEditing: false,
      isAutomaticSuggestion: true,
      usedNumbers: {45},
    );
    expect(result.value, isNull);
    expect(result.conflict, isFalse);
  });

  test('keeps the selected number while editing', () {
    final result = resolveDiveNumber(
      typed: 7,
      isEditing: true,
      isAutomaticSuggestion: false,
      usedNumbers: {7},
    );
    expect(result.value, 7);
    expect(result.conflict, isFalse);
  });
}
