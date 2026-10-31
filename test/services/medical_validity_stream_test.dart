import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/models/medical_certification.dart';
import 'package:calymob/services/medical_certification_service.dart';

void main() {
  test(
      'open certificate reacts to summary correction, clearing and renewal without certificate writes',
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
    expect(values.current!.validity.expiresOn, DateTime.utc(2026, 11, 1));
    await member.update({'certificat_medical_date': '2025-12-01'});
    expect(await values.moveNext().timeout(const Duration(seconds: 2)), isTrue);
    expect(values.current!.validity.expiresOn, DateTime.utc(2026, 12, 1));
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
