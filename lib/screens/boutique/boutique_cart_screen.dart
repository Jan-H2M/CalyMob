import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/cart_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'boutique_feature_guard.dart';

class _CartItemThumb extends StatelessWidget {
  final String? imageUrl;

  const _CartItemThumb({required this.imageUrl});

  @override
  Widget build(BuildContext context) {
    if (imageUrl == null || imageUrl!.isEmpty) {
      return Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          color: Colors.blueGrey.shade100,
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Icon(Icons.inventory_2_outlined),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Image.network(
        imageUrl!,
        width: 56,
        height: 56,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => Container(
          width: 56,
          height: 56,
          color: Colors.blueGrey.shade100,
          child: const Icon(Icons.broken_image_outlined),
        ),
      ),
    );
  }
}

class BoutiqueCartScreen extends StatelessWidget {
  const BoutiqueCartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BoutiqueFeatureGuard(
      child: Scaffold(
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          title: const Text('Panier'),
          backgroundColor: Colors.transparent,
          elevation: 0,
        ),
        body: OceanGradientBackground(
          creatures: CreatureSet.jellyfishAndBubbles,
          child: SafeArea(
            child: Consumer<CartProvider>(
              builder: (context, cart, _) {
                return Column(
                  children: [
                    Expanded(
                      child: cart.items.isEmpty
                          ? const Center(
                              child: Text(
                                'Votre panier est vide.',
                                style: TextStyle(color: Colors.white),
                              ),
                            )
                          : ListView.separated(
                              padding: const EdgeInsets.all(16),
                              itemCount: cart.items.length,
                              separatorBuilder: (_, __) =>
                                  const SizedBox(height: 12),
                              itemBuilder: (context, index) {
                                final item = cart.items[index];
                                return Card(
                                  child: ListTile(
                                    contentPadding: const EdgeInsets.all(12),
                                    leading: _CartItemThumb(imageUrl: item.imageUrl),
                                    title: Text(item.name),
                                    subtitle: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(item.variantLabel),
                                        Text(item.deliveryMode.label),
                                        Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            IconButton(
                                              onPressed: () => cart.updateQty(
                                                item.productId,
                                                item.variantId,
                                                item.deliveryMode,
                                                item.qty - 1,
                                              ),
                                              icon: const Icon(Icons.remove),
                                            ),
                                            Text('${item.qty}'),
                                            IconButton(
                                              onPressed: () => cart.updateQty(
                                                item.productId,
                                                item.variantId,
                                                item.deliveryMode,
                                                item.qty + 1,
                                              ),
                                              icon: const Icon(Icons.add),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                    trailing: Column(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          '${item.lineTotal.toStringAsFixed(2)} €',
                                          style: const TextStyle(
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                        IconButton(
                                          onPressed: () => cart.removeItem(
                                            item.productId,
                                            item.variantId,
                                            item.deliveryMode,
                                          ),
                                          icon: const Icon(Icons.close),
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                    ),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.94),
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(20),
                        ),
                      ),
                      child: SafeArea(
                        top: false,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Row(
                              children: [
                                const Text(
                                  'Total',
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const Spacer(),
                                Text(
                                  '${cart.total.toStringAsFixed(2)} €',
                                  style: const TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton(
                                onPressed: cart.isEmpty
                                    ? null
                                    : () => Navigator.of(
                                        context,
                                      ).pushNamed('/boutique/checkout'),
                                child: const Text('Passer commande'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}
