import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../providers/boutique_cart_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'boutique_checkout_screen.dart';

class BoutiqueCartScreen extends StatelessWidget {
  const BoutiqueCartScreen({super.key});

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
          'Panier',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          Consumer<BoutiqueCartProvider>(
            builder: (context, cart, _) {
              if (cart.isEmpty) return const SizedBox.shrink();
              return IconButton(
                icon: const Icon(Icons.delete_sweep_outlined),
                tooltip: 'Vider le panier',
                onPressed: () => _confirmClearCart(context, cart),
              );
            },
          ),
        ],
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.bubbles,
        child: SafeArea(
          child: Consumer<BoutiqueCartProvider>(
            builder: (context, cart, _) {
              if (!cart.loaded) {
                return const Center(
                  child: CircularProgressIndicator(color: Colors.white),
                );
              }

              if (cart.isEmpty) {
                return const _EmptyCart();
              }

              return Column(
                children: [
                  Expanded(
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                      itemBuilder: (context, index) {
                        final item = cart.items[index];
                        return _CartItemCard(
                          item: item,
                          formatter: formatter,
                          onQtyChanged: (qty) => cart.updateQty(item.key, qty),
                          onDelete: () => _confirmRemoveItem(
                            context,
                            cart,
                            item,
                          ),
                        );
                      },
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemCount: cart.items.length,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.12),
                          blurRadius: 16,
                          offset: const Offset(0, -4),
                        ),
                      ],
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
                                  color: AppColors.donkerblauw,
                                  fontWeight: FontWeight.w900,
                                  fontSize: 18,
                                ),
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
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton.icon(
                              onPressed: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        const BoutiqueCheckoutScreen(),
                                  ),
                                );
                              },
                              icon: const Icon(Icons.check_circle_outline),
                              label: const Text('Continuer'),
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
    );
  }

  Future<void> _confirmClearCart(
    BuildContext context,
    BoutiqueCartProvider cart,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Vider le panier ?'),
        content: const Text('Tous les articles seront supprimés.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Vider'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await cart.clear();
    }
  }

  Future<void> _confirmRemoveItem(
    BuildContext context,
    BoutiqueCartProvider cart,
    BoutiqueCartItem item,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Supprimer cet article ?'),
        content: Text(item.productName),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await cart.removeItem(item.key);
    }
  }
}

class _CartItemCard extends StatelessWidget {
  final BoutiqueCartItem item;
  final NumberFormat formatter;
  final ValueChanged<int> onQtyChanged;
  final VoidCallback onDelete;

  const _CartItemCard({
    required this.item,
    required this.formatter,
    required this.onQtyChanged,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Container(
                width: 72,
                height: 72,
                color: AppColors.surfaceGrey,
                child: item.imageUrl == null
                    ? const Icon(
                        Icons.shopping_bag_outlined,
                        color: AppColors.middenblauw,
                      )
                    : Image.network(
                        item.imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const Icon(
                          Icons.shopping_bag_outlined,
                          color: AppColors.middenblauw,
                        ),
                      ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          item.productName,
                          style: const TextStyle(
                            color: AppColors.donkerblauw,
                            fontWeight: FontWeight.w900,
                            fontSize: 16,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Supprimer',
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints.tightFor(
                          width: 32,
                          height: 32,
                        ),
                        visualDensity: VisualDensity.compact,
                        onPressed: onDelete,
                        icon: const Icon(Icons.delete_outline, size: 20),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '${item.variantLabel} · ${item.deliveryLabel}',
                    style: TextStyle(color: Colors.grey.shade700),
                  ),
                  if (item.hasPersonalization) ...[
                    const SizedBox(height: 8),
                    _PersonalizationSummary(
                      personalization: item.personalization,
                    ),
                  ],
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      IconButton(
                        onPressed: () => onQtyChanged(item.qty - 1),
                        visualDensity: VisualDensity.compact,
                        icon: const Icon(Icons.remove_circle_outline),
                      ),
                      SizedBox(
                        width: 28,
                        child: Text(
                          '${item.qty}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontWeight: FontWeight.w900),
                        ),
                      ),
                      IconButton(
                        onPressed: () => onQtyChanged(item.qty + 1),
                        visualDensity: VisualDensity.compact,
                        icon: const Icon(Icons.add_circle_outline),
                      ),
                      const Spacer(),
                      Text(
                        formatter.format(item.lineTotal),
                        style: const TextStyle(
                          color: AppColors.oranje,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PersonalizationSummary extends StatelessWidget {
  final Map<String, dynamic> personalization;

  const _PersonalizationSummary({required this.personalization});

  @override
  Widget build(BuildContext context) {
    final lines = <String>[];
    final technique = personalization['technique']?.toString();
    if (technique != null) {
      lines.add(technique == 'print' ? 'Impression' : 'Broderie');
    }
    final logo = personalization['clubLogo'];
    if (logo is Map && logo['zone'] != null) {
      lines.add('Logo: ${logo['zone']}');
    }
    final name = personalization['name'];
    if (name is Map && name['text'] != null) {
      lines.add('Nom: ${name['text']} (${name['zone']})');
    }
    final certification = personalization['certification'];
    if (certification is Map && certification['value'] != null) {
      lines.add('Brevet: ${certification['value']} (${certification['zone']})');
    }

    return Text(
      lines.join('\n'),
      style: TextStyle(
        color: Colors.grey.shade700,
        fontSize: 12.5,
        height: 1.25,
      ),
    );
  }
}

class _EmptyCart extends StatelessWidget {
  const _EmptyCart();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.shopping_bag_outlined,
              color: Colors.white.withValues(alpha: 0.75),
              size: 68,
            ),
            const SizedBox(height: 16),
            const Text(
              'Votre panier est vide',
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
