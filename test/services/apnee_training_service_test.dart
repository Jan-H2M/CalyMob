import 'package:calymob/services/apnee_training_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
      'source catalogue has 79 stable separate requirements and no invented protocol',
      () async {
    final catalog = await ApneeTrainingService.catalog();
    final rows = (catalog['requirements'] as List).cast<ApneeRow>();
    expect(rows.length, 79);
    expect(rows.where((r) => r['track'] == 'apnee.a1').length, 38);
    expect(rows.where((r) => r['track'] == 'apnee.a2').length, 41);
    expect(rows.map((r) => r['key']).toSet().length, 79);
    expect(rows.any((r) => r.containsKey('protocol')), false);
    expect(apneeTrackName('unsupported'), 'Trajet apnée inconnu');
  });
  test(
      'own and pool queries filter records rather than leaking another dossier',
      () async {
    final db = FakeFirebaseFirestore();
    final service = ApneeTrainingService(firestore: db);
    await db
        .doc('clubs/qa/apnee_enrollments/student')
        .set({'member_id': 'student'});
    await db
        .doc('clubs/qa/apnee_enrollments/other')
        .set({'member_id': 'other'});
    expect(
        (await service
                .watch('qa', 'apnee_enrollments', memberId: 'student')
                .first)
            .map((r) => r['id']),
        ['student']);
    await db
        .doc('clubs/qa/apnee_enrollments/student/requirements/pool')
        .set({'setting': 'pool'});
    await db
        .doc('clubs/qa/apnee_enrollments/student/requirements/depth')
        .set({'setting': 'depth'});
    expect(
        (await service
                .watch('qa', 'apnee_enrollments/student/requirements',
                    poolOnly: true)
                .first)
            .map((r) => r['id']),
        ['pool']);
  });
  test(
      'canonical date and trusted QR receipt are joined without production writes',
      () async {
    final db = FakeFirebaseFirestore();
    final service = ApneeTrainingService(firestore: db);
    final session = db.doc('clubs/qa/piscine_sessions/session');
    final date = Timestamp.fromDate(DateTime(2026, 1, 6));
    final scan = Timestamp.fromDate(DateTime(2026, 1, 6, 20));
    final receipt = {
      'version': 1,
      'memberId': 'student',
      'sessionId': 'session',
      'scannerUid': 'monitor',
      'scannedAt': scan
    };
    await session.set({'date': date});
    await db.doc('clubs/qa/apnee_participations/row').set({
      'member_id': 'student',
      'session_id': 'session',
      'session_date': Timestamp(0, 0)
    });
    await session.collection('attendees').doc('student').set(
        {'memberId': 'student', 'scannedAt': scan, 'scannedBy': 'monitor'});
    await session.collection('qr_scan_receipts').doc('student').set(receipt);
    var row = (await service.history('qa', 'student').first).single;
    expect(row['session_date'], date);
    expect(row['qr_verified'], false);
    await session
        .collection('attendees')
        .doc('student')
        .update({'qrVerified': receipt});
    row = (await service.history('qa', 'student').first).single;
    expect(row['qr_verified'], true);
    await session.update({'date': Timestamp(10, 0)});
    expect(
        (await service.history('qa', 'student').first).single['session_date'],
        Timestamp(10, 0));
    expect(
        apneeQrVerified({'memberId': 'other', 'qrVerified': receipt}, receipt,
            'student', 'session'),
        false);
  });
}
