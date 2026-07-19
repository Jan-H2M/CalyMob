import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../providers/boutique_cart_provider.dart';
import '../../providers/member_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'boutique_order_confirmation_screen.dart';

class BoutiqueCheckoutScreen extends StatefulWidget {
  const BoutiqueCheckoutScreen({super.key});

  @override
  State<BoutiqueCheckoutScreen> createState() => _BoutiqueCheckoutScreenState();
}

class _BoutiqueCheckoutScreenState extends State<BoutiqueCheckoutScreen> {
  bool _submitting = false;
  final TextEditingController _addressNameController = TextEditingController();
  final TextEditingController _addressLine1Controller = TextEditingController();
  final TextEditingController _addressLine2Controller = TextEditingController();
  final TextEditingController _postalCodeController = TextEditingController();
  final TextEditingController _cityController = TextEditingController();
  final TextEditingController _countryController =
      TextEditingController(text: 'Belgique');

  @override
  void dispose() {
    _addressNameController.dispose();
    _addressLine1Controller.dispose();
    _addressLine2Controller.dispose();
    _postalCodeController.dispose();
    _cityController.dispose();
    _countryController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(
      locale: 'fr_BE',
      symbol: '€',
      decimalDigits: 2,
    );
    final cart = context.watch<BoutiqueCartProvider>();
    final member = context.watch<MemberProvider>();
    final auth = context.watch<AuthProvider>();
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Validation',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.bubbles,
        child: SafeArea(
          child: cart.isEmpty
              ? const _EmptyCheckout()
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  children: [
                    _SectionCard(
                      title: 'Acheteur',
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            member.displayName,
                            style: const TextStyle(
                              color: AppColors.donkerblauw,
                              fontWeight: FontWeight.w900,
                              fontSize: 17,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            member.email ?? auth.currentUser?.email ?? '',
                            style: TextStyle(color: Colors.grey.shade700),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    _SectionCard(
                      title: 'Articles',
                      child: Column(
                        children: [
                          for (final item in cart.items)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          item.productName,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w900,
                                          ),
                                        ),
                                        Text(
                                          '${item.variantLabel} · x${item.qty}',
                                          style: TextStyle(
                                            color: Colors.grey.shade700,
                                          ),
                                        ),
                                        if (item.hasPersonalization)
                                          Text(
                                            'Personnalisation incluse',
                                            style: TextStyle(
                                              color: Colors.grey.shade700,
                                              fontSize: 12.5,
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                  Text(
                                    formatter.format(item.lineTotal),
                                    style: const TextStyle(
                                      color: AppColors.oranje,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (cart.requiresPostalAddress) ...[
                      const SizedBox(height: 12),
                      _SectionCard(
                        title: 'Adresse postale',
                        child: Column(
                          children: [
                            TextField(
                              controller: _addressNameController,
                              decoration: const InputDecoration(
                                labelText: 'Nom destinataire',
                              ),
                            ),
                            const SizedBox(height: 10),
                            TextField(
                              controller: _addressLine1Controller,
                              decoration: const InputDecoration(
                                labelText: 'Rue et numéro',
                              ),
                            ),
                            const SizedBox(height: 10),
                            TextField(
                              controller: _addressLine2Controller,
                              decoration: const InputDecoration(
                                labelText: 'Complément',
                              ),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  flex: 2,
                                  child: TextField(
                                    controller: _postalCodeController,
                                    keyboardType: TextInputType.number,
                                    decoration: const InputDecoration(
                                      labelText: 'Code postal',
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  flex: 3,
                                  child: TextField(
                                    controller: _cityController,
                                    decoration: const InputDecoration(
                                      labelText: 'Ville',
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            TextField(
                              controller: _countryController,
                              decoration: const InputDecoration(
                                labelText: 'Pays',
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    _SectionCard(
                      title: 'Total',
                      child: Row(
                        children: [
                          const Text(
                            'À payer',
                            style: TextStyle(fontWeight: FontWeight.w900),
                          ),
                          const Spacer(),
                          Text(
                            formatter.format(cart.total),
                            style: const TextStyle(
                              color: AppColors.oranje,
                              fontWeight: FontWeight.w900,
                              fontSize: 20,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: _submitting
                          ? null
                          : () => _submitOrder(
                                context,
                                cart: cart,
                                member: member,
                                auth: auth,
                              ),
                      icon: _submitting
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.receipt_long_outlined),
                      label: Text(
                        _submitting ? 'Création...' : 'Commander',
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  Future<void> _submitOrder(
    BuildContext context, {
    required BoutiqueCartProvider cart,
    required MemberProvider member,
    required AuthProvider auth,
  }) async {
    final orderPayload = _buildOrderPayload(
      cart: cart,
      member: member,
      auth: auth,
    );

    if (!_validateBeforeSubmit(context, orderPayload)) return;

    // Fix audit 2026-07-19 (K5): idempotency-key per mandje; een retry na
    // timeout/app-kill hergebruikt dezelfde key → server geeft de bestaande
    // order terug i.p.v. een dubbele te maken.
    orderPayload['idempotencyKey'] = await cart.checkoutIdempotencyKey();

    if (!context.mounted) return;
    setState(() => _submitting = true);
    try {
      final callable = FirebaseFunctions.instanceFor(region: 'europe-west1')
          .httpsCallable('createBoutiqueOrder');
      final result = await callable.call(orderPayload);
      final data = Map<String, dynamic>.from(result.data as Map);
      final payment = Map<String, dynamic>.from(data['payment'] as Map);

      if (!context.mounted) return;
      await context.read<BoutiqueCartProvider>().clear();

      if (!context.mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(
          builder: (_) => BoutiqueOrderConfirmationScreen(
            orderId: data['orderId']?.toString(),
            orderNumber: data['orderNumber']?.toString() ?? '',
            ogmDisplay: data['ogm_display']?.toString() ??
                payment['ogm_display']?.toString() ??
                '',
            iban: payment['iban']?.toString() ?? '',
            beneficiary: payment['beneficiary']?.toString() ?? '',
            amount: _asDouble(data['total'] ?? payment['amount']),
            epcPayload: payment['epcPayload']?.toString(),
            emailSent: payment['emailStatus'] == 'sent',
          ),
        ),
        (route) => route.isFirst,
      );
    } on FirebaseFunctionsException catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_functionErrorMessage(error)),
        ),
      );
    } catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erreur commande: $error')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Map<String, dynamic> _buildOrderPayload({
    required BoutiqueCartProvider cart,
    required MemberProvider member,
    required AuthProvider auth,
  }) {
    final user = auth.currentUser;
    return {
      'clubId': FirebaseConfig.defaultClubId,
      'buyer': {
        'userId': user?.uid,
        'displayName': member.displayName,
        'email': member.email ?? user?.email,
        'phone': member.phoneNumber,
      },
      'items': cart.items
          .map(
            (item) => item.toOrderPayload(
              deliveryAddress: item.deliveryMode == 'post'
                  ? _deliveryAddressPayload()
                  : null,
            ),
          )
          .toList(),
      'pricing': {
        'itemsSubtotal': cart.itemsSubtotal,
        'deliverySurcharges': cart.deliverySurcharges,
        'total': cart.total,
        'currency': 'EUR',
      },
    };
  }

  bool _validateBeforeSubmit(
    BuildContext context,
    Map<String, dynamic> orderPayload,
  ) {
    final buyer = Map<String, dynamic>.from(orderPayload['buyer'] as Map);
    if ((buyer['displayName'] ?? '').toString().trim().isEmpty ||
        (buyer['email'] ?? '').toString().trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Nom et email requis pour créer la commande.'),
        ),
      );
      return false;
    }

    final items = orderPayload['items'];
    if (items is List) {
      final needsPost = items.any(
          (item) => item is Map && item['deliveryMode']?.toString() == 'post');
      if (needsPost && !_hasCompletePostalAddress) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Adresse postale complète requise.'),
          ),
        );
        return false;
      }
    }
    return true;
  }

  bool get _hasCompletePostalAddress {
    return _addressLine1Controller.text.trim().isNotEmpty &&
        _postalCodeController.text.trim().isNotEmpty &&
        _cityController.text.trim().isNotEmpty &&
        _countryController.text.trim().isNotEmpty;
  }

  Map<String, dynamic> _deliveryAddressPayload() {
    return {
      'name': _addressNameController.text.trim(),
      'line1': _addressLine1Controller.text.trim(),
      'line2': _addressLine2Controller.text.trim(),
      'postalCode': _postalCodeController.text.trim(),
      'city': _cityController.text.trim(),
      'country': _countryController.text.trim(),
    };
  }

  double _asDouble(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  String _functionErrorMessage(FirebaseFunctionsException error) {
    final details = error.details;
    if (details is Map && details['code'] == 'OUT_OF_STOCK') {
      return 'Stock insuffisant pour un article.';
    }
    if (details is Map && details['code'] == 'PRODUCT_ARCHIVED') {
      return 'Un produit n’est plus disponible.';
    }
    if (details is Map && details['code'] == 'PRODUCT_NOT_FOUND') {
      return 'Un produit ou une variante est introuvable.';
    }
    return error.message ?? 'Impossible de créer la commande.';
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;

  const _SectionCard({
    required this.title,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(
                color: AppColors.middenblauw,
                fontWeight: FontWeight.w900,
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 10),
            child,
          ],
        ),
      ),
    );
  }
}

class _EmptyCheckout extends StatelessWidget {
  const _EmptyCheckout();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Text(
        'Panier vide',
        style: TextStyle(color: Colors.white),
      ),
    );
  }
}
