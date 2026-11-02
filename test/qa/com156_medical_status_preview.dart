// In-memory COM-156 QA only. No Firebase initialization, credentials or writes.
import 'package:calymob/models/medical_certification.dart';
import 'package:calymob/models/member_profile.dart';
import 'package:calymob/screens/scanner/member_validation_card.dart';
import 'package:calymob/widgets/certification_status_badge.dart';
import 'package:calymob/widgets/medical_expiry_notice.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  if (Uri.base.host != '127.0.0.1' ||
      Uri.base.port != 7498 ||
      Firebase.apps.isNotEmpty) {
    throw StateError('COM-156 QA is local-only and refuses Firebase.');
  }
  WidgetsBinding.instance.ensureSemantics();
  runApp(const MaterialApp(home: _MedicalParityPreview()));
}

class _MedicalParityPreview extends StatefulWidget {
  const _MedicalParityPreview();
  @override
  State<_MedicalParityPreview> createState() => _MedicalParityPreviewState();
}

class _MedicalParityPreviewState extends State<_MedicalParityPreview> {
  String selected = 'Date approuvée';
  @override
  Widget build(BuildContext context) {
    final now = DateTime.parse('2026-11-02T10:00:00Z');
    final until = switch (selected) {
      'Date approuvée' => DateTime.utc(2027, 1, 30),
      'Bientôt' => DateTime.utc(2026, 11, 20),
      'Expiré' => DateTime.utc(2026, 10, 30),
      _ => null,
    };
    final issue = until == null ? null : DateTime.utc(2025, 2, 9);
    final member = MemberProfile(
        id: 'com156-fictional',
        prenom: 'Test',
        nom: 'FICTIF',
        email: '',
        certificatMedicalDate: issue,
        certificatMedicalValidite: until);
    final cert = MedicalCertification(
        id: 'fictional-cert',
        memberId: member.id,
        documentUrl: '',
        documentType: 'pdf',
        uploadedAt: DateTime.utc(2026, 5, 23),
        status: CertificateStatus.approved,
        issuedOn: issue,
        validUntil: until);
    return Scaffold(
        appBar: AppBar(title: const Text('COM-156 · comparaison fictive')),
        body: ListView(padding: const EdgeInsets.all(24), children: [
          const Text(
              'Aucune connexion à Firebase · aucune donnée réelle · aucune écriture'),
          const Text(
              'Horloge de contrôle du scanner et du rappel : 02/11/2026.'),
          DropdownButton<String>(
              value: selected,
              items: ['Date approuvée', 'Bientôt', 'Expiré', 'À vérifier']
                  .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                  .toList(),
              onChanged: (s) => setState(() => selected = s!)),
          Card(
              child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                            'Référence CalyCompta — données fictives approuvées'),
                        Text(until == null
                            ? 'Date non confirmée'
                            : 'Date explicite : ${until.day.toString().padLeft(2, '0')}/${until.month.toString().padLeft(2, '0')}/${until.year}'),
                        if (issue != null)
                          const Text('Ancienne date d’édition : 09/02/2025'),
                        const SizedBox(height: 16),
                        const Text(
                            'CalyMob — véritable badge de l’application'),
                        CertificationStatusBadge(certification: cert),
                      ]))),
          MemberValidationCard(member: member, now: now),
          MedicalExpiryNotice(issuedOn: issue, validUntil: until, now: now),
        ]));
  }
}
