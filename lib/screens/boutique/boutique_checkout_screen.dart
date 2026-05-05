import 'dart:math';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/auth_provider.dart';
import '../../providers/cart_provider.dart';
import '../../providers/member_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'boutique_feature_guard.dart';

class BoutiqueCheckoutScreen extends StatefulWidget {
  const BoutiqueCheckoutScreen({super.key});

  @override
  State<BoutiqueCheckoutScreen> createState() => _BoutiqueCheckoutScreenState();
}

class _BoutiqueCheckoutScreenState extends State<BoutiqueCheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  final _streetController = TextEditingController();
  final _postalCodeController = TextEditingController();
  final _cityController = TextEditingController();

  bool _isSubmitting = false;
  _CheckoutSuccess? _success;

  @override
  void dispose() {
    _streetController.dispose();
    _postalCodeController.dispose();
    _cityController.dispose();
    super.dispose();
  }

  Future<void> _confirmOrder(BuildContext context) async {
    final cart = context.read<CartProvider>();
    if (cart.isEmpty) return;

    if (cart.requiresPostalAddress &&
        !(_formKey.currentState?.validate() ?? false)) {
      return;
    }

    setState(() => _isSubmitting = true);
    await Future<void>.delayed(const Duration(milliseconds: 600));

    final random = Random();
    final orderNumber = 'BTQ-2026-${(1000 + random.nextInt(9000)).toString()}';

    // TODO: replace with Cloud Function createOrder + real QR payload.
    cart.clear();

    if (!mounted) return;
    setState(() {
      _isSubmitting = false;
      _success = _CheckoutSuccess(
        orderNumber: orderNumber,
        iban: 'BE12 3456 7890 1234',
        qrReference: 'QR-$orderNumber',
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();
    final auth = context.watch<AuthProvider>();
    final member = context.watch<MemberProvider>();

    return BoutiqueFeatureGuard(
      child: Scaffold(
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          title: const Text('Checkout'),
          backgroundColor: Colors.transparent,
          elevation: 0,
        ),
        body: OceanGradientBackground(
          creatures: CreatureSet.none,
          child: SafeArea(
            child: _success != null
                ? _SuccessView(success: _success!)
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Récapitulatif',
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 12),
                              ...cart.items.map(
                                (item) => Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          '${item.qty}x ${item.name} (${item.variantLabel})',
                                        ),
                                      ),
                                      Text(
                                        '${item.lineTotal.toStringAsFixed(2)} €',
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              const Divider(),
                              Row(
                                children: [
                                  const Text('Total'),
                                  const Spacer(),
                                  Text(
                                    '${cart.total.toStringAsFixed(2)} €',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Coordonnées de contact',
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 12),
                              Text(member.displayName),
                              Text(
                                member.email ??
                                    auth.currentUser?.email ??
                                    'TODO email',
                              ),
                              Text(
                                member.phoneNumber ??
                                    'TODO numéro de téléphone',
                              ),
                            ],
                          ),
                        ),
                      ),
                      if (cart.requiresPostalAddress) ...[
                        const SizedBox(height: 16),
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Form(
                              key: _formKey,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Adresse postale',
                                    style: TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  TextFormField(
                                    controller: _streetController,
                                    decoration: const InputDecoration(
                                      labelText: 'Rue et numéro',
                                    ),
                                    validator: (value) =>
                                        (value == null || value.trim().isEmpty)
                                        ? 'Champ requis'
                                        : null,
                                  ),
                                  const SizedBox(height: 12),
                                  TextFormField(
                                    controller: _postalCodeController,
                                    decoration: const InputDecoration(
                                      labelText: 'Code postal',
                                    ),
                                    validator: (value) =>
                                        (value == null || value.trim().isEmpty)
                                        ? 'Champ requis'
                                        : null,
                                  ),
                                  const SizedBox(height: 12),
                                  TextFormField(
                                    controller: _cityController,
                                    decoration: const InputDecoration(
                                      labelText: 'Ville',
                                    ),
                                    validator: (value) =>
                                        (value == null || value.trim().isEmpty)
                                        ? 'Champ requis'
                                        : null,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 20),
                      ElevatedButton(
                        onPressed: _isSubmitting || cart.isEmpty
                            ? null
                            : () => _confirmOrder(context),
                        child: Text(
                          _isSubmitting
                              ? 'Confirmation...'
                              : 'Confirmer commande',
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'TODO: appeler la Cloud Function createOrder puis remplacer cette simulation.',
                        style: TextStyle(color: Colors.white70),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

class _CheckoutSuccess {
  final String orderNumber;
  final String iban;
  final String qrReference;

  const _CheckoutSuccess({
    required this.orderNumber,
    required this.iban,
    required this.qrReference,
  });
}

class _SuccessView extends StatelessWidget {
  final _CheckoutSuccess success;

  const _SuccessView({required this.success});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.check_circle, color: Colors.green, size: 56),
                const SizedBox(height: 12),
                const Text(
                  'Commande créée',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                Container(
                  width: 160,
                  height: 160,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade200,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  alignment: Alignment.center,
                  child: const Text('QR\nTODO', textAlign: TextAlign.center),
                ),
                const SizedBox(height: 16),
                Text('Commande: ${success.orderNumber}'),
                Text('IBAN: ${success.iban}'),
                Text('Référence: ${success.qrReference}'),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
