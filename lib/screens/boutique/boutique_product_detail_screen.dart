import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/firebase_config.dart';
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
  String? _selectedVariantId;
  DeliveryMode? _selectedDeliveryMode;
  int _quantity = 1;

  @override
  Widget build(BuildContext context) {
    final productStream = FirebaseFirestore.instance
        .collection('clubs')
        .doc(FirebaseConfig.defaultClubId)
        .collection('products')
        .doc(widget.productId)
        .snapshots();

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
            child: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
              stream: productStream,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(
                    child: CircularProgressIndicator(color: Colors.white),
                  );
                }

                if (snapshot.hasError) {
                  return Center(
                    child: Text(
                      'Erreur produit: ${snapshot.error}',
                      style: const TextStyle(color: Colors.white),
                    ),
                  );
                }

                final data = snapshot.data?.data();
                if (data == null) {
                  return const Center(
                    child: Text(
                      'Produit introuvable.',
                      style: TextStyle(color: Colors.white),
                    ),
                  );
                }

                final images = _asStringList(data['images']);
                final variants = _asVariantList(data['variants']);
                final deliveryModes = _asDeliveryModes(data['deliveryModes']);
                final inventoryMode = data['inventoryMode']?.toString() ?? 'tracked';
                final selectedVariant = _syncSelectedVariant(variants);
                final selectedDeliveryMode = _syncSelectedDeliveryMode(
                  deliveryModes,
                );

                if (selectedVariant == null || selectedDeliveryMode == null) {
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
                if (maxQty != null && _quantity > maxQty) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (mounted) {
                      setState(() => _quantity = maxQty.clamp(1, maxQty) as int);
                    }
                  });
                }

                final unitPrice = _resolveVariantPrice(data, selectedVariant);
                final computedPrice = unitPrice * _quantity;

                return ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                  children: [
                    SizedBox(
                      height: 220,
                      child: images.isEmpty
                          ? Card(
                              child: Container(
                                alignment: Alignment.center,
                                child: const Icon(
                                  Icons.photo_library_outlined,
                                  size: 56,
                                ),
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
                                    child: const Icon(
                                      Icons.broken_image_outlined,
                                      size: 48,
                                    ),
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
                              data['name']?.toString() ?? 'Produit',
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
                            Text(
                              data['description']?.toString() ??
                                  'Aucune description disponible.',
                            ),
                            const SizedBox(height: 20),
                            DropdownButtonFormField<String>(
                              value: selectedVariant.id,
                              decoration: const InputDecoration(
                                labelText: 'Variant',
                              ),
                              items: variants
                                  .map(
                                    (variant) => DropdownMenuItem<String>(
                                      value: variant.id,
                                      child: Text(variant.label),
                                    ),
                                  )
                                  .toList(),
                              onChanged: (value) {
                                if (value == null) return;
                                setState(() {
                                  _selectedVariantId = value;
                                  _quantity = 1;
                                });
                              },
                            ),
                            const SizedBox(height: 12),
                            _StockBadge(
                              label: _stockLabel(
                                variant: selectedVariant,
                                inventoryMode: inventoryMode,
                              ),
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
                                  onPressed: maxQty != null && _quantity >= maxQty
                                      ? null
                                      : () => setState(() => _quantity += 1),
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
                            const Text(
                              'Mode de livraison',
                              style: TextStyle(fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 10),
                            Wrap(
                              spacing: 10,
                              children: deliveryModes.map((mode) {
                                return ChoiceChip(
                                  label: Text(mode.label),
                                  selected: mode == selectedDeliveryMode,
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
                                onPressed: () async {
                                  final snapshotData = {
                                    'name': data['name']?.toString() ?? 'Produit',
                                    'variantLabel': selectedVariant.label,
                                    'unitPrice': unitPrice,
                                    'imageUrl': images.firstOrNull,
                                    'category': data['category']?.toString(),
                                  };

                                  await context.read<CartProvider>().addItem(
                                    widget.productId,
                                    selectedVariant.id,
                                    _quantity,
                                    selectedDeliveryMode,
                                    snapshotData,
                                  );

                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('Produit ajouté au panier.'),
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
              },
            ),
          ),
        ),
      ),
    );
  }

  _Variant? _syncSelectedVariant(List<_Variant> variants) {
    if (variants.isEmpty) return null;
    final selected = variants.where((variant) => variant.id == _selectedVariantId);
    if (selected.isEmpty) {
      _selectedVariantId = variants.first.id;
      return variants.first;
    }
    return selected.first;
  }

  DeliveryMode? _syncSelectedDeliveryMode(List<DeliveryMode> deliveryModes) {
    if (deliveryModes.isEmpty) return null;
    if (_selectedDeliveryMode == null ||
        !deliveryModes.contains(_selectedDeliveryMode)) {
      _selectedDeliveryMode = deliveryModes.first;
    }
    return _selectedDeliveryMode;
  }
}

class _Variant {
  final String id;
  final String label;
  final int? stockCount;
  final bool allowBackorder;
  final double? salePriceOverride;

  const _Variant({
    required this.id,
    required this.label,
    required this.stockCount,
    required this.allowBackorder,
    required this.salePriceOverride,
  });
}

class _StockBadge extends StatelessWidget {
  final String label;

  const _StockBadge({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.teal.shade50,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: Colors.teal.shade900,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

List<String> _asStringList(Object? value) {
  if (value is! List) return const <String>[];
  return value.map((entry) => entry.toString()).toList();
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

int? _asInt(Object? value) {
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '');
}

List<_Variant> _asVariantList(Object? value) {
  if (value is! List) return const <_Variant>[];
  return value.map((entry) {
    final map = _asMap(entry);
    return _Variant(
      id: map['id']?.toString() ?? '',
      label: map['label']?.toString() ?? 'Standard',
      stockCount: _asInt(map['stockCount']),
      allowBackorder: map['allowBackorder'] == true,
      salePriceOverride: map['salePriceOverride'] == null
          ? null
          : _asDouble(map['salePriceOverride']),
    );
  }).where((variant) => variant.id.isNotEmpty).toList();
}

List<DeliveryMode> _asDeliveryModes(Object? value) {
  if (value is! List) return const <DeliveryMode>[DeliveryMode.poolPickup];
  final modes = value
      .map((entry) => DeliveryModeCodec.fromWireValue(entry?.toString()))
      .whereType<DeliveryMode>()
      .toList();
  return modes.isEmpty ? const <DeliveryMode>[DeliveryMode.poolPickup] : modes;
}

double _resolveVariantPrice(Map<String, dynamic> data, _Variant variant) {
  if (variant.salePriceOverride != null) return variant.salePriceOverride!;
  final pricing = _asMap(data['pricing']);
  if (pricing['salePriceOverride'] != null) {
    return _asDouble(pricing['salePriceOverride']);
  }
  return _asDouble(pricing['salePrice']);
}

int? _maxQtyForVariant({
  required _Variant variant,
  required String inventoryMode,
}) {
  if (inventoryMode != 'tracked' || variant.allowBackorder) return null;
  return variant.stockCount == null
      ? null
      : variant.stockCount!.clamp(0, 999999) as int;
}

String _stockLabel({
  required _Variant variant,
  required String inventoryMode,
}) {
  if (inventoryMode == 'preorder') {
    return 'Précommande';
  }

  final stock = variant.stockCount ?? 0;
  if (stock <= 0 && variant.allowBackorder) {
    return 'Précommande';
  }
  if (stock <= 3) {
    return stock <= 0 ? 'Rupture de stock' : 'Plus que $stock';
  }
  return 'En stock';
}

extension on List<String> {
  String? get firstOrNull => isEmpty ? null : first;
}
