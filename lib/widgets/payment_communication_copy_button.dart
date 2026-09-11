import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Large, uniform copy action shared by every bank-transfer payment flow.
class PaymentCopyButton extends StatelessWidget {
  final String value;
  final String label;
  final String successMessage;
  final IconData icon;
  final VoidCallback? onCopied;
  final Key? buttonKey;

  const PaymentCopyButton({
    super.key,
    required this.value,
    required this.label,
    required this.successMessage,
    this.icon = Icons.copy_outlined,
    this.onCopied,
    this.buttonKey,
  });

  Future<void> _copy(BuildContext context) async {
    try {
      await Clipboard.setData(ClipboardData(text: value));
      if (!context.mounted) return;
      onCopied?.call();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(successMessage)),
      );
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Impossible de copier. Réessayez.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: FilledButton.tonalIcon(
        key: buttonKey,
        style: FilledButton.styleFrom(
          foregroundColor: const Color(0xFF155E9E),
          textStyle: const TextStyle(fontWeight: FontWeight.w800),
        ),
        onPressed: value.trim().isEmpty ? null : () => _copy(context),
        icon: Icon(icon),
        label: Text(label),
      ),
    );
  }
}

/// Backward-compatible specialized version for existing communication flows.
class PaymentCommunicationCopyButton extends StatelessWidget {
  final String communication;
  final VoidCallback? onCopied;

  const PaymentCommunicationCopyButton({
    super.key,
    required this.communication,
    this.onCopied,
  });

  @override
  Widget build(BuildContext context) => PaymentCopyButton(
        value: communication,
        label: 'Copier la communication',
        successMessage:
            'Communication copiée. Collez-la dans le champ communication de votre application bancaire.',
        icon: Icons.receipt_long_outlined,
        onCopied: onCopied,
        buttonKey: const Key('copy-payment-communication'),
      );
}
