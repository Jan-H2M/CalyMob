import 'package:flutter/material.dart';
import 'package:calymob/widgets/medical_expiry_notice.dart';

class FictionalMedicalExpiry extends StatefulWidget {
  const FictionalMedicalExpiry({super.key});
  @override
  State<FictionalMedicalExpiry> createState() => _FictionalMedicalExpiryState();
}

class _FictionalMedicalExpiryState extends State<FictionalMedicalExpiry> {
  String selected = 'Bientôt';
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        const Text(
            'AV-MED-001 · Aucun certificat réel. Horloge fictive : 31/10/2026.'),
        DropdownButton<String>(
            value: selected,
            items: ['Valide', 'Bientôt', 'Expiré', 'Inconnu']
                .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                .toList(),
            onChanged: (s) => setState(() => selected = s!)),
        MedicalExpiryNotice(
            now: DateTime.parse('2026-10-31T12:00Z'),
            issuedOn: selected == 'Inconnu'
                ? null
                : DateTime(
                    2025,
                    selected == 'Expiré'
                        ? 10
                        : selected == 'Valide'
                            ? 12
                            : 11,
                    5),
            onOpen: () => showDialog<void>(
                context: context,
                builder: (c) => AlertDialog(
                        title: const Text('Renouvellement FICTIF'),
                        content: const Text(
                            'Aucun téléversement ni envoi de notification.'),
                        actions: [
                          TextButton(
                              onPressed: () => Navigator.pop(c),
                              child: const Text('Fermer'))
                        ]))),
        const Text(
            'Les reminders serveur sont testés séparément avec un expéditeur simulé ; aucun push réel.'),
      ]);
}
