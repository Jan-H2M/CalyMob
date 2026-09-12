import 'package:calymob/services/profile_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ProfileService birthday privacy', () {
    test('own directory card keeps projected birthday and only joins status',
        () async {
      final firestore = FakeFirebaseFirestore();
      await firestore.doc('clubs/calypso/member_directory/member-1').set({
        'first_name': 'Alice',
        'last_name': 'Example',
        'share_birthday': true,
        'birth_month': 7,
        'birth_day': 7,
      });
      await firestore.doc('clubs/calypso/member_directory/member-2').set({
        'first_name': 'Bob',
        'last_name': 'Example',
        'share_birthday': true,
        'birth_month': 7,
        'birth_day': 7,
      });
      await firestore
          .doc('clubs/calypso/member_operational_status/member-1')
          .set({
        'membership_category_code': 'membre_1ere',
      });
      // This private source must never replace the signed-in directory card.
      await firestore.doc('clubs/calypso/members/member-1').set({
        'first_name': 'Private',
        'last_name': 'Source',
        'birth_date': DateTime.utc(1991, 7, 6, 22),
        'share_birthday': false,
      });
      final service = ProfileService(firestore: firestore);

      final profiles =
          await service.getAllProfilesWithOwnStatus('calypso', 'member-1');
      final own = profiles.singleWhere((profile) => profile.id == 'member-1');
      final other = profiles.singleWhere((profile) => profile.id == 'member-2');

      expect(own.fullName, 'Alice Example');
      expect(own.birthDate, isNull);
      expect(own.birthMonth, 7);
      expect(own.birthDay, 7);
      expect(own.shareBirthday, isTrue);
      expect(own.membershipCategoryCode, 'membre_1ere');
      expect(other.birthDate, isNull);
      expect(other.birthMonth, 7);
      expect(other.birthDay, 7);
    });

    test('stale projected birthday is hidden for own and other opt-outs',
        () async {
      final firestore = FakeFirebaseFirestore();
      for (final memberId in ['member-1', 'member-2']) {
        await firestore.doc('clubs/calypso/member_directory/$memberId').set({
          'first_name': memberId,
          'share_birthday': false,
          'birth_month': 7,
          'birth_day': 7,
        });
      }
      final service = ProfileService(firestore: firestore);

      final profiles =
          await service.getAllProfilesWithOwnStatus('calypso', 'member-1');
      for (final profile in profiles) {
        expect(profile.shareBirthday, isFalse);
        expect(profile.birthMonth, isNull);
        expect(profile.birthDay, isNull);
      }
    });

    test('mobile and web share the callable contract and await completion',
        () async {
      final calls = <Map<String, dynamic>>[];
      var completed = false;
      final service = ProfileService(
        firestore: FakeFirebaseFirestore(),
        callableInvoker: (name, data) async {
          calls.add({'name': name, 'data': data});
          await Future<void>.delayed(Duration.zero);
          completed = true;
        },
      );

      await service.updateBirthdaySharing(
        'calypso',
        'member-1',
        shareBirthday: false,
      );

      expect(completed, isTrue);
      expect(calls, [
        {
          'name': 'updateBirthdaySharing',
          'data': {
            'clubId': 'calypso',
            'memberId': 'member-1',
            'shareBirthday': false,
          },
        },
      ]);
    });

    test('callable failures propagate so the UI cannot show success', () async {
      final service = ProfileService(
        firestore: FakeFirebaseFirestore(),
        callableInvoker: (_, __) async => throw StateError('rejected'),
      );

      await expectLater(
        service.updateBirthdaySharing(
          'calypso',
          'member-1',
          shareBirthday: true,
        ),
        throwsStateError,
      );
    });
  });
}
