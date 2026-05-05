import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/cart_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'boutique_feature_guard.dart';

class BoutiqueProductDetailScreen extends StatefulWidget {
  final String productId;

  const BoutiqueProductDetailScreen({super.key, required this.productId});

  @override
  State<BoutiqueProductDetailScreen> createState() =>
      _BoutiqueProductDetailScreenState();
}

class _BoutiqueProductDetailScreenState
    extends State<BoutiqueProductDetailScreen> {
  static const List<String> _variants = ['Standard', 'Taille S', 'Taille M'];
  static const List<DeliveryMode> _deliveryModes = [
    DeliveryMode.poolPickup,
    DeliveryMode.post,
    DeliveryMode.inPerson,
  ];

  String _selectedVariant = _variants.first;
  DeliveryMode _selectedDeliveryMode = DeliveryMode.poolPickup;
  int _quantity = 1;

  @override
  Widget build(BuildContext context) {
    const basePrice = 24.90;
    final computedPrice = basePrice * _quantity;

    return BoutiqueFeatureGuard(
      child: Scaffold(
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          title: const Text('Détail produit'),
          backgroundColor: Colors.transparent,
          elevation: 0,
        ),
        body: OceanGradientBackground(
          creatures: CreatureSet.bubbles,
          child: SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                SizedBox(
                  height: 220,
                  child: PageView.builder(
                    itemCount: 3,
                    itemBuilder: (_, index) => Card(
                      clipBehavior: Clip.antiAlias,
                      child: Container(
                        color: Colors.blueGrey.shade100,
                        alignment: Alignment.center,
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.photo_library_outlined, size: 56),
                            const SizedBox(height: 8),
                            Text('Visuel ${index + 1} placeholder'),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Produit ${widget.productId}',
                          style: Theme.of(context).textTheme.headlineSmall
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '${computedPrice.toStringAsFixed(2)} €',
                          style: Theme.of(context).textTheme.titleLarge
                              ?.copyWith(
                                color: Colors.teal.shade700,
                                fontWeight: FontWeight.w700,
                              ),
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'Description placeholder. TODO: hydrater depuis Firestore et calculer le prix final avec variant + delivery surcharge.',
                        ),
                        const SizedBox(height: 20),
                        DropdownButtonFormField<String>(
                          value: _selectedVariant,
                          decoration: const InputDecoration(
                            labelText: 'Variant',
                          ),
                          items: _variants
                              .map(
                                (variant) => DropdownMenuItem<String>(
                                  value: variant,
                                  child: Text(variant),
                                ),
                              )
                              .toList(),
                          onChanged: (value) {
                            if (value == null) return;
                            setState(() => _selectedVariant = value);
                          },
                        ),
                        const SizedBox(height: 20),
                        Row(
                          children: [
                            const Text(
                              'Quantité',
                              style: TextStyle(fontWeight: FontWeight.w600),
                            ),
                            const Spacer(),
                            IconButton(
                              onPressed: _quantity > 1
                                  ? () => setState(() => _quantity -= 1)
                                  : null,
                              icon: const Icon(Icons.remove_circle_outline),
                            ),
                            Text(
                              '$_quantity',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            IconButton(
                              onPressed: () => setState(() => _quantity += 1),
                              icon: const Icon(Icons.add_circle_outline),
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),
                        const Text(
                          'Mode de livraison',
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 10,
                          children: _deliveryModes.map((mode) {
                            final selected = mode == _selectedDeliveryMode;
                            return ChoiceChip(
                              label: Text(mode.label),
                              selected: selected,
                              onSelected: (_) {
                                setState(() => _selectedDeliveryMode = mode);
                              },
                            );
                          }).toList(),
                        ),
                        const SizedBox(height: 24),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: () {
                              context.read<CartProvider>().addItem(
                                widget.productId,
                                _selectedVariant,
                                _quantity,
                                _selectedDeliveryMode,
                                name: 'Produit ${widget.productId}',
                                variantLabel: _selectedVariant,
                                unitPrice: basePrice,
                              );
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'Ajouté au panier. TODO: brancher la vraie logique produit.',
                                  ),
                                ),
                              );
                            },
                            icon: const Icon(Icons.add_shopping_cart),
                            label: const Text('Ajouter au panier'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
