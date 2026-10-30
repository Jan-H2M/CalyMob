import 'package:flutter/material.dart';

/// A manual transfer and an emailed EPC QR use the same bank-transfer rail.
/// Selecting an option only returns a choice; it never records a payment.
class EventPaymentOptionsDialog extends StatelessWidget {
  final double amount;
  final List<String> allowedPaymentMethods;
  final String? installmentLabel;

  const EventPaymentOptionsDialog({
    super.key,
    required this.amount,
    required this.allowedPaymentMethods,
    this.installmentLabel,
  });

  @override
  Widget build(BuildContext context) {
    final bankTransferAllowed = allowedPaymentMethods.any(
      (method) => method == 'qr_immediate' || method == 'qr_email',
    );
    Widget option(String value, String label, IconData icon) => Padding(
          padding: const EdgeInsets.only(top: 12),
          child: SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => Navigator.pop(context, value),
              icon: Icon(icon),
              label: Text(label, textAlign: TextAlign.center),
              style:
                  OutlinedButton.styleFrom(padding: const EdgeInsets.all(16)),
            ),
          ),
        );
    return AlertDialog(
      title: const Text('Inscription réussie !'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${installmentLabel ?? 'Montant à payer'} : ${amount.toStringAsFixed(2)} €',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            if (bankTransferAllowed) ...[
              option(
                'bank_transfer',
                'Virement dans mon app bancaire',
                Icons.account_balance_outlined,
              ),
              const SizedBox(height: 6),
              const Text(
                'Afficher et copier l’IBAN, le montant et la communication libre. '
                'Ouvrez ensuite vous-même votre application bancaire.',
              ),
            ],
            if (allowedPaymentMethods.contains('qr_immediate'))
              option(
                'qr_immediate',
                'Afficher le QR de paiement',
                Icons.qr_code_2,
              ),
            if (allowedPaymentMethods.contains('qr_email'))
              option(
                'qr_email',
                'Recevoir le QR par email',
                Icons.email_outlined,
              ),
            if (allowedPaymentMethods.contains('on_site'))
              option('on_site', 'Payer sur place', Icons.schedule),
            if (!bankTransferAllowed &&
                !allowedPaymentMethods.contains('on_site')) ...[
              const SizedBox(height: 12),
              const Text(
                'Aucun mode de paiement disponible. Contactez l’organisateur.',
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Fermer'),
        ),
      ],
    );
  }
}
