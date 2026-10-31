import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/widgets/medical_expiry_notice.dart';
import 'package:calymob/widgets/certification_status_badge.dart';
import 'package:calymob/models/medical_certification.dart';
import 'package:calymob/models/member_profile.dart';
import 'package:calymob/screens/scanner/member_validation_card.dart';

void main() {
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
                validUntil: DateTime(2030),
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
