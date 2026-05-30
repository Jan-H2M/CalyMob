import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../utils/epc_qr_code.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class BoutiqueOrderConfirmationScreen extends StatelessWidget {
  final String? orderId;
  final String orderNumber;
  final String ogmDisplay;
  final String iban;
  final String beneficiary;
  final double amount;
  final String? epcPayload;
  final bool emailSent;

  const BoutiqueOrderConfirmationScreen({
    super.key,
    this.orderId,
    required this.orderNumber,
    required this.ogmDisplay,
    required this.iban,
    required this.beneficiary,
    required this.amount,
    this.epcPayload,
    this.emailSent = false,
  });

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(
      locale: 'fr_BE',
      symbol: '€',
      decimalDigits: 2,
    );
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Commande créée',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.bubbles,
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              Material(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.check_circle_outline,
                        color: AppColors.middenblauw,
                        size: 54,
                      ),
                      const SizedBox(height: 10),
                      Text(
                        orderNumber,
                        style: const TextStyle(
                          color: AppColors.donkerblauw,
                          fontWeight: FontWeight.w900,
                          fontSize: 24,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        formatter.format(amount),
                        style: const TextStyle(
                          color: AppColors.oranje,
                          fontWeight: FontWeight.w900,
                          fontSize: 22,
                        ),
                      ),
                      const SizedBox(height: 18),
                      _InfoBox(
                        icon: emailSent
                            ? Icons.mark_email_read_outlined
                            : Icons.email_outlined,
                        title: emailSent
                            ? 'Email de paiement envoyé'
                            : 'Email de paiement',
                        text:
                            'Le QR code de paiement est envoyé par email. Ouvrez ce mail sur ordinateur et scannez le QR avec votre application bancaire.',
                      ),
                      const SizedBox(height: 18),
                      _PaymentLine(label: 'Bénéficiaire', value: beneficiary),
                      _PaymentLine(
                        label: 'IBAN',
                        value: formatIbanDisplay(iban),
                        copyValue: iban,
                      ),
                      _PaymentLine(
                        label: 'Communication',
                        value: ogmDisplay,
                        copyValue: ogmDisplay,
                      ),
                      if (orderId != null && orderId!.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.red.shade700,
                              side: BorderSide(color: Colors.red.shade200),
                            ),
                            onPressed: () => _confirmCancel(context),
                            icon: const Icon(Icons.delete_outline),
                            label: const Text('Supprimer la commande'),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _confirmCancel(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Supprimer la commande ?'),
        content: Text(
          'La commande $orderNumber sera annulée. Le stock réservé sera libéré.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) return;

    try {
      await FirebaseFunctions.instanceFor(region: 'europe-west1')
          .httpsCallable('cancelBoutiqueOrder')
          .call({
        'clubId': FirebaseConfig.defaultClubId,
        'orderId': orderId,
      });

      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Commande supprimée')),
      );
      Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Impossible de supprimer: $error')),
      );
    }
  }
}

class _PaymentLine extends StatelessWidget {
  final String label;
  final String value;
  final String? copyValue;

  const _PaymentLine({
    required this.label,
    required this.value,
    this.copyValue,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 116,
            child: Text(
              label,
              style: TextStyle(
                color: Colors.grey.shade700,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                color: AppColors.donkerblauw,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          if (copyValue != null)
            IconButton(
              tooltip: 'Copier',
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: copyValue!));
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Copié')),
                );
              },
              icon: const Icon(Icons.copy, size: 18),
            ),
        ],
      ),
    );
  }
}

class _InfoBox extends StatelessWidget {
  final IconData icon;
  final String title;
  final String text;

  const _InfoBox({
    required this.icon,
    required this.title,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFE3F2FD),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.donkerblauw),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  text,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w700,
                    height: 1.25,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
