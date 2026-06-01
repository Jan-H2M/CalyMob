import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/boutique/boutique_product.dart';
import '../../providers/boutique_cart_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/boutique/boutique_service.dart';
import '../../utils/club_role_utils.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'boutique_cart_screen.dart';
import 'boutique_product_detail_screen.dart';
import 'mes_commandes_screen.dart';
import '../stock/material_returns_screen.dart';
import '../profile/ma_cotisation_screen.dart';

class BoutiqueScreen extends StatefulWidget {
  const BoutiqueScreen({super.key});

  @override
  State<BoutiqueScreen> createState() => _BoutiqueScreenState();
}

class _BoutiqueScreenState extends State<BoutiqueScreen> {
  @override
  Widget build(BuildContext context) {
    final memberProvider = context.watch<MemberProvider>();
    final showMaterialReturns = _canOpenMaterialReturns(memberProvider);

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Boutique',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.fishAndBubbles,
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
            children: [
              Text(
                'Articles club, vêtements, abonnements et accessoires.',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.84),
                  fontSize: 15,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 22),
              _BoutiqueHomeCard(
                icon: Icons.receipt_long_outlined,
                title: 'Mes commandes',
                subtitle: 'Suivre les commandes et retrouver les paiements.',
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const MesCommandesScreen(),
                    ),
                  );
                },
              ),
              const SizedBox(height: 12),
              Consumer<BoutiqueCartProvider>(
                builder: (context, cart, _) {
                  final subtitle = cart.isEmpty
                      ? 'Votre panier est vide.'
                      : '${cart.itemCount} article(s) en attente.';
                  return _BoutiqueHomeCard(
                    icon: Icons.shopping_bag_outlined,
                    title: 'Mon panier',
                    subtitle: subtitle,
                    badge: cart.isEmpty ? null : '${cart.itemCount}',
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => const BoutiqueCartScreen(),
                        ),
                      );
                    },
                  );
                },
              ),
              const SizedBox(height: 12),
              _BoutiqueHomeCard(
                icon: Icons.storefront_outlined,
                title: 'Produits',
                subtitle: 'Parcourir le catalogue Boutique.',
                emphasized: true,
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const BoutiqueProductsScreen(),
                    ),
                  );
                },
              ),
              const SizedBox(height: 26),
              Container(
                height: 1,
                margin: const EdgeInsets.symmetric(horizontal: 4),
                color: Colors.white.withValues(alpha: 0.42),
              ),
              const SizedBox(height: 22),
              _BoutiqueHomeCard(
                icon: Icons.card_membership_outlined,
                title: 'Ma cotisation',
                subtitle: 'Consulter et payer votre cotisation membre.',
                emphasized: true,
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const MaCotisationScreen(),
                    ),
                  );
                },
              ),
              if (showMaterialReturns) ...[
                const SizedBox(height: 12),
                _BoutiqueHomeCard(
                  icon: Icons.assignment_return_outlined,
                  title: 'Prêts matériel',
                  subtitle:
                      'Valider les retours et créer le remboursement caution.',
                  emphasized: true,
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const MaterialReturnsScreen(),
                      ),
                    );
                  },
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  bool _canOpenMaterialReturns(MemberProvider memberProvider) {
    final role = memberProvider.appRole?.toLowerCase();
    if (role == 'admin' || role == 'superadmin' || role == 'validateur') {
      return true;
    }

    final roles = ClubRoleUtils.normalizeRoles(memberProvider.clubStatuten);
    return roles.contains('gonflage') ||
        roles.contains('ca') ||
        roles.contains('encadrant');
  }
}

class BoutiqueProductsScreen extends StatefulWidget {
  const BoutiqueProductsScreen({super.key});

  @override
  State<BoutiqueProductsScreen> createState() => _BoutiqueProductsScreenState();
}

class _BoutiqueProductsScreenState extends State<BoutiqueProductsScreen> {
  final BoutiqueService _service = BoutiqueService();
  BoutiqueProductCategory? _selectedCategory;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Boutique',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.fishAndBubbles,
        child: SafeArea(
          child: StreamBuilder<List<BoutiqueProduct>>(
            stream: _service.watchPublishedProducts(
              FirebaseConfig.defaultClubId,
            ),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(
                  child: CircularProgressIndicator(color: Colors.white),
                );
              }

              final products = snapshot.data ?? const <BoutiqueProduct>[];
              final filteredProducts = _selectedCategory == null
                  ? products
                  : products
                      .where((product) => product.category == _selectedCategory)
                      .toList();

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                    child: Text(
                      'Articles club, vêtements, abonnements et accessoires.',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.82),
                        fontSize: 15,
                        height: 1.35,
                      ),
                    ),
                  ),
                  _CategoryFilter(
                    categories: products
                        .map((product) => product.category)
                        .toSet()
                        .where((category) =>
                            category != BoutiqueProductCategory.autre)
                        .toList()
                      ..sort((a, b) => boutiqueCategoryLabel(a)
                          .compareTo(boutiqueCategoryLabel(b))),
                    selectedCategory: _selectedCategory,
                    onSelected: (category) {
                      setState(() => _selectedCategory = category);
                    },
                  ),
                  const SizedBox(height: 8),
                  Expanded(
                    child: filteredProducts.isEmpty
                        ? const _EmptyBoutiqueState()
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                            itemBuilder: (context, index) {
                              final product = filteredProducts[index];
                              return _ProductCard(
                                product: product,
                                onTap: () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) =>
                                          BoutiqueProductDetailScreen(
                                        product: product,
                                      ),
                                    ),
                                  );
                                },
                              );
                            },
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 12),
                            itemCount: filteredProducts.length,
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
}

class _BoutiqueHomeCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final String? badge;
  final bool emphasized;
  final VoidCallback onTap;

  const _BoutiqueHomeCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.badge,
    this.emphasized = false,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 58,
                height: 58,
                decoration: BoxDecoration(
                  color: emphasized
                      ? AppColors.middenblauw.withValues(alpha: 0.12)
                      : AppColors.surfaceGrey,
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(
                  icon,
                  color: AppColors.middenblauw,
                  size: 30,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: const TextStyle(
                              color: AppColors.donkerblauw,
                              fontSize: 18,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        if (badge != null)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 9,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.oranje,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              badge!,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: Colors.grey.shade700,
                        height: 1.25,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(Icons.chevron_right, color: AppColors.middenblauw),
            ],
          ),
        ),
      ),
    );
  }
}

class _CategoryFilter extends StatelessWidget {
  final List<BoutiqueProductCategory> categories;
  final BoutiqueProductCategory? selectedCategory;
  final ValueChanged<BoutiqueProductCategory?> onSelected;

  const _CategoryFilter({
    required this.categories,
    required this.selectedCategory,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemBuilder: (context, index) {
          if (index == 0) {
            return _FilterChip(
              label: 'Tout',
              selected: selectedCategory == null,
              onTap: () => onSelected(null),
            );
          }
          final category = categories[index - 1];
          return _FilterChip(
            label: _boutiqueCategoryShortLabel(category),
            selected: selectedCategory == category,
            onTap: () => onSelected(category),
          );
        },
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemCount: categories.length + 1,
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        alignment: Alignment.center,
        constraints: const BoxConstraints(minWidth: 54),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: selected ? Colors.white : Colors.white.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: Colors.white.withValues(alpha: 0.3)),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? AppColors.donkerblauw : Colors.white,
            fontWeight: FontWeight.w700,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}

String _boutiqueCategoryShortLabel(BoutiqueProductCategory category) {
  switch (category) {
    case BoutiqueProductCategory.brevetsFormations:
      return 'Brev.';
    case BoutiqueProductCategory.vetements:
      return 'Vêt.';
    case BoutiqueProductCategory.accessoiresClub:
      return 'Acc.';
    case BoutiqueProductCategory.abonnements:
      return 'Abonn.';
    case BoutiqueProductCategory.produitsDigitaux:
      return 'Digit.';
    case BoutiqueProductCategory.autre:
      return 'Autre';
  }
}

class _ProductCard extends StatelessWidget {
  final BoutiqueProduct product;
  final VoidCallback onTap;

  const _ProductCard({
    required this.product,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(
      locale: 'fr_BE',
      symbol: '€',
      decimalDigits: 2,
    );
    final imageUrl = _firstNetworkImage(product.images);

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  width: 84,
                  height: 84,
                  color: AppColors.surfaceGrey,
                  child: imageUrl == null
                      ? const Icon(
                          Icons.shopping_bag_outlined,
                          color: AppColors.middenblauw,
                          size: 34,
                        )
                      : Image.network(
                          imageUrl,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(
                            Icons.shopping_bag_outlined,
                            color: AppColors.middenblauw,
                            size: 34,
                          ),
                        ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      boutiqueCategoryLabel(product.category),
                      style: TextStyle(
                        color: AppColors.middenblauw.withValues(alpha: 0.9),
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.donkerblauw,
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      formatter.format(product.pricing.effectivePrice),
                      style: const TextStyle(
                        color: AppColors.oranje,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.middenblauw),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyBoutiqueState extends StatelessWidget {
  const _EmptyBoutiqueState();

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
              size: 64,
              color: Colors.white.withValues(alpha: 0.72),
            ),
            const SizedBox(height: 16),
            const Text(
              'Aucun produit disponible',
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Les produits publiés apparaîtront ici.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white.withValues(alpha: 0.75)),
            ),
          ],
        ),
      ),
    );
  }
}

String? _firstNetworkImage(List<String> images) {
  for (final imageUrl in images) {
    final resolved = _resolveProductImageUrl(imageUrl);
    if (resolved != null) return resolved;
  }
  return null;
}

String? _resolveProductImageUrl(String imageUrl) {
  final trimmed = imageUrl.trim();
  if (trimmed.isEmpty) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return 'https://caly.club$trimmed';
  }
  return null;
}
