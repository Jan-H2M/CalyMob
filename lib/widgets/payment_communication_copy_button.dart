import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Explicit copy action shared by every bank-transfer payment flow.
class PaymentCommunicationCopyButton extends StatelessWidget {
  final String communication;
  final VoidCallback? onCopied;

  const PaymentCommunicationCopyButton({
    super.key,
    required this.communication,
    this.onCopied,
  });

  Future<void> _copy(BuildContext context) async {
    try {
      await Clipboard.setData(ClipboardData(text: communication));
      if (!context.mounted) return;
      onCopied?.call();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Communication copiée. Collez-la dans le champ communication de votre application bancaire.',
          ),
        ),
      );
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Impossible de copier la communication. Réessayez.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        key: const Key('copy-payment-communication'),
        onPressed: communication.trim().isEmpty ? null : () => _copy(context),
        icon: const Icon(Icons.copy_outlined),
        label: const Text('Copier la communication'),
      ),
    );
  }
}
