import 'package:calymob/services/scuba_enrollment_service.dart';
import 'package:calymob/models/member_profile.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final profile = MemberProfile(
      id: 'student', nom: 'Synthétique', prenom: 'Élève', email: '');
  Future<FakeFirebaseFirestore> fixture({String role = 'admin'}) async {
    final db = FakeFirebaseFirestore();
    await db
        .doc('clubs/qa/members/actor')
        .set({'app_role': role, 'member_status': 'active'});
    await db.doc('clubs/qa/members/student').set({
      'formation_active': false,
      'plongeur_code': '2',
      'unrelated': 'retained'
    });
    await db
        .doc('clubs/qa/member_directory/student')
        .set({'member_status': 'active'});
    return db;
  }

  test(
      'enrollment only changes administrative training fields with atomic before/after audit',
      () async {
    final db = await fixture();
    await ScubaEnrollmentService(firestore: db, uid: () => 'actor')
        .save('qa', profile, active: true, target: '3*');
    final member = (await db.doc('clubs/qa/members/student').get()).data()!;
    expect(member['plongeur_code'], '2');
    expect(member['unrelated'], 'retained');
    expect(member['target_formation_level'], '3*');
    expect(member['formation_active'], true);
    final audit =
        (await db.collection('clubs/qa/audit_logs').get()).docs.single.data();
    expect(audit['actor_uid'], 'actor');
    expect(audit['before']['formation_active'], false);
    expect(audit['after']['formation_active'], true);
  });
  test('ordinary monitor and stale profile cannot alter enrollment or audit',
      () async {
    final db = await fixture(role: 'user');
    await expectLater(
        ScubaEnrollmentService(firestore: db, uid: () => 'actor')
            .save('qa', profile, active: true, target: '3*'),
        throwsStateError);
    expect((await db.collection('clubs/qa/audit_logs').get()).docs, isEmpty);
    final stale = await fixture();
    await stale
        .doc('clubs/qa/members/student')
        .update({'formation_active': true});
    await expectLater(
        ScubaEnrollmentService(firestore: stale, uid: () => 'actor')
            .save('qa', profile, active: true, target: '3*'),
        throwsStateError);
    expect((await stale.collection('clubs/qa/audit_logs').get()).docs, isEmpty);
  });
}
