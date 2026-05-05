import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../providers/cart_provider.dart';
import '../../utils/epc_qr_code.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'boutique_feature_guard.dart';

class BoutiqueOrderConfirmationScreen extends StatefulWidget {
  final Map<String, dynamic> orderData;

  const BoutiqueOrderConfirmationScreen({
    super.key,
    required this.orderData,
  });

  @override
  State<BoutiqueOrderConfirmationScreen> createState() =>
      _BoutiqueOrderConfirmationScreenState();
}

class _BoutiqueOrderConfirmationScreenState
    extends State<BoutiqueOrderConfirmationScreen> {
  bool _clearedCart = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_clearedCart) return;
    _clearedCart = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await context.read<CartProvider>().clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final order = Map<String, dynamic>.from(widget.orderData);
    final payment = _asMap(order['payment']);
    final pricing = _asMap(order['pricing']);
    final orderNumber = order['orderNumber']?.toString() ?? 'Commande';
    final iban = payment['iban']?.toString() ?? '';
    final beneficiary = payment['beneficiary']?.toString() ?? 'Calypso';
    final ogmDisplay = payment['ogm_display']?.toString() ??
        order['structuredCommunication']?.toString() ??
        '';
    final amount = _asDouble(payment['amount'] ?? pricing['total']);
    final epcPayload = payment['epcPayload']?.toString().isNotEmpty == true
        ? payment['epcPayload'].toString()
        : buildEpcQrPayload(
            iban: iban,
            beneficiary: beneficiary,
            amount: amount,
            structuredCommunication: ogmDisplay,
            bic: payment['bic']?.toString(),
          );

    return BoutiqueFeatureGuard(
      child: Scaffold(
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          title: const Text('Confirmation'),
          backgroundColor: Colors.transparent,
          elevation: 0,
        ),
        body: OceanGradientBackground(
          creatures: CreatureSet.jellyfishAndBubbles,
          child: SafeArea(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Commande $orderNumber confirmée',
                          style: Theme.of(context).textTheme.headlineSmall
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 16),
                        Center(
                          child: Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: QrImageView(
                              data: epcPayload,
                              size: 220,
                              backgroundColor: Colors.white,
                            ),
                          ),
                        ),
                        const SizedBox(height: 20),
                        _InfoRow(
                          label: 'Montant',
                          value: '${amount.toStringAsFixed(2)} €',
                        ),
                        _InfoRow(
                          label: 'IBAN',
                          value: formatIbanDisplay(iban),
                        ),
                        _InfoRow(
                          label: 'Bénéficiaire',
                          value: beneficiary,
                        ),
                        _InfoRow(
                          label: 'Communication',
                          value: ogmDisplay,
                        ),
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 12,
                          runSpacing: 12,
                          children: [
                            OutlinedButton.icon(
                              onPressed: () => _copyValue(
                                context,
                                iban,
                                'IBAN copié.',
                              ),
                              icon: const Icon(Icons.copy),
                              label: const Text('Copier IBAN'),
                            ),
                            OutlinedButton.icon(
                              onPressed: () => _copyValue(
                                context,
                                ogmDisplay,
                                'Communication copiée.',
                              ),
                              icon: const Icon(Icons.copy_all),
                              label: const Text('Copier communication'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () => Navigator.of(context).pushNamed('/profile/orders'),
                  child: const Text('Voir mes commandes'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _copyValue(
    BuildContext context,
    String value,
    String message,
  ) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return const <String, dynamic>{};
}

double _asDouble(Object? value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}
