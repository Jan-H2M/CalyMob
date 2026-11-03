import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/utils/boutique_current_payment.dart';

void main() {
  final fixtures = jsonDecode(
    File(
      'test/fixtures/boutique_payment_context.json',
    ).readAsStringSync(),
  ) as List;
  for (final suffixLength in [12, 24]) {
    test(
        'COM-161: current QR preserves a $suffixLength-digit supplement reference',
        () {
      final fixture = fixtures
          .firstWhere((f) => f['name'] == 'supplement with reported initial');
      final order =
          Map<String, dynamic>.from(jsonDecode(jsonEncode(fixture['order'])));
      final rows = (order['paymentPlan']['requests'] as List);
      final extra = rows.firstWhere((r) => r['kind'] == 'supplement');
      final number = order['orderNumber'];
      final digest = sha256
          .convert(utf8.encode('$number:${extra['id']}'))
          .toString()
          .toUpperCase();
      final reference = '+++$number-S${digest.substring(0, suffixLength)}+++';
      extra['reference'] = reference;
      final current = boutiqueCurrentPayment(order)!;
      final epc = (current['epcPayload'] as String).split('\n');
      expect(current['amount'], 6.62);
      expect(current['communication'], reference);
      expect(epc[6], order['payment']['iban']);
      expect(epc[7], 'EUR6.62');
      expect(epc[9], isEmpty);
      expect(epc[10], reference);
      if (suffixLength == 12) expect(reference.length, lessThanOrEqualTo(35));
    });
  }
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
