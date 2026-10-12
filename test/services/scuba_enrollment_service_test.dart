import 'package:calymob/services/scuba_enrollment_service.dart';
import 'package:calymob/services/formation_enrollment_service.dart';
import 'package:calymob/models/member_profile.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
      'sends displayed global revision to server; never writes member or actor/audit',
      () async {
    final db = FakeFirebaseFirestore();
    Map<String, dynamic>? payload;
    await ScubaEnrollmentService(
        enrollment: FormationEnrollmentService(
            firestore: db,
            invoke: (value) async {
              payload = value;
            })).save(
        'qa',
        MemberProfile(
            id: 'student',
            nom: '',
            prenom: '',
            email: '',
            formationRevision: 9),
        active: true,
        target: '3*');
    expect(payload, containsPair('expectedRevision', 9));
    expect(payload, containsPair('track', 'scuba'));
    expect(payload, containsPair('targetLevel', '3*'));
    expect(payload!.containsKey('actor_uid'), false);
    expect((await db.collection('clubs/qa/members').get()).docs, isEmpty);
    expect((await db.collection('clubs/qa/audit_logs').get()).docs, isEmpty);
  });
  test('server denial propagates without optimistic success', () async {
    await expectLater(
        ScubaEnrollmentService(
            enrollment: FormationEnrollmentService(
                firestore: FakeFirebaseFirestore(),
                invoke: (_) async {
                  throw StateError('stale');
                })).save(
            'qa', MemberProfile(id: 'student', nom: '', prenom: '', email: ''),
            active: true, target: '3*'),
        throwsStateError);
  });
}
