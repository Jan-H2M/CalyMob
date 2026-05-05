import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../providers/cart_provider.dart';
import '../../providers/member_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'boutique_feature_guard.dart';
import 'boutique_order_confirmation_screen.dart';

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

  @override
  void dispose() {
    _streetController.dispose();
    _postalCodeController.dispose();
    _cityController.dispose();
    super.dispose();
  }

  Future<void> _confirmOrder(BuildContext context) async {
    final cart = context.read<CartProvider>();
    final auth = context.read<AuthProvider>();
    final member = context.read<MemberProvider>();
    final uid = auth.currentUser?.uid;

    if (cart.isEmpty || uid == null) return;

    if (cart.requiresPostalAddress &&
        !(_formKey.currentState?.validate() ?? false)) {
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final functions = FirebaseFunctions.instanceFor(region: 'europe-west1');
      final callable = functions.httpsCallable('createOrder');
      final result = await callable.call({
        'clubId': FirebaseConfig.defaultClubId,
        'buyer': {
          'userId': uid,
          'displayName': member.displayName,
          'email': member.email ?? auth.currentUser?.email ?? '',
          'phone': member.phoneNumber ?? '',
          'memberId': member.odooIdLid ?? member.odooId ?? '',
        },
        'items': cart.items.map((item) => item.toCallablePayload()).toList(),
      });

      if (!context.mounted) return;

      final data = _asMap(result.data);
      final orderData = _normalizeConfirmationData(data, cart.total);
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => BoutiqueOrderConfirmationScreen(orderData: orderData),
        ),
      );
    } on FirebaseFunctionsException catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_functionsErrorMessage(error.code))),
      );
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Impossible de confirmer la commande pour le moment.',
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
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
            child: ListView(
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
                                Text('${item.lineTotal.toStringAsFixed(2)} €'),
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
                        Text(member.email ?? auth.currentUser?.email ?? 'Email absent'),
                        Text(member.phoneNumber ?? 'Téléphone absent'),
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
                              validator: _requiredValidator,
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _postalCodeController,
                              decoration: const InputDecoration(
                                labelText: 'Code postal',
                              ),
                              validator: _requiredValidator,
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _cityController,
                              decoration: const InputDecoration(
                                labelText: 'Ville',
                              ),
                              validator: _requiredValidator,
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
              ],
            ),
          ),
        ),
      ),
    );
  }

  String? _requiredValidator(String? value) {
    return value == null || value.trim().isEmpty ? 'Champ requis' : null;
  }
}

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return <String, dynamic>{};
}

Map<String, dynamic> _normalizeConfirmationData(
  Map<String, dynamic> result,
  double fallbackTotal,
) {
  final order = _asMap(result['order']);
  final payment = _asMap(result['payment']);
  final pricing = _asMap(order['pricing']);

  return {
    ...result,
    ...order,
    'payment': {
      ...payment,
      'amount': payment['amount'] ?? pricing['total'] ?? fallbackTotal,
      'ogm_display': payment['ogm_display'] ??
          result['ogm_display'] ??
          order['structuredCommunication'],
      'beneficiary': payment['beneficiary'] ??
          result['beneficiary'] ??
          'Calypso',
      'iban': payment['iban'] ?? result['iban'] ?? '',
    },
    'pricing': {
      ...pricing,
      'total': pricing['total'] ?? payment['amount'] ?? fallbackTotal,
    },
    'orderNumber': order['orderNumber'] ?? result['orderNumber'] ?? 'Commande',
    'structuredCommunication': order['structuredCommunication'] ??
        payment['ogm_display'] ??
        result['ogm_display'],
  };
}

String _functionsErrorMessage(String code) {
  switch (code) {
    case 'out_of_stock':
      return 'Un article n’est plus disponible dans la quantité demandée.';
    case 'failed-precondition':
      return 'La commande ne peut pas être créée dans son état actuel.';
    case 'permission-denied':
      return 'Vous n’avez pas les droits nécessaires pour créer cette commande.';
    case 'unauthenticated':
      return 'Votre session a expiré. Reconnectez-vous puis réessayez.';
    case 'invalid-argument':
      return 'Les données de commande sont invalides.';
    default:
      return 'Une erreur est survenue lors de la création de la commande.';
  }
}
