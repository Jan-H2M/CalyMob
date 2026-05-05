import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../config/firebase_config.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'boutique_feature_guard.dart';
import 'boutique_product_detail_screen.dart';

class BoutiqueScreen extends StatefulWidget {
  const BoutiqueScreen({super.key});

  @override
  State<BoutiqueScreen> createState() => _BoutiqueScreenState();
}

class _BoutiqueScreenState extends State<BoutiqueScreen> {
  String? _selectedCategory;

  @override
  Widget build(BuildContext context) {
    final productsStream = FirebaseFirestore.instance
        .collection('clubs')
        .doc(FirebaseConfig.defaultClubId)
        .collection('products')
        .where('visibility', isEqualTo: 'published')
        .snapshots();

    return BoutiqueFeatureGuard(
      child: Scaffold(
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          title: const Text('Boutique'),
          backgroundColor: Colors.transparent,
          elevation: 0,
          actions: [
            IconButton(
              onPressed: () => Navigator.of(context).pushNamed('/profile/orders'),
              icon: const Icon(Icons.receipt_long),
              tooltip: 'Mes commandes',
            ),
          ],
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () => Navigator.of(context).pushNamed('/boutique/cart'),
          icon: const Icon(Icons.shopping_cart_checkout),
          label: const Text('Panier'),
        ),
        body: OceanGradientBackground(
          creatures: CreatureSet.fishAndBubbles,
          child: SafeArea(
            child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: productsStream,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(
                    child: CircularProgressIndicator(color: Colors.white),
                  );
                }

                if (snapshot.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'Erreur catalogue: ${snapshot.error}',
                        style: const TextStyle(color: Colors.white),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  );
                }

                final products = snapshot.data?.docs
                        .map((doc) => _BoutiqueProductCardData.fromSnapshot(doc))
                        .toList() ??
                    const <_BoutiqueProductCardData>[];

                if (products.isEmpty) {
                  return const Center(
                    child: Text(
                      'Aucun produit disponible.',
                      style: TextStyle(color: Colors.white),
                    ),
                  );
                }

                final categories = products
                    .map((product) => product.category)
                    .where((category) => category.isNotEmpty)
                    .toSet()
                    .toList()
                  ..sort();

                if (_selectedCategory != null &&
                    !categories.contains(_selectedCategory)) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (mounted) {
                      setState(() => _selectedCategory = null);
                    }
                  });
                }

                final grouped = <String, List<_BoutiqueProductCardData>>{};
                for (final product in products) {
                  if (_selectedCategory != null &&
                      product.category != _selectedCategory) {
                    continue;
                  }
                  grouped.putIfAbsent(product.category, () => []).add(product);
                }

                final visibleCategories = grouped.keys.toList()..sort();

                return ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                  children: [
                    Text(
                      'Catalogue Boutique',
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Choisissez un article, sélectionnez une variante puis validez votre commande.',
                      style: Theme.of(
                        context,
                      ).textTheme.bodyMedium?.copyWith(color: Colors.white70),
                    ),
                    const SizedBox(height: 20),
                    SizedBox(
                      height: 48,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: categories.length + 1,
                        separatorBuilder: (_, __) => const SizedBox(width: 10),
                        itemBuilder: (context, index) {
                          if (index == 0) {
                            return ChoiceChip(
                              label: Text('Tous · ${products.length}'),
                              selected: _selectedCategory == null,
                              onSelected: (_) {
                                setState(() => _selectedCategory = null);
                              },
                              backgroundColor: Colors.white.withValues(alpha: 0.88),
                            );
                          }

                          final category = categories[index - 1];
                          final count = products
                              .where((product) => product.category == category)
                              .length;
                          return ChoiceChip(
                            label: Text('${_formatCategory(category)} · $count'),
                            selected: _selectedCategory == category,
                            onSelected: (_) {
                              setState(() => _selectedCategory = category);
                            },
                            backgroundColor: Colors.white.withValues(alpha: 0.88),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 20),
                    for (final category in visibleCategories) ...[
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Text(
                          _formatCategory(category),
                          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      ...grouped[category]!.map((product) {
                        return Card(
                          margin: const EdgeInsets.only(bottom: 14),
                          child: ListTile(
                            leading: _ProductThumb(imageUrl: product.imageUrl),
                            title: Text(product.name),
                            subtitle: Text(_formatCategory(product.category)),
                            trailing: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  '${product.salePrice.toStringAsFixed(2)} €',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const Text('Voir'),
                              ],
                            ),
                            onTap: () {
                              Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                  builder: (_) => BoutiqueProductDetailScreen(
                                    productId: product.id,
                                  ),
                                ),
                              );
                            },
                          ),
                        );
                      }),
                    ],
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

class _BoutiqueProductCardData {
  final String id;
  final String name;
  final String category;
  final double salePrice;
  final String? imageUrl;

  const _BoutiqueProductCardData({
    required this.id,
    required this.name,
    required this.category,
    required this.salePrice,
    required this.imageUrl,
  });

  factory _BoutiqueProductCardData.fromSnapshot(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data();
    return _BoutiqueProductCardData(
      id: doc.id,
      name: data['name']?.toString() ?? 'Produit',
      category: data['category']?.toString() ?? 'autre',
      salePrice: _resolveProductPrice(data),
      imageUrl: _asStringList(data['images']).firstOrNull,
    );
  }
}

class _ProductThumb extends StatelessWidget {
  final String? imageUrl;

  const _ProductThumb({required this.imageUrl});

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
        child: const Icon(Icons.storefront_outlined),
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

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return const <String, dynamic>{};
}

List<String> _asStringList(Object? value) {
  if (value is! List) return const <String>[];
  return value.map((entry) => entry.toString()).toList();
}

double _asDouble(Object? value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

double _resolveProductPrice(Map<String, dynamic> data) {
  final pricing = _asMap(data['pricing']);
  final override = pricing['salePriceOverride'];
  if (override != null) return _asDouble(override);
  return _asDouble(pricing['salePrice']);
}

String _formatCategory(String category) {
  switch (category) {
    case 'carnet':
      return 'Carnets';
    case 'formation':
      return 'Brevets';
    case 'vetement':
      return 'Vêtements';
    case 'abonnement':
      return 'Abonnements';
    case 'autre':
      return 'Autre';
    default:
      return category.isEmpty
          ? 'Autre'
          : '${category[0].toUpperCase()}${category.substring(1)}';
  }
}

extension on List<String> {
  String? get firstOrNull => isEmpty ? null : first;
}
