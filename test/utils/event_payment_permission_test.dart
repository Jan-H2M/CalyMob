import 'package:calymob/utils/permission_helper.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('server application role admin may confirm payments', () {
    expect(
      PermissionHelper.canConfirmEventPayment(
        appRole: 'admin',
        clubStatuten: [],
      ),
      isTrue,
    );
  });
  for (final role in ['O', 'organisateur', 'Organisateur']) {
    test('server club statute $role may confirm payments', () {
      expect(
        PermissionHelper.canConfirmEventPayment(
          appRole: 'member',
          clubStatuten: [role],
        ),
        isTrue,
      );
    });
  }
  for (final role in [
    'member',
    'validateur',
    'encadrant',
    'accueil',
    'CA',
    'admin',
    'organizer',
    'o',
    'Organisateur ',
    'ORGANISATEUR',
  ]) {
    test('club statute $role alone grants no payment right', () {
      expect(
        PermissionHelper.canConfirmEventPayment(
          appRole: 'member',
          clubStatuten: [role],
        ),
        isFalse,
      );
    });
  }
  for (final role in [null, 'member', 'superadmin', 'validateur', 'Admin', 'admin ']) {
    test('unrecognized app role $role fails closed', () {
      expect(
        PermissionHelper.canConfirmEventPayment(
          appRole: role,
          clubStatuten: [],
        ),
        isFalse,
      );
    });
  }
}
