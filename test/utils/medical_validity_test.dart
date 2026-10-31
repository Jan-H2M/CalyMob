import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/utils/medical_validity.dart';
import 'package:calymob/models/medical_certification.dart';
import 'package:calymob/models/member_profile.dart';

void main() {
  final now = DateTime.parse('2026-10-31T12:00:00Z');
  test('calendar year anniversary, not 365 days or end of year', () {
    final r = MedicalValidity.evaluate(
        issuedOn: DateTime(2024, 3, 1),
        now: DateTime.parse('2025-02-01T12:00Z'));
    expect(r.expiresOn, DateTime.utc(2025, 3, 1));
    expect(r.status, MedicalValidityStatus.expiringSoon);
  });
  test('29 February clamps to next 28 February', () {
    expect(
        MedicalValidity.evaluate(
                issuedOn: DateTime(2024, 2, 29),
                now: DateTime.parse('2025-02-28T22:59:00Z'))
            .daysRemaining,
        0);
  });
  test('inclusive end day and Brussels midnight, not truncated negative hours',
      () {
    final expiry = DateTime(2026, 10, 31);
    expect(
        MedicalValidity.evaluate(
                validUntil: expiry, now: DateTime.parse('2026-10-31T22:59:59Z'))
            .status,
        MedicalValidityStatus.expiringSoon);
    final next = MedicalValidity.evaluate(
        validUntil: expiry, now: DateTime.parse('2026-10-31T23:00:00Z'));
    expect(next.status, MedicalValidityStatus.expired);
    expect(next.daysRemaining, -1);
  });
  test('summer time and 30/31 day boundaries', () {
    expect(
        MedicalValidity.evaluate(
                validUntil: DateTime(2026, 7, 31),
                now: DateTime.parse('2026-06-30T22:00:00Z'))
            .daysRemaining,
        30);
    expect(
        MedicalValidity.evaluate(
                validUntil: DateTime(2026, 7, 31),
                now: DateTime.parse('2026-06-29T22:00:00Z'))
            .status,
        MedicalValidityStatus.valid);
  });
  test('explicit earlier deadline is never extended', () {
    expect(
        MedicalValidity.evaluate(
                issuedOn: DateTime(2026, 1, 1),
                validUntil: DateTime(2026, 11, 1),
                now: now)
            .expiresOn,
        DateTime.utc(2026, 11, 1));
    expect(
        MedicalValidity.evaluate(
                issuedOn: DateTime(2025, 11, 1),
                validUntil: DateTime(2030, 1, 1),
                now: now)
            .expiresOn,
        DateTime.utc(2026, 11, 1));
  });
  test('missing, future issue, contradictory or unapproved stays unknown', () {
    expect(MedicalValidity.evaluate(now: now).status,
        MedicalValidityStatus.unknown);
    expect(MedicalValidity.evaluate(issuedOn: DateTime(2027), now: now).status,
        MedicalValidityStatus.unknown);
    expect(
        MedicalValidity.evaluate(
                issuedOn: DateTime(2026), validUntil: DateTime(2025), now: now)
            .status,
        MedicalValidityStatus.unknown);
    expect(
        MedicalValidity.evaluate(
                validUntil: DateTime(2027), approved: false, now: now)
            .status,
        MedicalValidityStatus.unknown);
  });
  test('date-only validation and timestamp normalization', () {
    expect(parseMedicalDate('2026-02-30'), isNull);
    expect(parseMedicalDate('bad'), isNull);
    expect(parseMedicalDate('07/08/2099'), DateTime.utc(2099, 8, 7));
    expect(parseMedicalDate('31/02/2026'), isNull);
    expect(parseMedicalDate(123), isNull);
    expect(parseMedicalDate('2026-10-31'), DateTime.utc(2026, 10, 31));
    expect(
        parseMedicalDate(
            Timestamp.fromDate(DateTime.parse('2026-06-30T22:00Z'))),
        DateTime.utc(2026, 7, 1));
  });
  test('approved but undated certificate is not valid', () {
    final cert = MedicalCertification(
        id: 'fictional',
        memberId: 'dev',
        documentUrl: '',
        documentType: 'pdf',
        uploadedAt: now,
        status: CertificateStatus.approved);
    expect(cert.isValid, isFalse);
    expect(cert.canPresent, isFalse);
  });
  test('copy preserves annual source date', () {
    final p = MemberProfile(
        id: 'dev',
        nom: 'FICTIF',
        prenom: 'A',
        email: '',
        certificatMedicalDate: DateTime(2025, 12, 1),
        certificatMedicalValidite: DateTime(2030));
    expect(p.copyWith().certificatMedicalDate, p.certificatMedicalDate);
  });
  test('summary joins only on matching approved expiry, never upload date', () {
    final cert = MedicalCertification(
        id: 'dev',
        memberId: 'dev',
        documentUrl: '',
        documentType: 'pdf',
        uploadedAt: DateTime(2026),
        status: CertificateStatus.approved,
        validUntil: DateTime(2030));
    final joined = cert.withMemberDates({
      'certificat_medical_date': '2025-11-01',
      'certificat_medical_validite': '2030-01-01'
    });
    expect(joined.validity.expiresOn, DateTime.utc(2026, 11, 1));
    expect(
        cert.withMemberDates({
          'certificat_medical_date': '2025-11-01',
          'certificat_medical_validite': '2026-11-01'
        }).datesNeedReview,
        isTrue);
    expect(
        cert.withMemberDates(
            {'certificat_medical_date': '2025-11-01'}).datesNeedReview,
        isTrue);
    expect(
        cert.withMemberDates(
            {'certificat_medical_date': 'bad'}).datesNeedReview,
        isTrue);
    expect(cert.withMemberDates({}).issuedOn, isNull);
  });
}
