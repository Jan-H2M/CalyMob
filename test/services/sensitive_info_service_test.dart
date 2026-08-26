import 'package:calymob/services/sensitive_info_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('emergency sharing defaults to on when no preference was stored', () async {
    final firestore = FakeFirebaseFirestore();
    await firestore
        .doc('clubs/calypso/members/member/sensitive_info/emergency')
        .set({'emergency_contacts': <Map<String, dynamic>>[]});

    final info = await SensitiveInfoService(firestore: firestore)
        .getEmergency('calypso', 'member');

    expect(info?.shareWithStaff, isTrue);
  });

  test('an explicit emergency sharing refusal remains off', () async {
    final firestore = FakeFirebaseFirestore();
    await firestore
        .doc('clubs/calypso/members/member/sensitive_info/emergency')
        .set({
      'emergency_contacts': <Map<String, dynamic>>[],
      'gdpr_share_emergency_with_staff': false,
    });

    final info = await SensitiveInfoService(firestore: firestore)
        .getEmergency('calypso', 'member');

    expect(info?.shareWithStaff, isFalse);
  });
}
