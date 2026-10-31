import 'package:flutter/material.dart';
import '../models/loan_liability_acceptance.dart';

class LoanLiabilityConsent extends StatelessWidget {
  final bool accepted;
  final bool enabled;
  final ValueChanged<bool> onChanged;
  const LoanLiabilityConsent(
      {super.key,
      required this.accepted,
      required this.onChanged,
      this.enabled = true});
  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Responsabilité financière du membre emprunteur',
            style: TextStyle(fontWeight: FontWeight.bold)),
        const Text(loanLiabilityTermsText),
        const Text('Version : $loanLiabilityTermsVersion',
            style: TextStyle(fontSize: 11)),
        CheckboxListTile(
            key: const Key('loan-liability-checkbox'),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: accepted,
            onChanged: enabled ? (v) => onChanged(v == true) : null,
            title: const Text(
                'Je suis le membre emprunteur et j’accepte ces conditions.'),
            subtitle: const Text(
                'Obligatoire. Une personne ne peut pas accepter à ma place.')),
      ]);
}
