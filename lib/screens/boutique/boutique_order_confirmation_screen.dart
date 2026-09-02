import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  const _BankPaymentDetails(
      {required this.beneficiary,
      required this.iban,
      required this.communication});

  @override
  State<_BankPaymentDetails> createState() => _BankPaymentDetailsState();
}

class _BankPaymentDetailsState extends State<_BankPaymentDetails> {
  bool communicationCopied = false;

  Future<void> _copy(String value, {bool communication = false}) async {
    try {
      await Clipboard.setData(ClipboardData(text: value));
      if (!mounted) return;
      if (communication) setState(() => communicationCopied = true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(communication ? 'Communication copiée' : 'IBAN copié'),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Impossible de copier. Réessayez.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) => Column(
        children: [
          const _InfoBox(
            icon: Icons.account_balance_outlined,
            title: 'Virement bancaire',
            text:
                "Copiez l’IBAN et la communication séparément, puis collez-les dans votre application bancaire.",
          ),
          const SizedBox(height: 16),
          _PaymentLine(label: 'Bénéficiaire', value: widget.beneficiary),
          _PaymentLine(
              label: 'IBAN',
              value: formatIbanDisplay(widget.iban),
              onCopy: () => _copy(widget.iban)),
          _PaymentLine(
              label: 'Communication',
              value: widget.communication),
          PaymentCommunicationCopyButton(
            communication: widget.communication,
            onCopied: () => setState(() => communicationCopied = true),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: communicationCopied
                  ? () =>
                      Navigator.of(context).popUntil((route) => route.isFirst)
                  : null,
              child: const Text('Fermer'),
            ),
          ),
        ],
      );
}

class _PaymentLine extends StatelessWidget {
  final String label;
  final String value;
  final VoidCallback? onCopy;

  const _PaymentLine({
    required this.label,
    required this.value,
    this.onCopy,
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
          if (onCopy != null)
            IconButton(
              tooltip: 'Copier',
              onPressed: onCopy,
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
