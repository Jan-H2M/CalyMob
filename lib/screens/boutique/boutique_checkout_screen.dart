import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../providers/boutique_cart_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/boutique/boutique_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'boutique_order_confirmation_screen.dart';

class BoutiqueCheckoutScreen extends StatefulWidget {
  const BoutiqueCheckoutScreen({super.key});

  @override
  State<BoutiqueCheckoutScreen> createState() => _BoutiqueCheckoutScreenState();
}

class _BoutiqueCheckoutScreenState extends State<BoutiqueCheckoutScreen> {
  bool _submitting = false;
  bool _revalidated = false;
  bool _paymentChoiceShown = false;
  final TextEditingController _addressNameController = TextEditingController();
  final TextEditingController _addressLine1Controller = TextEditingController();
  final TextEditingController _addressLine2Controller = TextEditingController();
  final TextEditingController _postalCodeController = TextEditingController();
  final TextEditingController _cityController = TextEditingController();
  final TextEditingController _countryController =
      TextEditingController(text: 'Belgique');

  @override
  void initState() {
    super.initState();
    // Fix audit 2026-07-19 (H2): mandje valideren tegen de actuele catalogus
    // vóór de bestelling — verwijderde producten eruit, prijzen bijgewerkt,
    // met melding. Zo bevestigt het lid altijd het bedrag dat de server ook
    // zal aanrekenen.
    WidgetsBinding.instance.addPostFrameCallback((_) => _revalidateCart());
  }

  Future<void> _revalidateCart() async {
    if (_revalidated || !mounted) return;
    _revalidated = true;
    try {
      final products = await BoutiqueService()
          .watchPublishedProducts(FirebaseConfig.defaultClubId)
          .first;
      if (!mounted) return;
      final result =
          await context.read<BoutiqueCartProvider>().revalidate(products);
      if (!mounted) return;
      if (result.removed > 0 || result.repriced > 0) {
        final messages = <String>[
          if (result.removed > 0)
            '${result.removed} article(s) plus disponible(s) retiré(s) du panier.',
          if (result.repriced > 0)
            'Prix mis à jour pour ${result.repriced} article(s).',
        ];
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(messages.join(' '))),
        );
      }
      if (!context.read<BoutiqueCartProvider>().requiresPostalAddress) {
        await _choosePaymentMethod();
      }
    } catch (_) {
      // Catalogus tijdelijk onbereikbaar — de server blijft de eindcontrole.
    }
  }

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
                      onPressed: _submitting ? null : _choosePaymentMethod,
                      icon: _submitting
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.payment_outlined),
                      label: Text(_submitting
                          ? 'Creation...'
                          : 'Choisir le mode de paiement'),
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  Future<void> _choosePaymentMethod() async {
    if (_paymentChoiceShown || _submitting || !mounted) return;
    final cart = context.read<BoutiqueCartProvider>();
    final member = context.read<MemberProvider>();
    final auth = context.read<AuthProvider>();
    final payload = _buildOrderPayload(cart: cart, member: member, auth: auth);
    if (!_validateBeforeSubmit(context, payload)) return;
    _paymentChoiceShown = true;
    final paymentMethod = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
        titlePadding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
        contentPadding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
        title: const Text('Choisissez votre paiement'),
        content: SizedBox(
          width: 360,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Comment souhaitez-vous payer votre commande ?',
                style: TextStyle(height: 1.4),
              ),
              const SizedBox(height: 24),
              OutlinedButton.icon(
                onPressed: () => Navigator.of(dialogContext).pop('email'),
                icon: const Icon(Icons.email_outlined),
                label: const Padding(
                  padding: EdgeInsets.symmetric(vertical: 14),
                  child: Text('Recevoir le QR code par e-mail'),
                ),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: () => Navigator.of(dialogContext).pop('bank'),
                icon: const Icon(Icons.account_balance_outlined),
                label: const Padding(
                  padding: EdgeInsets.symmetric(vertical: 14),
                  child: Text('Payer par virement bancaire'),
                ),
              ),
              const SizedBox(height: 12),
              TextButton.icon(
                onPressed: () => Navigator.of(dialogContext).pop(),
                icon: const Icon(Icons.arrow_back),
                label: const Text('Retour au panier'),
              ),
            ],
          ),
        ),
      ),
    );
    _paymentChoiceShown = false;
    if (!mounted) return;
    if (paymentMethod == null) {
      Navigator.of(context).pop();
      return;
    }
    await _submitOrder(context,
        cart: cart, member: member, auth: auth, paymentMethod: paymentMethod);
  }

  Future<void> _submitOrder(
    BuildContext context, {
    required BoutiqueCartProvider cart,
    required MemberProvider member,
    required AuthProvider auth,
    required String paymentMethod,
  }) async {
    final orderPayload = _buildOrderPayload(
      cart: cart,
      member: member,
      auth: auth,
    );

    if (!_validateBeforeSubmit(context, orderPayload)) return;
    orderPayload['deferPaymentEmail'] = true;

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
            paymentMethod: paymentMethod,
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
