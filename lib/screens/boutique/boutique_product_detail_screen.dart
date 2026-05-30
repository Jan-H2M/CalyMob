import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../models/boutique/boutique_product.dart';
import '../../providers/boutique_cart_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class BoutiqueProductDetailScreen extends StatefulWidget {
  final BoutiqueProduct product;

  const BoutiqueProductDetailScreen({
    super.key,
    required this.product,
  });

  @override
  State<BoutiqueProductDetailScreen> createState() =>
      _BoutiqueProductDetailScreenState();
}

class _BoutiqueProductDetailScreenState
    extends State<BoutiqueProductDetailScreen> {
  BoutiqueVariant? _selectedVariant;
  late BoutiqueDeliveryMode _selectedDeliveryMode;
  BoutiquePersonalizationSelection _personalization =
      const BoutiquePersonalizationSelection();
  int _quantity = 1;

  @override
  void initState() {
    super.initState();
    _selectedVariant = widget.product.variants.isNotEmpty
        ? widget.product.variants.first
        : null;
    _selectedDeliveryMode = widget.product.deliveryModes.first;
    _quantity = _minimumQuantity;
  }

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(
      locale: 'fr_BE',
      symbol: '€',
      decimalDigits: 2,
    );
    final personalizationSurcharge =
        _personalization.surcharge(widget.product.personalization);
    final deliverySurcharge =
        widget.product.deliverySurcharges[_selectedDeliveryMode] ?? 0;
    final unitPrice = widget.product.priceForVariant(_selectedVariant) +
        personalizationSurcharge;
    final orderTotal = (unitPrice * _quantity) + deliverySurcharge;
    final maxQty = _maxQuantity(_selectedVariant, widget.product.inventoryMode);

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Détail produit',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.bubbles,
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              _ProductImages(images: widget.product.images),
              const SizedBox(height: 14),
              Material(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        boutiqueCategoryLabel(widget.product.category),
                        style: const TextStyle(
                          color: AppColors.middenblauw,
                          fontWeight: FontWeight.w800,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        widget.product.name,
                        style: const TextStyle(
                          color: AppColors.donkerblauw,
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                          height: 1.1,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        formatter.format(unitPrice),
                        style: const TextStyle(
                          color: AppColors.oranje,
                          fontSize: 21,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      if (deliverySurcharge > 0) ...[
                        const SizedBox(height: 4),
                        Text(
                          '+ ${formatter.format(deliverySurcharge)} livraison',
                          style: TextStyle(color: Colors.grey.shade700),
                        ),
                      ],
                      if (widget.product.description.trim().isNotEmpty) ...[
                        const SizedBox(height: 16),
                        Text(
                          widget.product.description,
                          style: TextStyle(
                            color: Colors.grey.shade800,
                            height: 1.35,
                          ),
                        ),
                      ],
                      const SizedBox(height: 18),
                      if (widget.product.variants.length > 1)
                        DropdownButtonFormField<BoutiqueVariant>(
                          initialValue: _selectedVariant,
                          decoration: const InputDecoration(
                            labelText: 'Variante',
                            border: OutlineInputBorder(),
                          ),
                          items: widget.product.variants
                              .map(
                                (variant) => DropdownMenuItem(
                                  value: variant,
                                  child: Text(variant.label),
                                ),
                              )
                              .toList(),
                          onChanged: (variant) {
                            setState(() {
                              _selectedVariant = variant;
                              _quantity = _minimumQuantity;
                            });
                          },
                        ),
                      const SizedBox(height: 14),
                      _StockLine(
                        variant: _selectedVariant,
                        inventoryMode: widget.product.inventoryMode,
                      ),
                      if (widget.product.personalization != null) ...[
                        const SizedBox(height: 18),
                        _PersonalizationSection(
                          config: widget.product.personalization!,
                          selection: _personalization,
                          onChanged: (selection) {
                            setState(() => _personalization = selection);
                          },
                        ),
                      ],
                      if (widget.product.deliveryModes.length > 1 ||
                          widget.product.deliveryModes.first !=
                              BoutiqueDeliveryMode.poolPickup) ...[
                        const SizedBox(height: 18),
                        _DeliverySection(
                          modes: widget.product.deliveryModes,
                          surcharges: widget.product.deliverySurcharges,
                          selected: _selectedDeliveryMode,
                          onChanged: (mode) {
                            setState(() => _selectedDeliveryMode = mode);
                          },
                        ),
                      ],
                      const SizedBox(height: 18),
                      Row(
                        children: [
                          const Text(
                            'Quantité',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                          const Spacer(),
                          IconButton(
                            onPressed: _quantity > _minimumQuantity
                                ? () => setState(() => _quantity -= 1)
                                : null,
                            icon: const Icon(Icons.remove_circle_outline),
                          ),
                          SizedBox(
                            width: 28,
                            child: Text(
                              '$_quantity',
                              textAlign: TextAlign.center,
                              style:
                                  const TextStyle(fontWeight: FontWeight.w800),
                            ),
                          ),
                          IconButton(
                            onPressed: maxQty != null && _quantity >= maxQty
                                ? null
                                : () => setState(() => _quantity += 1),
                            icon: const Icon(Icons.add_circle_outline),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: _canPrepareOrder
                              ? () => _addToCart(context, unitPrice)
                              : null,
                          icon: const Icon(Icons.shopping_bag_outlined),
                          label: Text(
                            'Préparer la commande · ${formatter.format(orderTotal)}',
                          ),
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
    );
  }

  bool get _canPrepareOrder {
    if (_quantity < _minimumQuantity) return false;
    final variant = _selectedVariant;
    final hasStock =
        widget.product.inventoryMode == BoutiqueInventoryMode.preorder ||
            variant == null ||
            variant.hasStock;
    if (!hasStock) return false;

    final config = widget.product.personalization;
    if (config == null) return true;
    if (_personalization.clubLogo && _personalization.clubLogoZone == null) {
      return false;
    }
    if (_personalization.hasName && _personalization.nameZone == null) {
      return false;
    }
    if (_personalization.hasCertification &&
        _personalization.certificationZone == null) {
      return false;
    }
    return true;
  }

  int get _minimumQuantity {
    final config = widget.product.personalization;
    return config?.productionConstraints.minimumOrderQuantity ?? 1;
  }

  int? _maxQuantity(
    BoutiqueVariant? variant,
    BoutiqueInventoryMode inventoryMode,
  ) {
    if (inventoryMode == BoutiqueInventoryMode.preorder) return null;
    if (variant?.allowBackorder == true) return null;
    return variant?.stockCount;
  }

  Future<void> _addToCart(BuildContext context, double unitPrice) async {
    final variant = _selectedVariant;
    final personalizationPayload =
        _personalization.toOrderPayload(widget.product.personalization);
    final item = BoutiqueCartItem(
      key: _cartKey(
        productId: widget.product.id,
        variantId: variant?.id ?? 'standard',
        deliveryMode: _selectedDeliveryMode,
        personalization: personalizationPayload,
      ),
      productId: widget.product.id,
      productName: widget.product.name,
      imageUrl: _firstNetworkImage(widget.product.images),
      supplierId: widget.product.supplierId,
      variantId: variant?.id ?? 'standard',
      variantLabel: variant?.label ?? 'Standard',
      deliveryMode: boutiqueDeliveryModeWireValue(_selectedDeliveryMode),
      deliveryLabel: boutiqueDeliveryModeLabel(_selectedDeliveryMode),
      qty: _quantity,
      unitPrice: unitPrice,
      deliverySurcharge:
          widget.product.deliverySurcharges[_selectedDeliveryMode] ?? 0,
      personalization: personalizationPayload,
    );

    await context.read<BoutiqueCartProvider>().addItem(item);
    if (!context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text('${widget.product.name} ajouté au panier.'),
        duration: const Duration(milliseconds: 1400),
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      ),
    );
  }
}

class _PersonalizationSection extends StatelessWidget {
  final BoutiquePersonalizationConfig config;
  final BoutiquePersonalizationSelection selection;
  final ValueChanged<BoutiquePersonalizationSelection> onChanged;

  const _PersonalizationSection({
    required this.config,
    required this.selection,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(
      locale: 'fr_BE',
      symbol: '€',
      decimalDigits: 2,
    );

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceGrey.withValues(alpha: 0.65),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.auto_fix_high_outlined,
                color: AppColors.middenblauw,
                size: 20,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  config.techniqueLabel,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w900,
                    fontSize: 16,
                  ),
                ),
              ),
              Text(
                '+ ${formatter.format(selection.surcharge(config))}',
                style: const TextStyle(
                  color: AppColors.oranje,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          if (config.productionConstraints.leadTimeDays != null ||
              config.productionConstraints.groupOrderOnly ||
              config.productionConstraints.minimumOrderQuantity > 1 ||
              (config.productionConstraints.notes ?? '').isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              _constraintsText(config.productionConstraints),
              style: TextStyle(
                color: Colors.grey.shade700,
                fontSize: 12.5,
                height: 1.3,
              ),
            ),
          ],
          if (config.clubLogo.canChoose) ...[
            const SizedBox(height: 14),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                'Logo club (${formatter.format(config.clubLogo.surcharge)})',
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              value: selection.clubLogo,
              onChanged: (enabled) {
                onChanged(
                  selection.copyWith(
                    clubLogo: enabled,
                    clubLogoZone: enabled && config.clubLogo.zones.length == 1
                        ? config.clubLogo.zones.first
                        : null,
                    clearClubLogoZone: !enabled,
                  ),
                );
              },
            ),
            if (selection.clubLogo)
              _ZoneDropdown(
                label: 'Position logo',
                zones: config.clubLogo.zones,
                value: selection.clubLogoZone,
                onChanged: (zone) =>
                    onChanged(selection.copyWith(clubLogoZone: zone)),
              ),
          ],
          if (config.name.canChoose) ...[
            const SizedBox(height: 12),
            TextField(
              maxLength: config.name.maxLength,
              decoration: InputDecoration(
                labelText: 'Nom à personnaliser',
                helperText:
                    '${formatter.format(config.name.pricePerCharacter)} par lettre',
                border: const OutlineInputBorder(),
              ),
              onChanged: (value) {
                onChanged(
                  selection.copyWith(
                    nameText: value,
                    nameZone:
                        value.trim().isNotEmpty && config.name.zones.length == 1
                            ? config.name.zones.first
                            : selection.nameZone,
                    clearNameZone: value.trim().isEmpty,
                  ),
                );
              },
            ),
            if (selection.hasName)
              _ZoneDropdown(
                label: 'Position nom',
                zones: config.name.zones,
                value: selection.nameZone,
                onChanged: (zone) =>
                    onChanged(selection.copyWith(nameZone: zone)),
              ),
          ],
          if (config.certification.canChoose) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: selection.certification,
              decoration: InputDecoration(
                labelText:
                    'Brevet (${formatter.format(config.certification.surcharge)})',
                border: const OutlineInputBorder(),
              ),
              items: config.certification.allowedValues
                  .map(
                    (value) => DropdownMenuItem(
                      value: value,
                      child: Text(value),
                    ),
                  )
                  .toList(),
              onChanged: (value) {
                onChanged(
                  selection.copyWith(
                    certification: value,
                    certificationZone:
                        value != null && config.certification.zones.length == 1
                            ? config.certification.zones.first
                            : selection.certificationZone,
                    clearCertificationZone: value == null,
                  ),
                );
              },
            ),
            if (selection.hasCertification) ...[
              const SizedBox(height: 10),
              _ZoneDropdown(
                label: 'Position brevet',
                zones: config.certification.zones,
                value: selection.certificationZone,
                onChanged: (zone) =>
                    onChanged(selection.copyWith(certificationZone: zone)),
              ),
            ],
          ],
        ],
      ),
    );
  }

  String _constraintsText(BoutiqueProductionConstraints constraints) {
    final parts = <String>[];
    if (constraints.minimumOrderQuantity > 1) {
      parts.add('min. ${constraints.minimumOrderQuantity} pièces');
    }
    if (constraints.groupOrderOnly) {
      parts.add('commande groupée');
    }
    if (constraints.leadTimeDays != null) {
      parts.add('délai ${constraints.leadTimeDays} jours');
    }
    if ((constraints.notes ?? '').isNotEmpty) {
      parts.add(constraints.notes!);
    }
    return parts.join(' · ');
  }
}

class _DeliverySection extends StatelessWidget {
  final List<BoutiqueDeliveryMode> modes;
  final Map<BoutiqueDeliveryMode, double> surcharges;
  final BoutiqueDeliveryMode selected;
  final ValueChanged<BoutiqueDeliveryMode> onChanged;

  const _DeliverySection({
    required this.modes,
    required this.surcharges,
    required this.selected,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(
      locale: 'fr_BE',
      symbol: '€',
      decimalDigits: 2,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Livraison',
          style: TextStyle(
            color: AppColors.donkerblauw,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final mode in modes)
              ChoiceChip(
                selected: selected == mode,
                label: Text(
                  _labelWithPrice(mode, surcharges[mode] ?? 0, formatter),
                ),
                onSelected: (_) => onChanged(mode),
              ),
          ],
        ),
      ],
    );
  }

  String _labelWithPrice(
    BoutiqueDeliveryMode mode,
    double surcharge,
    NumberFormat formatter,
  ) {
    if (surcharge <= 0) return boutiqueDeliveryModeLabel(mode);
    return '${boutiqueDeliveryModeLabel(mode)} + ${formatter.format(surcharge)}';
  }
}

class _ZoneDropdown extends StatelessWidget {
  final String label;
  final List<String> zones;
  final String? value;
  final ValueChanged<String?> onChanged;

  const _ZoneDropdown({
    required this.label,
    required this.zones,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      items: zones
          .map(
            (zone) => DropdownMenuItem(
              value: zone,
              child: Text(boutiqueZoneLabel(zone)),
            ),
          )
          .toList(),
      onChanged: onChanged,
    );
  }
}

class _ProductImages extends StatelessWidget {
  final List<String> images;

  const _ProductImages({required this.images});

  @override
  Widget build(BuildContext context) {
    final networkImages = images.where(_isNetworkImage).toList();
    if (networkImages.isEmpty) {
      return Container(
        height: 250,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.92),
          borderRadius: BorderRadius.circular(18),
        ),
        child: const Icon(
          Icons.shopping_bag_outlined,
          color: AppColors.middenblauw,
          size: 64,
        ),
      );
    }

    return SizedBox(
      height: 280,
      child: PageView.builder(
        itemCount: networkImages.length,
        itemBuilder: (context, index) {
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: Image.network(
                networkImages[index],
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  color: Colors.white.withValues(alpha: 0.92),
                  child: const Icon(
                    Icons.broken_image_outlined,
                    color: AppColors.middenblauw,
                    size: 56,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _StockLine extends StatelessWidget {
  final BoutiqueVariant? variant;
  final BoutiqueInventoryMode inventoryMode;

  const _StockLine({
    required this.variant,
    required this.inventoryMode,
  });

  @override
  Widget build(BuildContext context) {
    final text = _stockText();
    final color = text == 'Rupture de stock'
        ? Colors.red.shade700
        : AppColors.middenblauw;

    return Row(
      children: [
        Icon(Icons.inventory_2_outlined, color: color, size: 18),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }

  String _stockText() {
    if (inventoryMode == BoutiqueInventoryMode.preorder) {
      return 'Disponible sur commande';
    }
    if (variant == null) return 'Disponible';
    if (variant!.allowBackorder && (variant!.stockCount ?? 0) <= 0) {
      return 'Sur commande';
    }
    final stock = variant!.stockCount;
    if (stock == null) return 'Disponible';
    if (stock <= 0) return 'Rupture de stock';
    if (stock <= 3) return 'Plus que $stock en stock';
    return 'En stock';
  }
}

bool _isNetworkImage(String imageUrl) {
  return imageUrl.startsWith('http://') || imageUrl.startsWith('https://');
}

String? _firstNetworkImage(List<String> images) {
  for (final imageUrl in images) {
    if (_isNetworkImage(imageUrl)) return imageUrl;
  }
  return null;
}

String _cartKey({
  required String productId,
  required String variantId,
  required BoutiqueDeliveryMode deliveryMode,
  required Map<String, dynamic> personalization,
}) {
  return '$productId|$variantId|${boutiqueDeliveryModeWireValue(deliveryMode)}|${personalization.toString()}';
}
