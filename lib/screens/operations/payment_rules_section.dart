import 'package:flutter/material.dart';
import '../../config/app_colors.dart';

class PaymentRulesSection extends StatelessWidget {
  const PaymentRulesSection(
      {super.key,
      required this.paymentRequired,
      required this.allowedMethods,
      required this.confirmationPolicy,
      required this.deadlineDays,
      required this.autoCancelUnpaid,
      required this.onChanged});

  final bool paymentRequired;
  final Set<String> allowedMethods;
  final String confirmationPolicy;
  final int deadlineDays;
  final bool autoCancelUnpaid;
  final void Function(
      {bool? paymentRequired,
      Set<String>? allowedMethods,
      String? confirmationPolicy,
      int? deadlineDays,
      bool? autoCancelUnpaid}) onChanged;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.grey.shade200)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Row(children: [
            Icon(Icons.payment, color: AppColors.middenblauw),
            SizedBox(width: 8),
            Text('Règles de paiement',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold))
          ]),
          const SizedBox(height: 16),
          const Text('Paiement de l’activité',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          DropdownButtonFormField<bool>(
            value: paymentRequired,
            items: const [
              DropdownMenuItem(
                  value: false, child: Text('Aucun paiement requis')),
              DropdownMenuItem(value: true, child: Text('Paiement requis'))
            ],
            onChanged: (value) => onChanged(paymentRequired: value),
            decoration: const InputDecoration(border: OutlineInputBorder()),
          ),
          const SizedBox(height: 6),
          Text(
              paymentRequired
                  ? 'Choisissez les moyens proposés dans CalyMob.'
                  : 'Aucune étape de paiement ne sera affichée dans CalyMob.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
          if (paymentRequired) ...[
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              value: confirmationPolicy,
              items: const [
                DropdownMenuItem(
                    value: 'immediate', child: Text('Confirmation immédiate')),
                DropdownMenuItem(
                    value: 'after_payment',
                    child: Text('Après réception du paiement'))
              ],
              onChanged: (value) => onChanged(confirmationPolicy: value),
              decoration: const InputDecoration(
                  labelText: 'Validation de l’inscription',
                  border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            const Text('Moyens proposés',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            _method('qr_immediate', 'QR immédiat', Icons.qr_code_2),
            _method('qr_email', 'QR par email', Icons.email_outlined),
            _method('on_site', 'Sur place', Icons.store_outlined),
            if (confirmationPolicy == 'after_payment') ...[
              const SizedBox(height: 10),
              DropdownButtonFormField<int>(
                value: deadlineDays,
                items: const [1, 2, 3, 5, 7, 14]
                    .map((days) => DropdownMenuItem(
                        value: days,
                        child: Text('$days jour${days > 1 ? 's' : ''}')))
                    .toList(),
                onChanged: (value) => onChanged(deadlineDays: value),
                decoration: const InputDecoration(
                    labelText: 'Délai de paiement',
                    border: OutlineInputBorder()),
              ),
              CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: autoCancelUnpaid,
                  onChanged: (value) => onChanged(autoCancelUnpaid: value),
                  title: const Text('Annuler automatiquement si impayé',
                      style: TextStyle(fontSize: 13)),
                  controlAffinity: ListTileControlAffinity.leading),
            ],
          ],
        ]),
      );

  Widget _method(String id, String label, IconData icon) {
    final enabled = allowedMethods.contains(id);
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      secondary: Icon(icon, color: AppColors.middenblauw),
      title: Text(label, style: const TextStyle(fontSize: 14)),
      value: enabled,
      onChanged: (value) {
        final next = Set<String>.from(allowedMethods);
        value ? next.add(id) : next.remove(id);
        if (next.isNotEmpty) onChanged(allowedMethods: next);
      },
    );
  }
}
