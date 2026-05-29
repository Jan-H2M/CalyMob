import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../config/app_colors.dart';
import '../../utils/epc_qr_code.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class BoutiqueOrderConfirmationScreen extends StatelessWidget {
  final String orderNumber;
  final String ogmDisplay;
  final String iban;
  final String beneficiary;
  final double amount;
  final String? epcPayload;

  const BoutiqueOrderConfirmationScreen({
    super.key,
    required this.orderNumber,
    required this.ogmDisplay,
    required this.iban,
    required this.beneficiary,
    required this.amount,
    this.epcPayload,
  });

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(
      locale: 'fr_BE',
      symbol: '€',
      decimalDigits: 2,
    );
    final payload = epcPayload?.isNotEmpty == true
        ? epcPayload!
        : generateEpcPayload(
            EpcQrCodeData(
              beneficiaryName: beneficiary,
              iban: iban,
              amount: amount,
              reference: ogmDisplay.replaceAll('+', '').replaceAll('/', ''),
              description: 'Boutique $orderNumber',
            ),
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
                      if (payload != null)
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: Colors.grey.shade200),
                          ),
                          child: QrImageView(
                            data: payload,
                            version: QrVersions.auto,
                            size: 230,
                          ),
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
