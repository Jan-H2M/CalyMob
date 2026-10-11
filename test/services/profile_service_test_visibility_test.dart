import 'package:calymob/services/profile_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('test profiles never reappear through list, search or own status join',
      () async {
    final db = FakeFirebaseFirestore();
    final service = ProfileService(firestore: db);
    for (final flag in [
      {'is_test_account': true},
      {'exclude_from_directory': true},
      {'isTestUser': true},
      {
        'metadata': {'isTestUser': true}
      },
    ]) {
      await db.doc('clubs/calypso/member_directory/qa').set({
        'first_name': 'QA',
        'last_name': 'Hidden',
        ...flag,
      });
      await db.doc('clubs/calypso/members/qa').set({
        'first_name': 'QA',
        'last_name': 'Private',
        ...flag,
      });
      await db.doc('clubs/calypso/member_directory/real').set({
        'first_name': 'Test',
        'last_name': 'Real Member',
      });
      expect(
          (await service.getAllProfiles('calypso')).map((p) => p.id), ['real']);
      expect(await service.searchProfiles('calypso', 'Hidden'), isEmpty);
      expect(
          (await service.getAllProfilesWithOwnStatus('calypso', 'qa'))
              .map((p) => p.id),
          ['real']);
      expect(await service.getDirectoryProfile('calypso', 'qa'), isNull);
      expect(await service.getProfile('calypso', 'qa'), isNotNull);
    }
  });
}
