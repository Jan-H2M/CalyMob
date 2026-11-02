import 'package:calymob/models/medical_certification.dart';
import 'package:calymob/models/member_profile.dart';
import 'package:calymob/utils/medical_validity.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final now = DateTime.parse('2026-11-02T10:00:00Z');
  final issued = DateTime.utc(2025, 2, 9);
  final approvedUntil = DateTime.utc(2027, 1, 30);

  test(
      'COM-156: explicit approved deadline matches CalyCompta, not issue + year',
      () {
    final result = MedicalValidity.evaluate(
      issuedOn: issued,
      validUntil: approvedUntil,
      now: now,
    );
    expect(result.expiresOn, approvedUntil);
    expect(result.status, MedicalValidityStatus.valid);
  });

  test(
      'member, scanner and approved certificate use the same administrative date',
      () {
    final profile = MemberProfile(
      id: 'fictional-com156',
      nom: 'FICTIF',
      prenom: 'Test',
      email: '',
      certificatMedicalDate: issued,
      certificatMedicalValidite: approvedUntil,
    );
    final cert = MedicalCertification(
      id: 'fictional-cert',
      memberId: profile.id,
      documentUrl: '',
      documentType: 'pdf',
      uploadedAt: DateTime.utc(2026, 5, 23),
      status: CertificateStatus.approved,
      validUntil: approvedUntil,
    ).withMemberDates({
      'certificat_medical_date': '2025-02-09',
      'certificat_medical_validite': '2027-01-30',
    });
    final fromCertificate = MedicalValidity.evaluate(
      issuedOn: cert.issuedOn,
      validUntil: cert.validUntil,
      needsReview: cert.datesNeedReview,
      approved: cert.status == CertificateStatus.approved,
      now: now,
    );
    expect(profile.medicalValidityAt(now).status, MedicalValidityStatus.valid);
    expect(fromCertificate.status, profile.medicalValidityAt(now).status);
    expect(fromCertificate.expiresOn, approvedUntil);
    expect(profile.medicalValidityAt(now).expiresOn, approvedUntil);
  });

  test('explicit deadline remains authoritative through its last Brussels day',
      () {
    final lastMinute = MedicalValidity.evaluate(
      issuedOn: issued,
      validUntil: approvedUntil,
      now: DateTime.parse('2027-01-30T22:59:59Z'),
    );
    expect(lastMinute.expiresOn, approvedUntil);
    expect(lastMinute.status, MedicalValidityStatus.expiringSoon);
    expect(lastMinute.daysRemaining, 0);
    final nextDay = MedicalValidity.evaluate(
      issuedOn: issued,
      validUntil: approvedUntil,
      now: DateTime.parse('2027-01-30T23:00:00Z'),
    );
    expect(nextDay.status, MedicalValidityStatus.expired);
    expect(nextDay.daysRemaining, -1);
  });
}
