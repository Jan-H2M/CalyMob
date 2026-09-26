import 'package:calymob/utils/club_role_utils.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Gonflage recognition accepts codes, whitespace and mixed case', () {
    for (final role in const ['G', 'g', 'Gonflage', 'gOnFlAgE', ' G ']) {
      expect(
        ClubRoleUtils.hasGonflageRole([role]),
        isTrue,
        reason: 'Expected $role to be recognized as Gonflage',
      );
    }
  });

  test('Gonflage recognition does not grant unrelated roles', () {
    expect(
      ClubRoleUtils.hasGonflageRole(const ['Encadrant', 'admin', 'membre']),
      isFalse,
    );
  });
}
