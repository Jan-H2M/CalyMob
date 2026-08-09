import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/models/member_profile.dart';

void main() {
  group('MemberProfile.resolveMemberStatus', () {
    test('canonical inactive status wins over stale active legacy fields', () {
      expect(
        MemberProfile.resolveMemberStatus({
          'member_status': 'inactive',
          'isActive': true,
          'actif': true,
        }),
        'inactive',
      );
    });

    test('canonical archived status is not shown as active', () {
      expect(
        MemberProfile.resolveMemberStatus({
          'member_status': 'archived',
          'status': 'active',
        }),
        'inactive',
      );
    });

    test('legacy active fields remain supported without canonical status', () {
      expect(MemberProfile.resolveMemberStatus({'isActive': true}), 'active');
      expect(MemberProfile.resolveMemberStatus({'actif': true}), 'active');
    });

    test('missing status stays active by backward-compatible default', () {
      expect(MemberProfile.resolveMemberStatus({}), isNull);
    });
  });
}
