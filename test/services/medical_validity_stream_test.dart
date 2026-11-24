import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions_platform_interface/cloud_functions_platform_interface.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/models/medical_certification.dart';
import 'package:calymob/services/medical_certification_service.dart';

class _CertificateFunctions extends FirebaseFunctionsPlatform {
  _CertificateFunctions(FirebaseApp? app, String region, this.respond)
      : super(app, region);

  final Future<dynamic> Function(String, dynamic) respond;

  @override
  FirebaseFunctionsPlatform delegateFor({
    FirebaseApp? app,
    required String region,
  }) =>
      _CertificateFunctions(app, region, respond);

  @override
  HttpsCallablePlatform httpsCallable(
    String? origin,
    String name,
    HttpsCallableOptions options,
  ) =>
      _CertificateCallable(this, origin, name, options);
}

class _CertificateCallable extends HttpsCallablePlatform {
  _CertificateCallable(
    this.platform,
    String? origin,
    String name,
    HttpsCallableOptions options,
  ) : super(platform, origin, name, options, null);

  final _CertificateFunctions platform;

  @override
  Future<dynamic> call([dynamic parameters]) =>
      platform.respond(name!, parameters);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('legacy certificate uses its stored URL without a callable', () async {
    final db = FakeFirebaseFirestore();
    final ref = db.doc('clubs/club/members/member/medical_certificates/legacy');
    await ref.set({'document_url': 'https://example.test/legacy'});
    final cert = MedicalCertification.fromFirestore(await ref.get());
    final service = MedicalCertificationService(firestore: db);
    expect(cert.toFirestore().containsKey('document_path'), isFalse);
    expect(await service.getDocumentUrl('club', cert),
        'https://example.test/legacy');
  });

  test('certificate path survives date projection and selects the signed URL',
      () async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    final originalPlatform = FirebaseFunctionsPlatform.instance;
    addTearDown(() => FirebaseFunctionsPlatform.instance = originalPlatform);
    var reject = false;
    FirebaseFunctionsPlatform.instance = _CertificateFunctions(
      null,
      'europe-west1',
      (name, params) async {
        expect(name, 'getMedicalCertificateUrl');
        expect(params, {
          'clubId': 'club',
          'memberId': 'member',
          'certificateId': 'new-cert',
        });
        if (reject) throw StateError('Permission denied');
        return {'url': 'https://example.test/signed'};
      },
    );

    final db = FakeFirebaseFirestore();
    final ref =
        db.doc('clubs/club/members/member/medical_certificates/new-cert');
    const path =
        'clubs/club/members/member/medical_certificates/certificat.pdf';
    await ref.set({
      'member_id': 'member',
      'status': 'approved',
      'document_url': 'https://example.test/legacy',
      'document_path': path,
      'valid_until': '2027-01-30',
    });
    final cert = MedicalCertification.fromFirestore(await ref.get())
        .withMemberDates({'certificat_medical_validite': '2027-01-30'});
    expect(cert.toFirestore()['document_path'], path);
    final service = MedicalCertificationService(firestore: db);
    expect(await service.getDocumentUrl('club', cert),
        'https://example.test/signed');
    reject = true;
    await expectLater(service.getDocumentUrl('club', cert), throwsStateError);
  });

  test(
      'COM-156 getter and stream preserve the approved web date without writes',
      () async {
    final db = FakeFirebaseFirestore();
    final member = db.doc('clubs/dev-fictional/members/com156-fictional');
    final certRef =
        member.collection('medical_certificates').doc('fictional-cert');
    await member.set({
      'certificat_medical_date': Timestamp.fromDate(DateTime.utc(2025, 2, 9)),
      'certificat_medical_validite':
          Timestamp.fromDate(DateTime.utc(2027, 1, 30)),
    });
    await certRef.set({
      'member_id': 'com156-fictional',
      'document_url': '',
      'document_type': 'pdf',
      'uploaded_at': Timestamp.fromDate(DateTime.utc(2026, 5, 23)),
      'status': 'approved',
      'valid_until': Timestamp.fromDate(DateTime.utc(2027, 1, 30)),
    });
    final beforeMember = (await member.get()).data();
    final beforeCert = (await certRef.get()).data();
    final service = MedicalCertificationService(firestore: db);
    final loaded = await service.getCurrentCertification(
        'dev-fictional', 'com156-fictional');
    final streamed = await service
        .watchCurrentCertification('dev-fictional', 'com156-fictional')
        .first;
    for (final cert in [loaded, streamed]) {
      expect(cert, isNotNull);
      expect(cert!.validity.expiresOn, DateTime.utc(2027, 1, 30));
      expect(cert.datesNeedReview, isFalse);
    }
    expect((await member.get()).data(), beforeMember);
    expect((await certRef.get()).data(), beforeCert);
  });

  test(
      'open certificate respects explicit deadline, clearing and renewal without certificate writes',
      () async {
    final db = FakeFirebaseFirestore();
    final member = db.doc('clubs/dev-fictional/members/dev-member');
    await member.set({
      'certificat_medical_date': '2025-11-01',
      'certificat_medical_validite': '2030-01-01'
    });
    await member.collection('medical_certificates').doc('dev-cert').set({
      'member_id': 'dev-member',
      'document_url': '',
      'document_type': 'pdf',
      'uploaded_at': Timestamp.fromDate(DateTime(2026)),
      'status': 'approved',
      'valid_until': Timestamp.fromDate(DateTime.utc(2030)),
    });
    final stream = MedicalCertificationService(firestore: db)
        .watchCurrentCertification('dev-fictional', 'dev-member');
    final values = StreamIterator<MedicalCertification?>(stream);
    expect(await values.moveNext().timeout(const Duration(seconds: 2)), isTrue);
    expect(values.current!.validity.expiresOn, DateTime.utc(2030, 1, 1));
    await member.update({'certificat_medical_date': '2025-12-01'});
    expect(await values.moveNext().timeout(const Duration(seconds: 2)), isTrue);
    expect(values.current!.validity.expiresOn, DateTime.utc(2030, 1, 1));
    await member.update(
        {'certificat_medical_date': null, 'certificat_medical_validite': null});
    expect(await values.moveNext().timeout(const Duration(seconds: 2)), isTrue);
    expect(values.current!.canPresent, isFalse);
    expect(values.current!.datesNeedReview, isTrue);
    await member.update({
      'certificat_medical_date': '2026-01-01',
      'certificat_medical_validite': '2027-01-01'
    });
    expect(await values.moveNext().timeout(const Duration(seconds: 2)), isTrue);
    expect(values.current!.datesNeedReview,
        isTrue); // Old file cannot certify a new summary.
    await values.cancel();
  });
}
