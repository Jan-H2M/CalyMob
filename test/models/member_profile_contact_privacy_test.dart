import 'package:calymob/models/member_profile.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('missing contact flags retain the current legacy sharing policy', () {
    final directory = MemberProfile.fromDirectoryData('fixture', {
      'email': 'shared@example.invalid',
      'phone_number': '+3200000000',
    });
    expect(directory.shareEmail, isTrue);
    expect(directory.sharePhone, isTrue);
    expect(directory.email, 'shared@example.invalid');
    expect(directory.phoneNumber, '+3200000000');
  });

  test('explicit opt-outs redact stale directory values at the model boundary',
      () {
    final directory = MemberProfile.fromDirectoryData('fixture', {
      'email': 'hidden@example.invalid',
      'phone_number': '+3200000000',
      'share_email': false,
      'share_phone': false,
    });
    expect(directory.shareEmail, isFalse);
    expect(directory.sharePhone, isFalse);
    // Directory consumers (including email search) cannot use hidden payloads.
    expect(directory.email, isEmpty);
    expect(directory.phoneNumber, isNull);
  });

  test('own contact values survive opt-out and accept only known phone aliases',
      () async {
    final db = FakeFirebaseFirestore();
    final ref = db.doc('clubs/fixture/members/self');
    for (final key in ['phone_number', 'phoneNumber', 'telephone']) {
      await ref.set({
        'email': 'own@example.invalid',
        key: ' +3200000000 ',
        'share_email': false,
        'share_phone': false,
      });
      final own = MemberProfile.fromFirestore(await ref.get());
      expect(own.email, 'own@example.invalid');
      expect(own.phoneNumber, '+3200000000', reason: key);
      expect(own.shareEmail, isFalse);
      expect(own.sharePhone, isFalse);
    }
    await ref.set({'gsm': '+3299999999'});
    expect(MemberProfile.fromFirestore(await ref.get()).phoneNumber, isNull);
  });

  test('own phone aliases use canonical priority and skip blank invalid values',
      () async {
    final db = FakeFirebaseFirestore();
    final ref = db.doc('clubs/fixture/members/self');
    await ref.set({
      'phone_number': ' +3200000001 ',
      'phoneNumber': '+3200000002',
      'telephone': '+3200000003',
    });
    expect(MemberProfile.fromFirestore(await ref.get()).phoneNumber,
        '+3200000001');
    await ref.update({'phone_number': ' '});
    expect(MemberProfile.fromFirestore(await ref.get()).phoneNumber,
        '+3200000002');
    await ref.update({'phoneNumber': 123});
    expect(MemberProfile.fromFirestore(await ref.get()).phoneNumber,
        '+3200000003');
    await ref.set({'phoneNumber': '+3200000002'});
    final own = MemberProfile.fromFirestore(await ref.get());
    expect(own.shareEmail, isTrue);
    expect(own.sharePhone, isTrue);
  });
}
