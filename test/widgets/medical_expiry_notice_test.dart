import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/widgets/medical_expiry_notice.dart';
import 'package:calymob/widgets/certification_status_badge.dart';
import 'package:calymob/models/medical_certification.dart';
import 'package:calymob/models/member_profile.dart';
import 'package:calymob/screens/scanner/member_validation_card.dart';

void main() {
  testWidgets(
      'COM-156 approved official date is shown without a false expiry warning',
      (t) async {
    final now = DateTime.parse('2026-11-02T10:00:00Z');
    final member = MemberProfile(
      id: 'com156-fictional',
      prenom: 'Test',
      nom: 'FICTIF',
      email: '',
      certificatMedicalDate: DateTime.utc(2025, 2, 9),
      certificatMedicalValidite: DateTime.utc(2027, 1, 30),
    );
    t.view.physicalSize = const Size(1200, 1000);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Column(children: [
      MemberValidationCard(member: member, now: now),
      MedicalExpiryNotice(
          issuedOn: member.certificatMedicalDate,
          validUntil: member.certificatMedicalValidite,
          now: now),
    ]))));
    expect(find.text('Valide'), findsOneWidget);
    expect(member.medicalValidityAt(now).expiresOn, DateTime.utc(2027, 1, 30));
    expect(find.textContaining('échéance dépassée'), findsNothing);
    expect(find.textContaining('expire bientôt'), findsNothing);
    expect(find.textContaining('09/02/2026'), findsNothing);
  });

  testWidgets(
      'certificate badge respects the approved deadline despite an old issue date',
      (t) async {
    // Relative dates keep this visual test independent of the runner's clock.
    final today = DateTime.now();
    final until = DateTime.utc(today.year + 2, 1, 30);
    final cert = MedicalCertification(
      id: 'com156-fictional',
      memberId: 'fictional',
      documentUrl: '',
      documentType: 'pdf',
      uploadedAt: DateTime.utc(today.year),
      status: CertificateStatus.approved,
      issuedOn: DateTime.utc(today.year - 2, 2, 9),
      validUntil: until,
    );
    await t.pumpWidget(MaterialApp(
        home: Scaffold(body: CertificationStatusBadge(certification: cert))));
    expect(find.text('Valide'), findsOneWidget);
    expect(find.text('Expiré'), findsNothing);
    expect(find.textContaining('30/01/${until.year}'), findsOneWidget);
  });

  testWidgets(
      'scanner text shares medical calendar day at late night and next Brussels day',
      (t) async {
    t.view.physicalSize = const Size(1200, 1000);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    final member = MemberProfile(
        id: 'dev',
        prenom: 'A',
        nom: 'FICTIF',
        email: '',
        certificatMedicalValidite: DateTime.utc(2026, 10, 31));
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: MemberValidationCard(
                member: member, now: DateTime.parse('2026-10-31T22:59:00Z')))));
    expect(find.text('Expire aujourd’hui'), findsOneWidget);
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: MemberValidationCard(
                member: member, now: DateTime.parse('2026-10-31T23:30:00Z')))));
    expect(find.text('Expiré depuis 1 jour'), findsOneWidget);
    expect(find.text('Expiré depuis 0 jour'), findsNothing);
  });
  testWidgets('visible annual warning and renewal action', (t) async {
    var opened = false;
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: MedicalExpiryNotice(
                issuedOn: DateTime(2025, 11, 5),
                now: DateTime.parse('2026-10-31T12:00Z'),
                onOpen: () => opened = true))));
    expect(find.textContaining('expire bientôt'), findsOneWidget);
    expect(find.textContaining('05/11/2026'), findsOneWidget);
    await t.tap(find.byType(ListTile));
    expect(opened, isTrue);
  });
  testWidgets('expired, unknown and valid do not claim clinical fitness',
      (t) async {
    for (final (expiry, label) in [
      (DateTime(2026, 10, 30), 'échéance dépassée'),
      (null, 'validité à vérifier')
    ]) {
      await t.pumpWidget(MaterialApp(
          home: Scaffold(
              body: MedicalExpiryNotice(
                  validUntil: expiry,
                  now: DateTime.parse('2026-10-31T12:00Z')))));
      expect(find.textContaining(label), findsOneWidget);
      expect(find.textContaining('inapte'), findsNothing);
    }
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: MedicalExpiryNotice(
                validUntil: DateTime(2027, 5, 1),
                now: DateTime.parse('2026-10-31T12:00Z')))));
    expect(find.byType(ListTile), findsNothing);
  });
  testWidgets('approved without date badge must not show Valide', (t) async {
    await t.pumpWidget(MaterialApp(
        home: CertificationStatusBadge(
            certification: MedicalCertification(
                id: 'dev',
                memberId: 'dev',
                documentUrl: '',
                documentType: 'pdf',
                uploadedAt: DateTime(2026),
                status: CertificateStatus.approved))));
    expect(find.text('Validité à vérifier'), findsOneWidget);
    expect(find.text('Valide'), findsNothing);
  });
}
