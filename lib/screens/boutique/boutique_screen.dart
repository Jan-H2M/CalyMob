import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/firebase_config.dart';
import '../../models/boutique_product.dart';
import '../../providers/catalog_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'boutique_feature_guard.dart';
import 'boutique_product_detail_screen.dart';

class BoutiqueScreen extends StatefulWidget {
  const BoutiqueScreen({super.key});

  @override
  State<BoutiqueScreen> createState() => _BoutiqueScreenState();
}

class _BoutiqueScreenState extends State<BoutiqueScreen> {
  bool _catalogListenerStarted = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _catalogListenerStarted) return;
      _catalogListenerStarted = true;
      context.read<CatalogProvider>().listenToCatalog(
        clubId: FirebaseConfig.defaultClubId,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
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
            child: Consumer<CatalogProvider>(
              builder: (context, catalog, _) {
                if (catalog.isLoading) {
                  return const Center(
                    child: CircularProgressIndicator(color: Colors.white),
                  );
                }

                if (catalog.error != null) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'Erreur catalogue: ${catalog.error}',
                        style: const TextStyle(color: Colors.white),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  );
                }

                final products = catalog.products;

                if (products.isEmpty) {
                  return const Center(
                    child: Text(
                      'Aucun produit disponible.',
                      style: TextStyle(color: Colors.white),
                    ),
                  );
                }

                final categories = catalog.availableCategories;

                if (catalog.categoryFilter != null &&
                    !categories.contains(catalog.categoryFilter)) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (mounted &&
                        context.read<CatalogProvider>().categoryFilter != null) {
                      context.read<CatalogProvider>().setCategoryFilter(null);
                    }
                  });
                }

                final grouped = <BoutiqueProductCategory, List<BoutiqueProduct>>{};
                for (final product in products) {
                  grouped.putIfAbsent(product.category, () => []).add(product);
                }

                final visibleCategories = grouped.keys.toList()
                  ..sort(
                    (a, b) => _formatCategory(a).compareTo(_formatCategory(b)),
                  );

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
                              label: Text('Tous · ${catalog.allProducts.length}'),
                              selected: catalog.categoryFilter == null,
                              onSelected: (_) {
                                catalog.setCategoryFilter(null);
                              },
                              backgroundColor: Colors.white.withValues(alpha: 0.88),
                            );
                          }

                          final category = categories[index - 1];
                          final count = catalog.allProducts
                              .where((product) => product.category == category)
                              .length;
                          return ChoiceChip(
                            label: Text('${_formatCategory(category)} · $count'),
                            selected: catalog.categoryFilter == category,
                            onSelected: (_) {
                              catalog.setCategoryFilter(category);
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
                            subtitle: Text(product.categoryLabel),
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

String _formatCategory(BoutiqueProductCategory category) {
  switch (category) {
    case BoutiqueProductCategory.carnet:
      return 'Carnets';
    case BoutiqueProductCategory.formation:
      return 'Brevets';
    case BoutiqueProductCategory.vetement:
      return 'Vêtements';
    case BoutiqueProductCategory.abonnement:
      return 'Abonnements';
    case BoutiqueProductCategory.autre:
      return 'Autre';
  }
}

extension on BoutiqueProduct {
  String? get imageUrl => images.firstOrNull;
}

extension on List<String> {
  String? get firstOrNull => isEmpty ? null : first;
}
