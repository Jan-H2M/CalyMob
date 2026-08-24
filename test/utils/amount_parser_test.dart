import 'package:calymob/utils/amount_parser.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('parseAmount', () {
    test('accepts a comma decimal separator', () {
      expect(parseAmount('121,56'), 121.56);
    });

    test('accepts a dot decimal separator', () {
      expect(parseAmount('121.56'), 121.56);
    });

    test('rejects non-numeric input', () {
      expect(parseAmount('121,5,6'), isNull);
    });
  });
}
