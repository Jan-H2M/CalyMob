import 'dart:async';
import 'package:calymob/models/member_profile.dart';
import 'package:calymob/services/profile_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
      'directory stream follows consent updates and never substitutes private contacts',
      () async {
    final db = FakeFirebaseFirestore();
    final private = db.doc('clubs/fixture/members/member');
    final directory = db.doc('clubs/fixture/member_directory/member');
    await private.set({
      'email': 'private@example.invalid',
      'phone_number': '+3299999999',
      'share_email': true,
      'share_phone': true
    });
    final queue = StreamIterator(ProfileService(firestore: db)
        .watchDirectoryProfile('fixture', 'member'));
    addTearDown(queue.cancel);
    Future<MemberProfile?> next() async {
      expect(await queue.moveNext(), isTrue);
      return queue.current;
    }

    expect(await next(), isNull);
    await directory.set({
      'email': 'shared@example.invalid',
      'phone_number': '+3200000000',
      'share_email': true,
      'share_phone': true
    });
    final shared = (await next())!;
    expect(shared.email, 'shared@example.invalid');
    expect(shared.phoneNumber, '+3200000000');
    await directory.update({'share_email': false, 'share_phone': false});
    final revoked = (await next())!;
    expect(revoked.email, isEmpty);
    expect(revoked.phoneNumber, isNull);
    for (final flag in [
      'is_test_account',
      'isTestUser',
      'exclude_from_directory'
    ]) {
      await directory.update({flag: true});
      expect(await next(), isNull);
      await directory.update({flag: false});
      expect(await next(), isNotNull);
    }
    await directory.delete();
    expect(await next(), isNull);
    expect((await private.get()).data()!['share_email'], isTrue);
    expect((await private.get()).data()!['phone_number'], '+3299999999');
  });
}
