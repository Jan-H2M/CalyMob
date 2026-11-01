import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/utils/boutique_current_payment.dart';

void main() {
  final fixtures =
      jsonDecode(
            File(
              'test/fixtures/boutique_payment_context.json',
            ).readAsStringSync(),
          )
          as List;
  for (final fixture in fixtures) {
    test('server payment contract: ${fixture['name']}', () {
      final actual = boutiqueCurrentPayment(
        Map<String, dynamic>.from(fixture['order']),
      );
      if (fixture['expected'] == null) {
        expect(actual, isNull);
      } else {
        expect(actual, isNotNull);
        for (final entry in (fixture['expected'] as Map).entries) {
          if (entry.value is num) {
            expect(
              actual![entry.key],
              closeTo(entry.value, 0.000001),
              reason: entry.key,
            );
          } else {
            expect(actual![entry.key], entry.value, reason: entry.key);
          }
        }
      }
    });
  }
}
