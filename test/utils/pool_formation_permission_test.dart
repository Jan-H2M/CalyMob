import 'package:calymob/utils/permission_helper.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('pool encadrant can view formation and add remarks without validation', () {
    const roles = ['Encadrant Piscine'];

    expect(PermissionHelper.canViewFormationTracking(roles), isTrue);
    expect(PermissionHelper.canAddPoolFormationRemark(roles), isTrue);
    expect(
      PermissionHelper.canValidateLifras(
        clubStatuten: roles,
        plongeurCode: 'AM',
      ),
      isFalse,
    );
  });

  test('ordinary members cannot view or comment on formation tracking', () {
    const roles = ['membre'];

    expect(PermissionHelper.canViewFormationTracking(roles), isFalse);
    expect(PermissionHelper.canAddPoolFormationRemark(roles), isFalse);
  });

  test('admins retain formation visibility and remark access', () {
    const roles = ['Administrateur'];

    expect(PermissionHelper.canViewFormationTracking(roles), isTrue);
    expect(PermissionHelper.canAddPoolFormationRemark(roles), isTrue);
  });
}
