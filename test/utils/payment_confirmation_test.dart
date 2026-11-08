import 'package:calymob/utils/payment_confirmation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('same total for different people cannot confirm a payment', () {
    expect(paymentAllocationsMatch({'member': 1500, 'guest-a': 800}, {'member': 1500, 'guest-b': 800}), isFalse);
    expect(paymentAllocationsMatch({'member': 1500, 'guest-a': 800}, {'guest-a': 800, 'member': 1500}), isTrue);
  });
  test('partial group failure reloads authoritative state and is not success',
      () async {
    final events = <String>[];
    await expectLater(
        confirmPaymentsAndRefresh(confirm: () async {
          events.add('parent accepted');
          throw StateError('guest rejected');
        }, refresh: () async {
          events.add('refresh');
        }),
        throwsA(isA<StateError>().having(
            (e) => e.message, 'message', contains('Confirmation incomplète'))));
    expect(events, ['parent accepted', 'refresh']);
  });

  test('refresh failure never hides original confirmation failure', () async {
    await expectLater(
        confirmPaymentsAndRefresh(confirm: () async {
          throw StateError('guest rejected');
        }, refresh: () async {
          throw StateError('offline');
        }),
        throwsA(isA<StateError>()
            .having((e) => e.message, 'message', contains('guest rejected'))
            .having((e) => e.message, 'refresh instruction', contains('Rouvrez la fiche'))));
  });

  test('successful commands but failed refresh report recorded confirmations',
      () async {
    await expectLater(
        confirmPaymentsAndRefresh(
            confirm: () async {},
            refresh: () async {
              throw StateError('offline');
            }),
        throwsA(isA<StateError>().having((e) => e.message, 'message',
            contains('Confirmations enregistrées'))));
  });

  test('successful confirmation refreshes before resolving', () async {
    final events = <String>[];
    await confirmPaymentsAndRefresh(confirm: () async {
      events.add('confirm');
    }, refresh: () async {
      events.add('refresh');
    });
    expect(events, ['confirm', 'refresh']);
  });
}
