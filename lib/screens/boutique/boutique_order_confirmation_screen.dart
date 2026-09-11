import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../utils/epc_qr_code.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../../widgets/payment_communication_copy_button.dart';

class BoutiqueOrderConfirmationScreen extends StatelessWidget {
  final String? orderId;
  final String orderNumber;
  final String ogmDisplay;
  final String iban;
  final String beneficiary;
  final double amount;
  final String? epcPayload;
  final bool emailSent;
  final String paymentMethod;

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
    this.paymentMethod = 'bank',
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
                        size: 44,
                      ),
                      const SizedBox(height: 10),
                      Text(
                        orderNumber,
                        style: const TextStyle(
                          color: AppColors.donkerblauw,
                          fontWeight: FontWeight.w900,
                          fontSize: 19,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        formatter.format(amount),
                        style: const TextStyle(
                          color: AppColors.oranje,
                          fontWeight: FontWeight.w900,
                          fontSize: 20,
                        ),
                      ),
                      const SizedBox(height: 18),
                      if (paymentMethod == 'email')
                        _EmailPaymentDetails(
                          orderId: orderId,
                          instruction:
                              "Ouvrez cet e-mail sur votre ordinateur, puis scannez le QR code avec l’application bancaire de votre téléphone.",
                        )
                      else
                        _BankPaymentDetails(
                          beneficiary: beneficiary,
                          iban: iban,
                          communication: ogmDisplay,
                          amount: amount,
                        ),
                      const SizedBox(height: 18),
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

class _EmailPaymentDetails extends StatefulWidget {
  final String? orderId;
  final String instruction;
  const _EmailPaymentDetails(
      {required this.orderId, required this.instruction});

  @override
  State<_EmailPaymentDetails> createState() => _EmailPaymentDetailsState();
}

class _EmailPaymentDetailsState extends State<_EmailPaymentDetails> {
  bool sending = false;

  Future<void> _send() async {
    if (widget.orderId == null || sending) return;
    setState(() => sending = true);
    try {
      await FirebaseFunctions.instanceFor(region: 'europe-west1')
          .httpsCallable('sendBoutiqueOrderPaymentEmail')
          .call({
        'clubId': FirebaseConfig.defaultClubId,
        'orderId': widget.orderId
      });
      if (!mounted) return;
      Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (_) {
      if (!mounted) return;
      setState(() => sending = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Impossible d'envoyer l'e-mail.")),
      );
    }
  }

  @override
  Widget build(BuildContext context) => Column(
        children: [
          _InfoBox(
              icon: Icons.email_outlined,
              title: 'Paiement par e-mail',
              text: widget.instruction),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: sending ? null : _send,
              icon: sending
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send_outlined),
              label: const Text("Envoyer l'e-mail"),
            ),
          ),
        ],
      );
}

class _BankPaymentDetails extends StatefulWidget {
  final String beneficiary;
  final String iban;
  final String communication;
  final double amount;
  const _BankPaymentDetails(
      {required this.beneficiary,
      required this.iban,
      required this.communication,
      required this.amount});

  @override
  State<_BankPaymentDetails> createState() => _BankPaymentDetailsState();
}

class _BankPaymentDetailsState extends State<_BankPaymentDetails> {
  bool communicationCopied = false;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          const _InfoBox(
            icon: Icons.account_balance_outlined,
            title: 'Virement bancaire',
            text:
                "Dans votre application bancaire, effectuez le virement en utilisant l’IBAN ci-dessous. Copiez aussi la communication libre : elle est indispensable pour identifier correctement votre paiement.",
          ),
          const SizedBox(height: 16),
          _TransferDetailsCard(
            beneficiary: widget.beneficiary,
            iban: formatIbanDisplay(widget.iban),
            communication: widget.communication,
            amount: widget.amount,
          ),
          const SizedBox(height: 12),
          PaymentCopyButton(
            value: widget.iban,
            label: 'Copier l’IBAN',
            successMessage:
                'IBAN copié. Collez-le dans votre application bancaire.',
            icon: Icons.account_balance_outlined,
            buttonKey: const Key('copy-payment-iban'),
          ),
          const SizedBox(height: 8),
          PaymentCopyButton(
            value: widget.amount.toStringAsFixed(2),
            label: 'Copier le montant',
            successMessage:
                'Montant copié. Collez-le dans votre application bancaire.',
            icon: Icons.euro_outlined,
            buttonKey: const Key('copy-payment-amount'),
          ),
          const SizedBox(height: 8),
          PaymentCommunicationCopyButton(
            communication: widget.communication,
            onCopied: () => setState(() => communicationCopied = true),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.donkerblauw,
                side: const BorderSide(color: Color(0xFF9AB8D4)),
                textStyle: const TextStyle(fontWeight: FontWeight.w800),
              ),
              onPressed: communicationCopied
                  ? () =>
                      Navigator.of(context).popUntil((route) => route.isFirst)
                  : null,
              icon: const Icon(Icons.close_rounded),
              label: const Text('Fermer'),
            ),
          ),
        ],
      );
}

class _PaymentLine extends StatelessWidget {
  final String label;
  final String value;

  const _PaymentLine({
    required this.label,
    required this.value,
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
        ],
      ),
    );
  }
}

class _TransferDetailsCard extends StatelessWidget {
  final String beneficiary;
  final String iban;
  final String communication;
  final double amount;

  const _TransferDetailsCard({
    required this.beneficiary,
    required this.iban,
    required this.communication,
    required this.amount,
  });

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(
      locale: 'fr_BE',
      symbol: '€',
      decimalDigits: 2,
    );
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 4),
      decoration: BoxDecoration(
        color: const Color(0xFFF5F9FD),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFD7E8F7)),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                const Text(
                  'Montant',
                  style: TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const Spacer(),
                Text(
                  formatter.format(amount),
                  style: const TextStyle(
                    color: AppColors.oranje,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: Color(0xFFD7E8F7)),
          const SizedBox(height: 12),
          _PaymentLine(label: 'Bénéficiaire', value: beneficiary),
          _PaymentLine(label: 'IBAN', value: iban),
          _PaymentLine(label: 'Communication', value: communication),
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
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFE3F2FD),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.donkerblauw, size: 27),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w900,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  text,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    height: 1.35,
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
