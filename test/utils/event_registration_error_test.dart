import 'package:calymob/utils/event_registration_error.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('COM-147 missing member tariff explains remedy without exposing stack',
      () {
    final message = eventRegistrationErrorMessage(FirebaseFunctionsException(
      code: 'failed-precondition',
      message: 'Aucun tarif membre ne correspond à votre catégorie.',
      details: const {'stack': 'synthetic-private-stack'},
    ));
    expect(message, contains('tarifs de cette activité doivent être corrigés'));
    expect(message, contains('ne modifiez pas votre catégorie'));
    expect(message, isNot(contains('synthetic-private-stack')));
    expect(message, isNot(contains('Firebase')));
  });
  test('unavailable guest tariff is understandable without making it free', () {
    final message = eventRegistrationErrorMessage(FirebaseFunctionsException(
      code: 'invalid-argument',
      message: 'Tarif invité indisponible.',
    ));
    expect(message, contains('Contactez l’organisateur'));
    expect(message, isNot(contains('gratuit')));
  });
  test('permission error does not claim a tariff or role change is needed', () {
    expect(
        eventRegistrationErrorMessage(FirebaseFunctionsException(
          code: 'permission-denied',
          message: 'synthetic-private-detail',
        )),
        contains('Vérifiez votre connexion'));
  });
  test('ambiguous transport failure asks to verify before retrying', () {
    final message = eventRegistrationErrorMessage(FirebaseFunctionsException(
      code: 'deadline-exceeded',
      message: 'synthetic-private-detail',
    ));
    expect(message, contains('Vérifiez vos inscriptions avant de réessayer'));
    expect(message, isNot(contains('synthetic-private-detail')));
  });
  test('non-callable errors never leak raw exceptions', () {
    final message =
        eventRegistrationErrorMessage(StateError('synthetic-private-detail'));
    expect(message, contains('Vérifiez vos inscriptions'));
    expect(message, isNot(contains('synthetic-private-detail')));
  });
}
