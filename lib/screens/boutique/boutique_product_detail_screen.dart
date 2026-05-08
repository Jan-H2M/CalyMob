import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/firebase_config.dart';
import '../../models/boutique_product.dart';
import '../../providers/catalog_provider.dart';
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
  BoutiqueDeliveryMode? _selectedDeliveryMode;
  int _quantity = 1;

  @override
  Widget build(BuildContext context) {
    final catalog = context.watch<CatalogProvider>();
    final product = catalog.getProductById(widget.productId);

    // Ensure catalog is listening
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      catalog.listenToCatalog(clubId: FirebaseConfig.defaultClubId);
    });

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
            child: product == null
                ? const Center(
                    child: Text(
                      'Produit introuvable.',
                      style: TextStyle(color: Colors.white),
                    ),
                  )
                : _ProductDetailContent(
                    product: product,
                    selectedDeliveryMode: _selectedDeliveryMode,
                    quantity: _quantity,
                    onDeliveryModeChanged: (mode) =>
                        setState(() => _selectedDeliveryMode = mode),
                    onQuantityChanged: (qty) =>
                        setState(() => _quantity = qty),
                  ),
          ),
        ),
      ),
    );
  }
}

class _ProductDetailContent extends StatelessWidget {
  final BoutiqueProduct product;
  final BoutiqueDeliveryMode? selectedDeliveryMode;
  final int quantity;
  final ValueChanged<BoutiqueDeliveryMode?> onDeliveryModeChanged;
  final ValueChanged<int> onQuantityChanged;

  const _ProductDetailContent({
    required this.product,
    required this.selectedDeliveryMode,
    required this.quantity,
    required this.onDeliveryModeChanged,
    required this.onQuantityChanged,
  });

  @override
  Widget build(BuildContext context) {
    final images = product.images;
    final variants = product.variants;
    final deliveryModes = product.deliveryModes;
    final inventoryMode = product.inventoryMode;
    final selectedVariant = _resolveInitialVariant(variants);
    final selectedDelivery = _resolveInitialDelivery(deliveryModes);

    if (selectedDelivery == null) {
      return const Center(
        child: Text(
          'Produit indisponible.',
          style: TextStyle(color: Colors.white),
        ),
      );
    }

    final maxQty = _maxQtyForVariant(
      variant: selectedVariant,
      inventoryMode: inventoryMode,
    );
    final unitPrice = _resolveVariantPrice(product, selectedVariant);
    final computedPrice = unitPrice * quantity;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        SizedBox(
          height: 220,
          child: images.isEmpty
              ? Card(
                  child: Container(
                    alignment: Alignment.center,
                    child: const Icon(Icons.photo_library_outlined, size: 56),
                  ),
                )
              : PageView.builder(
                  itemCount: images.length,
                  itemBuilder: (_, index) => Card(
                    clipBehavior: Clip.antiAlias,
                    child: Image.network(
                      images[index],
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        color: Colors.blueGrey.shade100,
                        alignment: Alignment.center,
                        child: const Icon(Icons.broken_image_outlined, size: 48),
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
                  product.name,
                  style: Theme.of(context)
                      .textTheme
                      .headlineSmall
                      ?.copyWith(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  '${computedPrice.toStringAsFixed(2)} €',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: Colors.teal.shade700,
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 12),
                Text(
                  product.description.isNotEmpty
                      ? product.description
                      : 'Aucune description disponible.',
                ),
                const SizedBox(height: 20),
                DropdownButtonFormField<String>(
                  initialValue: selectedVariant.id,
                  decoration: const InputDecoration(labelText: 'Variant'),
                  items: variants
                      .map(
                        (v) => DropdownMenuItem<String>(
                          value: v.id,
                          child: Text(v.label),
                        ),
                      )
                      .toList(),
                  onChanged: (value) {
                    if (value == null) return;
                    onQuantityChanged(1);
                  },
                ),
                const SizedBox(height: 12),
                Text(
                  _stockLabel(variant: selectedVariant, inventoryMode: inventoryMode),
                  style: TextStyle(
                    color: _stockColor(variant: selectedVariant, inventoryMode: inventoryMode),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    const Text('Quantité',
                        style: TextStyle(fontWeight: FontWeight.w600)),
                    const Spacer(),
                    IconButton(
                      onPressed: quantity > 1
                          ? () => onQuantityChanged(quantity - 1)
                          : null,
                      icon: const Icon(Icons.remove_circle_outline),
                    ),
                    Text(
                      '$quantity',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    IconButton(
                      onPressed: maxQty != null && quantity >= maxQty
                          ? null
                          : () => onQuantityChanged(quantity + 1),
                      icon: const Icon(Icons.add_circle_outline),
                    ),
                  ],
                ),
                if (maxQty != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      'Maximum disponible: $maxQty',
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: Colors.grey.shade700),
                    ),
                  ),
                const SizedBox(height: 20),
                const Text('Mode de livraison',
                    style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 10,
                  children: deliveryModes.map((mode) {
                    return ChoiceChip(
                      label: Text(mode.label),
                      selected: mode == selectedDelivery,
                      onSelected: (_) => onDeliveryModeChanged(mode),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Ajout au panier à implémenter.'),
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
    );
  }

  BoutiqueProductVariant _resolveInitialVariant(List<BoutiqueProductVariant> variants) {
    return variants.isNotEmpty ? variants.first : (null as dynamic);
  }

  BoutiqueDeliveryMode? _resolveInitialDelivery(List<BoutiqueDeliveryMode> modes) {
    return modes.isNotEmpty ? modes.first : null;
  }
}

int? _maxQtyForVariant({
  required BoutiqueProductVariant variant,
  required BoutiqueInventoryMode inventoryMode,
}) {
  if (inventoryMode != BoutiqueInventoryMode.tracked || variant.allowBackorder) return null;
  return variant.stockCount == null
      ? null
      : variant.stockCount!.clamp(0, 999999);
}

String _stockLabel({
  required BoutiqueProductVariant variant,
  required BoutiqueInventoryMode inventoryMode,
}) {
  if (inventoryMode == BoutiqueInventoryMode.preorder) return 'Précommande';
  final stock = variant.stockCount ?? 0;
  if (stock <= 0 && variant.allowBackorder) return 'Précommande';
  if (stock <= 3) return stock <= 0 ? 'Rupture de stock' : 'Plus que $stock';
  return 'En stock';
}

Color _stockColor({
  required BoutiqueProductVariant variant,
  required BoutiqueInventoryMode inventoryMode,
}) {
  if (inventoryMode == BoutiqueInventoryMode.preorder) return Colors.orange;
  final stock = variant.stockCount ?? 0;
  if (stock <= 0 && variant.allowBackorder) return Colors.orange;
  if (stock <= 3) return stock <= 0 ? Colors.red : Colors.orange;
  return Colors.green;
}

double _resolveVariantPrice(BoutiqueProduct product, BoutiqueProductVariant variant) {
  if (variant.salePriceOverride != null) return variant.salePriceOverride!;
  return product.salePrice;
}
