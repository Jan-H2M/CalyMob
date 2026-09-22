import 'package:calymob/utils/permission_helper.dart';
import 'package:calymob/utils/club_role_utils.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PermissionHelper.canViewEmergencyContacts', () {
    test('keeps pool function separate from career/LIFRAS authority', () {
      const poolOnly = ['Encadrant Piscine'];
      expect(PermissionHelper.isEncadrant(poolOnly), isFalse);
      expect(PermissionHelper.isEncadrantPiscine(poolOnly), isTrue);
      expect(
        PermissionHelper.canValidateLifras(
          clubStatuten: poolOnly,
          plongeurCode: 'MC',
        ),
        isFalse,
      );
    });

    test('allows encadrants, E role, CA and committee roles', () {
      for (final roles in <List<String>>[
        ['Encadrant'],
        ['encadrants'],
        ['E'],
        ['Encadrant Carrière'],
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

    test(
      'official encadrants and explicit assistants are in the pool group',
      () {
        expect(PermissionHelper.isEncadrantPiscine(['Encadrants']), isTrue);
        expect(
          PermissionHelper.isEncadrantPiscine(['Encadrants et assistants']),
          isTrue,
        );
      },
    );

    test(
        'explicit assistants can provide theory availability without LIFRAS rights',
        () {
      const roles = ['Encadrants et assistants'];
      expect(
          ClubRoleUtils.piscineAvailabilityRoles(roles), contains('theorie'));
      expect(PermissionHelper.isEncadrant(roles), isFalse);
      expect(
        PermissionHelper.canValidateLifras(
          clubStatuten: roles,
          plongeurCode: 'MC',
        ),
        isFalse,
      );
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
