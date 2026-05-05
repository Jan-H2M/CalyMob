import 'package:flutter/material.dart';

import '../../widgets/ocean/ocean_gradient_background.dart';
import 'boutique_feature_guard.dart';

class BoutiqueScreen extends StatelessWidget {
  const BoutiqueScreen({super.key});

  static const List<String> _categories = [
    'Carnets',
    'Brevets',
    'Vêtements',
    'Accessoires',
    'Abonnements',
    'Autre',
  ];

  @override
  Widget build(BuildContext context) {
    return BoutiqueFeatureGuard(
      child: Scaffold(
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          title: const Text('Boutique'),
          backgroundColor: Colors.transparent,
          elevation: 0,
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () => Navigator.of(context).pushNamed('/boutique/cart'),
          icon: const Icon(Icons.shopping_cart_checkout),
          label: const Text('Panier'),
        ),
        body: OceanGradientBackground(
          creatures: CreatureSet.fishAndBubbles,
          child: SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              children: [
                Text(
                  'Catalogue Boutique v2',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Sélectionnez une catégorie puis un article. TODO: brancher le vrai flux Firestore.',
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: Colors.white70),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  height: 48,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemBuilder: (context, index) => Chip(
                      label: Text(_categories[index]),
                      backgroundColor: Colors.white.withValues(alpha: 0.88),
                    ),
                    separatorBuilder: (_, __) => const SizedBox(width: 10),
                    itemCount: _categories.length,
                  ),
                ),
                const SizedBox(height: 20),
                ...List.generate(6, (index) {
                  final productId = 'placeholder-${index + 1}';
                  return Card(
                    margin: const EdgeInsets.only(bottom: 14),
                    child: ListTile(
                      leading: Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          color: Colors.blueGrey.shade100,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.storefront_outlined),
                      ),
                      title: Text('Produit placeholder ${index + 1}'),
                      subtitle: const Text(
                        'TODO: connecter products published',
                      ),
                      trailing: const Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '24,90 €',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          Text('Voir'),
                        ],
                      ),
                      onTap: () => Navigator.of(
                        context,
                      ).pushNamed('/boutique/product/$productId'),
                    ),
                  );
                }),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
