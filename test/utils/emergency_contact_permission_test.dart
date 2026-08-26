import 'package:calymob/utils/permission_helper.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PermissionHelper.canViewEmergencyContacts', () {
    test('allows encadrants, E role, CA and committee roles', () {
      for (final roles in <List<String>>[
        ['Encadrant'],
        ['encadrants'],
        ['E'],
        ['CA'],
        ['comite'],
        ['Comité'],
      ]) {
        expect(
          PermissionHelper.canViewEmergencyContacts(roles),
          isTrue,
          reason: 'Expected access for $roles',
        );
      }
    });

    test('denies ordinary members and unrelated operational roles', () {
      for (final roles in <List<String>>[
        [],
        ['membre'],
        ['organisateur'],
        ['accueil'],
        ['gonflage'],
      ]) {
        expect(
          PermissionHelper.canViewEmergencyContacts(roles),
          isFalse,
          reason: 'Expected no access for $roles',
        );
      }
    });
  });
}
