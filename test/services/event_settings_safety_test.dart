import 'package:calymob/models/operation.dart';
import 'package:calymob/models/tariff.dart';
import 'package:calymob/models/supplement.dart';
import 'package:calymob/services/operation_service.dart';
import 'package:calymob/utils/event_edit_safety.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('price input accepts commas and rejects invalid or negative values', () {
    expect(parseEventPriceInput('8,50'), 8.5);
    expect(parseEventPriceInput('0'), 0);
    for (final value in ['', 'abc', '-1', 'NaN', 'Infinity']) {
      expect(parseEventPriceInput(value), isNull);
    }
  });

  test('supplement serialization preserves unknown fields', () {
    final supplement = Supplement.fromMap({
      'id': 'rental',
      'name': 'Location',
      'price': 5,
      'future_field': 'keep',
    });
    expect(supplement.toMap(), containsPair('future_field', 'keep'));
  });

  test('only fields actually changed by the user are included', () {
    final original = {
      'titre': 'Ancien',
      'payment_required': false,
      'allowed_payment_methods': ['qr_email']
    };
    final edited = {
      'titre': 'Nouveau',
      'payment_required': false,
      'allowed_payment_methods': ['qr_email']
    };
    expect(changedEventValues(original, edited), {'titre': 'Nouveau'});
  });

  test('clearing a deadline removes only that field', () async {
    final db = FakeFirebaseFirestore();
    final ref = db.doc('clubs/calypso/operations/event');
    await ref.set({
      'titre': 'Event',
      'type': 'evenement',
      'registration_deadline': DateTime.utc(2026, 11, 7),
      'payment_required': true
    });
    final original =
        eventEditableValues(Operation.fromFirestore(await ref.get()));
    await OperationService(firestore: db).updateEventSettingsSafely(
      clubId: 'calypso',
      operationId: 'event',
      original: original,
      changes: {'registration_deadline': null},
    );
    final saved = (await ref.get()).data()!;
    expect(saved.containsKey('registration_deadline'), false);
    expect(saved['payment_required'], true);
  });

  test('tariff serialization retains installment and unknown server fields',
      () {
    final tariff = Tariff.fromMap({
      'id': 'member',
      'label': 'Membre',
      'category': 'membre',
      'price': 15,
      'self_selectable': false,
      'requires_admin_validation': true,
      'installment_amounts': {'deposit': 5},
      'future_field': 'keep',
    });
    expect(tariff.toMap(), containsPair('future_field', 'keep'));
    expect(tariff.toMap(), containsPair('self_selectable', false));
    expect(tariff.toMap(), containsPair('requires_admin_validation', true));
    expect(tariff.toMap()['installment_amounts'], {'deposit': 5.0});
  });

  test('unrelated server changes survive an edit to the title', () async {
    final db = FakeFirebaseFirestore();
    final ref = db.doc('clubs/calypso/operations/event');
    await ref.set({
      'titre': 'Original',
      'type': 'evenement',
      'payment_required': false,
      'event_tariffs': [
        {
          'id': 'member',
          'label': 'Membre',
          'category': 'membre',
          'price': 8,
          'future_field': 'keep'
        }
      ]
    });
    final original =
        eventEditableValues(Operation.fromFirestore(await ref.get()));
    await ref.update({'payment_required': true});
    await OperationService(firestore: db).updateEventSettingsSafely(
      clubId: 'calypso',
      operationId: 'event',
      original: original,
      changes: {'titre': 'Nouveau'},
    );
    final saved = (await ref.get()).data()!;
    expect(saved['titre'], 'Nouveau');
    expect(saved['payment_required'], true);
    expect((saved['event_tariffs'] as List).single['future_field'], 'keep');
  });

  test('a concurrent change to the same field blocks the stale write',
      () async {
    final db = FakeFirebaseFirestore();
    final ref = db.doc('clubs/calypso/operations/event');
    await ref.set({'titre': 'Original', 'type': 'evenement'});
    final original =
        eventEditableValues(Operation.fromFirestore(await ref.get()));
    await ref.update({'titre': 'Autre modification'});
    await expectLater(
        OperationService(firestore: db).updateEventSettingsSafely(
          clubId: 'calypso',
          operationId: 'event',
          original: original,
          changes: {'titre': 'Valeur périmée'},
        ),
        throwsA(isA<EventSettingsConflict>()));
    expect((await ref.get()).data()!['titre'], 'Autre modification');
  });

  test('a changed capacity blocks a stale budget calculation', () async {
    final db = FakeFirebaseFirestore();
    final ref = db.doc('clubs/calypso/operations/event');
    await ref.set({
      'titre': 'Event',
      'type': 'evenement',
      'capacite_max': 10,
      'montant_prevu': 80
    });
    final original =
        eventEditableValues(Operation.fromFirestore(await ref.get()));
    await ref.update({'capacite_max': 20});
    await expectLater(
        OperationService(firestore: db).updateEventSettingsSafely(
          clubId: 'calypso',
          operationId: 'event',
          original: original,
          changes: {'event_tariffs': [], 'montant_prevu': 80.0},
        ),
        throwsA(isA<EventSettingsConflict>()));
    expect((await ref.get()).data()!['capacite_max'], 20);
  });

  test(
      'guest permission cannot combine with a concurrently removed guest tariff',
      () async {
    final db = FakeFirebaseFirestore();
    final ref = db.doc('clubs/calypso/operations/event');
    await ref.set({
      'titre': 'Event',
      'type': 'evenement',
      'payment_required': true,
      'allow_guests': false,
      'event_tariffs': [
        {'id': 'member', 'label': 'Membre', 'category': 'membre', 'price': 8},
        {
          'id': 'guest',
          'label': 'Invité',
          'category': 'invite',
          'price': 8,
          'is_guest_tariff': true
        },
      ]
    });
    final original =
        eventEditableValues(Operation.fromFirestore(await ref.get()));
    await ref.update({
      'event_tariffs': [
        {'id': 'member', 'label': 'Membre', 'category': 'membre', 'price': 8},
      ]
    });
    await expectLater(
        OperationService(firestore: db).updateEventSettingsSafely(
          clubId: 'calypso',
          operationId: 'event',
          original: original,
          changes: {'allow_guests': true},
        ),
        throwsA(isA<EventSettingsInvalid>()));
    expect((await ref.get()).data()!['allow_guests'], false);
  });

  test('an explicitly free guest tariff is allowed', () {
    expect(
        () => validateEventSettings({
              'payment_required': true,
              'allow_guests': true,
              'event_tariffs': [
                {'is_guest_tariff': true, 'price': 0}
              ]
            }),
        returnsNormally);
  });

  test('rejects a positive tariff with payment disabled', () {
    expect(
        () => validateEventSettings({
              'payment_required': false,
              'event_tariffs': [
                {'price': 15}
              ]
            }),
        throwsA(isA<EventSettingsInvalid>()));
  });

  test('rejects invalid tariff and supplement prices', () {
    for (final price in [-1.0, double.nan, double.infinity]) {
      expect(
          () => validateEventSettings({
                'price_tbd': true,
                'event_tariffs': [
                  {'price': price}
                ]
              }),
          throwsA(isA<EventSettingsInvalid>()));
      expect(
          () => validateEventSettings({
                'price_tbd': true,
                'supplements': [
                  {'price': price}
                ]
              }),
          throwsA(isA<EventSettingsInvalid>()));
    }
  });
}
