import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../config/app_colors.dart';

class MaterialPaymentQrDialog extends StatelessWidget {
  final String payload;
  final String reference;
  final double amount;
  final bool canConfirmPayment;

  const MaterialPaymentQrDialog({
    super.key,
    required this.payload,
    required this.reference,
    required this.amount,
    this.canConfirmPayment = false,
  });

  @override
  Widget build(BuildContext context) {
    return Dialog(
      key: const Key('material-payment-qr-dialog'),
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 380),
        child: Material(
          color: Colors.white,
          elevation: 12,
          borderRadius: BorderRadius.circular(20),
          clipBehavior: Clip.antiAlias,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Caution · ${amount.toStringAsFixed(2)} EUR',
                        style: const TextStyle(
                          color: AppColors.donkerblauw,
                          fontSize: 19,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(false),
                      icon: const Icon(Icons.close),
                      tooltip: 'Fermer',
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Container(
                  key: const Key('material-payment-qr-code'),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.black12),
                  ),
                  child: QrImageView(
                    data: payload,
                    version: QrVersions.auto,
                    size: 220,
                    backgroundColor: Colors.white,
                    errorCorrectionLevel: QrErrorCorrectLevel.M,
                    errorStateBuilder: (context, error) => SizedBox(
                      width: 220,
                      height: 220,
                      child: Center(
                        child: Text(
                          'Le QR ne peut pas être affiché.\n$error',
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: AppColors.error),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Communication : $reference',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Scannez avec l’application bancaire. Le matériel reste réservé jusqu’à la confirmation du paiement.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.black54, fontSize: 13),
                ),
                if (canConfirmPayment) ...[
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () => Navigator.of(context).pop(true),
                      icon: const Icon(Icons.verified_outlined),
                      label: const Text('Paiement constaté'),
                    ),
                  ),
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(false),
                    child: const Text('Plus tard'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
