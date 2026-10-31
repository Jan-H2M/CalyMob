import 'package:flutter/material.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:calymob/screens/stock/material_returns_screen.dart';
import 'package:calymob/services/material_return_service.dart';

class FictionalLoanLiability extends StatefulWidget {
  const FictionalLoanLiability({super.key});
  @override
  State<FictionalLoanLiability> createState() => _FictionalLoanLiabilityState();
}

class _FictionalLoanLiabilityState extends State<FictionalLoanLiability> {
  final db = FakeFirebaseFirestore();
  String result = 'Aucune demande enregistrée.';
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        const Text(
            'AV-LOAN-001 · Membre et matériel FICTIFS · Fake Firestore en mémoire uniquement.'),
        ElevatedButton(
            onPressed: () async {
              await showMaterialLoanRequestForm(
                  context: context,
                  service: MaterialReturnService(firestore: db),
                  clubId: 'dev-fictional',
                  memberId: 'dev-borrower',
                  memberName: 'Membre FICTIF',
                  memberEmail: '');
              final requests = await db
                  .collection('clubs/dev-fictional/inventory_loan_requests')
                  .get();
              if (!mounted) return;
              setState(() => result = requests.docs.isEmpty
                  ? 'Aucune demande enregistrée.'
                  : requests.docs
                      .map((d) =>
                          '${d.data()['notes']} · ${d.data()['liability_acceptance']}')
                      .join('\n'));
            },
            child: const Text('Ouvrir la vraie demande FICTIVE')),
        SelectableText(result),
        const Text(
            'Les règles réelles sont testées séparément avec un projet demo et des identités fictives. Aucun e-mail/paiement.'),
      ]);
}
