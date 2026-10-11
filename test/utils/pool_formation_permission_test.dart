import 'package:calymob/utils/permission_helper.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'pool encadrant can view formation and add remarks without validation',
    () {
      const roles = ['Encadrant Piscine'];

      expect(PermissionHelper.canViewFormationTracking(roles), isTrue);
      expect(PermissionHelper.canAddPoolFormationRemark(roles), isTrue);
      expect(
        PermissionHelper.formationTrackingScope(
          clubStatuten: roles,
          plongeurCode: 'AM',
        ),
        FormationTrackingScope.piscineOnly,
      );
      expect(
        PermissionHelper.canValidateLifras(
          clubStatuten: roles,
          plongeurCode: 'AM',
        ),
        isFalse,
      );
    },
  );

  test('ordinary members cannot view or comment on formation tracking', () {
    const roles = ['membre'];

    expect(PermissionHelper.canViewFormationTracking(roles), isFalse);
    expect(PermissionHelper.canAddPoolFormationRemark(roles), isFalse);
    expect(
      PermissionHelper.formationTrackingScope(
        clubStatuten: roles,
        plongeurCode: '2*',
      ),
      isNull,
    );
  });

  test('admins retain formation visibility and remark access', () {
    const roles = ['Administrateur'];

    expect(PermissionHelper.canViewFormationTracking(roles), isTrue);
    expect(PermissionHelper.canAddPoolFormationRemark(roles), isTrue);
    expect(
      PermissionHelper.formationTrackingScope(
        clubStatuten: roles,
        plongeurCode: null,
      ),
      FormationTrackingScope.full,
    );
  });

  test('canonical app admin gets full scope without a moniteur code', () {
    const roles = ['CA', 'E', 'P'];

    expect(
      PermissionHelper.canViewFormationTracking(roles, appRole: 'admin'),
      isTrue,
    );
    expect(
      PermissionHelper.canValidateLifras(
        clubStatuten: roles,
        plongeurCode: 'AM',
        appRole: 'admin',
      ),
      isTrue,
    );
    expect(
      PermissionHelper.formationTrackingScope(
        clubStatuten: roles,
        plongeurCode: 'AM',
        appRole: 'admin',
      ),
      FormationTrackingScope.full,
    );
  });

  test('LIFRAS moniteur with encadrant role gets the full formation scope', () {
    expect(
      PermissionHelper.formationTrackingScope(
        clubStatuten: const ['Encadrant'],
        plongeurCode: 'MC',
      ),
      FormationTrackingScope.full,
    );
  });

  test('LIFRAS code alone does not bypass the encadrant role gate', () {
    expect(
      PermissionHelper.formationTrackingScope(
        clubStatuten: const ['membre'],
        plongeurCode: 'MC',
      ),
      isNull,
    );
  });
}
