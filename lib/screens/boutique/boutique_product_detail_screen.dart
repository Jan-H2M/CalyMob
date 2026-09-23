import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../models/boutique/boutique_product.dart';
import '../../providers/boutique_cart_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class BoutiqueProductDetailScreen extends StatefulWidget {
  final BoutiqueProduct product;
  final BoutiqueCartItem? editingItem;

  const BoutiqueProductDetailScreen({
    super.key,
    required this.product,
    this.editingItem,
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
  late final TextEditingController _nameController;
  int _quantity = 1;

  @override
  void initState() {
    super.initState();
    final editingItem = widget.editingItem;
    _selectedVariant = editingItem == null
        ? (widget.product.variants.isNotEmpty
            ? widget.product.variants.first
            : null)
        : widget.product.variants
            .where((variant) => variant.id == editingItem.variantId)
            .firstOrNull;
    _selectedVariant ??= widget.product.variants.isNotEmpty
        ? widget.product.variants.first
        : null;
    _selectedDeliveryMode = editingItem == null
        ? widget.product.deliveryModes.first
        : widget.product.deliveryModes.firstWhere(
            (mode) =>
                boutiqueDeliveryModeWireValue(mode) == editingItem.deliveryMode,
            orElse: () => widget.product.deliveryModes.first,
          );
    _quantity = editingItem?.qty ?? _minimumQuantity;
    final personalization = widget.product.personalization;
    if (editingItem != null) {
      _personalization = _personalizationFromCart(editingItem.personalization);
    } else if (personalization?.clubLogo.canChoose == true) {
      _personalization = BoutiquePersonalizationSelection(
        clubLogo: true,
        clubLogoZone: personalization!.clubLogo.zones.first,
      );
    }
    _nameController = TextEditingController(text: _personalization.nameText);
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(
      locale: 'fr_BE',
      symbol: '€',
      decimalDigits: 2,
    );
    final personalizationSurcharge = _personalization.surcharge(
      widget.product.personalization,
    );
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
                          articleTotal: orderTotal,
                          nameController: _nameController,
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
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                              ),
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
                      LayoutBuilder(
                        builder: (context, constraints) {
                          final compact = constraints.maxWidth < 300;
                          final action = widget.editingItem == null
                              ? (compact ? 'Ajouter' : 'Ajouter au panier')
                              : (compact
                                  ? 'Mettre à jour'
                                  : 'Mettre à jour le panier');
                          return SizedBox(
                            width: double.infinity,
                            child: FilledButton.icon(
                              onPressed: _canPrepareOrder
                                  ? () => _saveToCart(context, unitPrice)
                                  : null,
                              icon: const Icon(Icons.shopping_bag_outlined),
                              label: Text(
                                '$action · ${formatter.format(orderTotal)}',
                                maxLines: 1,
                              ),
                            ),
                          );
                        },
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
    if (config.clubLogo.canChoose &&
        (!_personalization.clubLogo || _personalization.clubLogoZone == null)) {
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

  Future<void> _saveToCart(BuildContext context, double unitPrice) async {
    final navigator = Navigator.of(context);
    final rootNavigator = Navigator.of(context, rootNavigator: true);
    final messenger = ScaffoldMessenger.of(context);
    final variant = _selectedVariant;
    final personalizationPayload = _personalization.toOrderPayload(
      widget.product.personalization,
    );
    final item = BoutiqueCartItem(
      key: boutiqueCartKey(
        productId: widget.product.id,
        variantId: variant?.id ?? 'standard',
        deliveryMode: boutiqueDeliveryModeWireValue(_selectedDeliveryMode),
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

    final cart = context.read<BoutiqueCartProvider>();
    if (widget.editingItem case final editingItem?) {
      await cart.replaceItem(editingItem.key, item);
    } else {
      await cart.addItem(item);
    }
    if (!context.mounted) return;

    if (widget.editingItem != null) {
      Navigator.of(context).pop();
      messenger.showSnackBar(
        const SnackBar(content: Text('Article modifié dans le panier.')),
      );
      return;
    }

    _showAddedToCartToast(context);
    await Future<void>.delayed(const Duration(milliseconds: 850));
    if (!context.mounted) return;
    rootNavigator.pop();
    await Future<void>.delayed(const Duration(milliseconds: 120));
    if (!context.mounted) return;
    navigator.pop();
  }

  BoutiquePersonalizationSelection _personalizationFromCart(
    Map<String, dynamic> payload,
  ) {
    final logo = payload['clubLogo'];
    final name = payload['name'];
    final certification = payload['certification'];
    final logoConfig = widget.product.personalization?.clubLogo;
    final logoIsRequired = logoConfig?.canChoose == true;
    final storedLogoZone = logo is Map ? logo['zone']?.toString() : null;
    final normalizedLogoZone = logoIsRequired
        ? (logoConfig!.zones.contains(storedLogoZone)
            ? storedLogoZone
            : logoConfig.zones.first)
        : storedLogoZone;
    return BoutiquePersonalizationSelection(
      clubLogo: logoIsRequired || (logo is Map && logo['enabled'] == true),
      clubLogoZone: normalizedLogoZone,
      nameEnabled:
          name is Map && (name['text']?.toString().trim().isNotEmpty ?? false),
      nameText: name is Map ? name['text']?.toString() : null,
      nameZone: name is Map ? name['zone']?.toString() : null,
      certificationEnabled: certification is Map &&
          (certification['value']?.toString().trim().isNotEmpty ?? false),
      certification:
          certification is Map ? certification['value']?.toString() : null,
      certificationZone:
          certification is Map ? certification['zone']?.toString() : null,
    );
  }

  void _showAddedToCartToast(BuildContext context) {
    showGeneralDialog<void>(
      context: context,
      barrierDismissible: false,
      barrierLabel: 'Article ajouté',
      barrierColor: Colors.black.withValues(alpha: 0.08),
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (_, __, ___) {
        return const Center(child: _AddedToCartToast());
      },
      transitionBuilder: (_, animation, __, child) {
        final curved = CurvedAnimation(
          parent: animation,
          curve: Curves.easeOutBack,
          reverseCurve: Curves.easeIn,
        );
        return FadeTransition(
          opacity: animation,
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.82, end: 1).animate(curved),
            child: child,
          ),
        );
      },
    );
  }
}

class _AddedToCartToast extends StatelessWidget {
  const _AddedToCartToast();

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Container(
        width: 156,
        height: 156,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF1FC66A), Color(0xFF0A9F72)],
          ),
          borderRadius: BorderRadius.circular(32),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF08744F).withValues(alpha: 0.38),
              blurRadius: 26,
              offset: const Offset(0, 14),
            ),
          ],
        ),
        child: Center(
          child: Container(
            width: 82,
            height: 82,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.18),
              shape: BoxShape.circle,
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.45),
                width: 2,
              ),
            ),
            child: const Icon(
              Icons.check_rounded,
              color: Colors.white,
              size: 62,
              weight: 900,
            ),
          ),
        ),
      ),
    );
  }
}

class _PersonalizationSection extends StatelessWidget {
  final BoutiquePersonalizationConfig config;
  final BoutiquePersonalizationSelection selection;
  final double articleTotal;
  final TextEditingController nameController;
  final ValueChanged<BoutiquePersonalizationSelection> onChanged;

  const _PersonalizationSection({
    required this.config,
    required this.selection,
    required this.articleTotal,
    required this.nameController,
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
              Text(
                config.techniqueLabel,
                style: const TextStyle(
                  color: AppColors.donkerblauw,
                  fontWeight: FontWeight.w900,
                  fontSize: 16,
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
          const SizedBox(height: 14),
          if (config.clubLogo.canChoose) ...[
            const ListTile(
              key: Key('boutique-club-logo-required'),
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                Icons.verified_rounded,
                color: AppColors.middenblauw,
              ),
              title: Text(
                'Logo club inclus',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
            if (config.clubLogo.zones.length > 1)
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
            _PersonalizationToggle(
              key: const Key('boutique-name-toggle'),
              label: 'Nom à personnaliser',
              priceKey: const Key('boutique-name-price'),
              price: selection.hasName
                  ? (config.name.surcharge +
                      config.name.priceForText(
                        (selection.nameText ?? '').trim(),
                      ))
                  : null,
              value: selection.nameEnabled,
              onChanged: (enabled) {
                if (!enabled) nameController.clear();
                onChanged(
                  selection.copyWith(
                    nameEnabled: enabled,
                    clearNameText: !enabled,
                    clearNameZone: !enabled,
                  ),
                );
              },
            ),
            if (selection.nameEnabled) ...[
              TextField(
                key: const Key('boutique-name-field'),
                controller: nameController,
                maxLength: config.name.maxLength,
                decoration: const InputDecoration(
                  labelText: 'Nom à personnaliser',
                  counterText: '',
                  border: OutlineInputBorder(),
                ),
                onChanged: (value) {
                  onChanged(
                    selection.copyWith(
                      nameText: value,
                      nameZone: value.trim().isNotEmpty &&
                              config.name.zones.length == 1
                          ? config.name.zones.first
                          : selection.nameZone,
                      clearNameZone: value.trim().isEmpty,
                    ),
                  );
                },
              ),
              Row(
                children: [
                  Text(
                    key: const Key('boutique-name-letter-count'),
                    '${(selection.nameText ?? '').trim().length}/${config.name.maxLength ?? '∞'} lettres',
                    style: TextStyle(
                      color: Colors.grey.shade600,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ],
            if (selection.hasName) ...[
              const SizedBox(height: 10),
              _ZoneDropdown(
                label: 'Position nom',
                zones: config.name.zones,
                value: selection.nameZone,
                onChanged: (zone) =>
                    onChanged(selection.copyWith(nameZone: zone)),
              ),
            ],
          ],
          if (config.certification.canChoose) ...[
            const SizedBox(height: 12),
            _PersonalizationToggle(
              key: const Key('boutique-certification-toggle'),
              label: 'Brevet',
              priceKey: const Key('boutique-certification-price'),
              price: selection.hasCertification
                  ? config.certification.surcharge
                  : null,
              value: selection.certificationEnabled,
              onChanged: (enabled) => onChanged(
                selection.copyWith(
                  certificationEnabled: enabled,
                  clearCertification: !enabled,
                  clearCertificationZone: !enabled,
                ),
              ),
            ),
            if (selection.certificationEnabled) ...[
              DropdownButtonFormField<String>(
                initialValue: selection.certification,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText:
                      'Brevet (${formatter.format(config.certification.surcharge)})',
                  border: const OutlineInputBorder(),
                ),
                items: config.certification.allowedValues
                    .map(
                      (value) =>
                          DropdownMenuItem(value: value, child: Text(value)),
                    )
                    .toList(),
                onChanged: (value) {
                  onChanged(
                    selection.copyWith(
                      certification: value,
                      certificationZone: value != null &&
                              config.certification.zones.length == 1
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
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              children: [
                _PriceSummaryRow(
                  label:
                      'Suppléments de ${config.techniqueLabel.toLowerCase()}',
                  value: formatter.format(selection.surcharge(config)),
                  emphasize: false,
                ),
                const SizedBox(height: 5),
                _PriceSummaryRow(
                  label: 'Total de l’article',
                  value: formatter.format(articleTotal),
                  emphasize: true,
                ),
              ],
            ),
          ),
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

class _PersonalizationToggle extends StatelessWidget {
  final String label;
  final Key? priceKey;
  final double? price;
  final bool value;
  final ValueChanged<bool> onChanged;

  const _PersonalizationToggle({
    super.key,
    required this.label,
    this.priceKey,
    required this.price,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(
      locale: 'fr_BE',
      symbol: '€',
      decimalDigits: 2,
    );
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
        if (price != null) ...[
          Text(
            key: priceKey,
            '+ ${formatter.format(price)}',
            style: const TextStyle(
              color: AppColors.oranje,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(width: 8),
        ],
        Switch(value: value, onChanged: onChanged),
      ],
    );
  }
}

class _PriceSummaryRow extends StatelessWidget {
  final String label;
  final String value;
  final bool emphasize;

  const _PriceSummaryRow({
    required this.label,
    required this.value,
    required this.emphasize,
  });

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: AppColors.donkerblauw,
                fontWeight: emphasize ? FontWeight.w900 : FontWeight.w700,
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              color: AppColors.oranje,
              fontWeight: FontWeight.w900,
              fontSize: emphasize ? 16 : 14,
            ),
          ),
        ],
      );
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
      isExpanded: true,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      items: zones
          .map(
            (zone) => DropdownMenuItem(
              value: zone,
              child: Text(
                boutiqueZoneLabel(zone),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          )
          .toList(),
      onChanged: onChanged,
    );
  }
}

class _ProductImages extends StatefulWidget {
  final List<String> images;

  const _ProductImages({required this.images});

  @override
  State<_ProductImages> createState() => _ProductImagesState();
}

class _ProductImagesState extends State<_ProductImages> {
  late final PageController _pageController;
  int _selectedIndex = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _moveTo(int index, int imageCount) {
    if (index < 0 || index >= imageCount) return;
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  Future<void> _openFullscreen(List<String> images) {
    return Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => _FullscreenProductGallery(
          images: images,
          initialIndex: _selectedIndex,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final networkImages = widget.images
        .map(_resolveProductImageUrl)
        .whereType<String>()
        .toList(growable: false);
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
      child: Stack(
        children: [
          PageView.builder(
            controller: _pageController,
            itemCount: networkImages.length,
            onPageChanged: (index) => setState(() => _selectedIndex = index),
            itemBuilder: (context, index) {
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: Material(
                    color: Colors.white.withValues(alpha: 0.92),
                    child: InkWell(
                      onTap: () => _openFullscreen(networkImages),
                      child: Image.network(
                        networkImages[index],
                        fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) => const Icon(
                          Icons.broken_image_outlined,
                          color: AppColors.middenblauw,
                          size: 56,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
          if (networkImages.length > 1) ...[
            Positioned(
              left: 10,
              top: 0,
              bottom: 0,
              child: Center(
                child: IconButton.filledTonal(
                  tooltip: 'Photo précédente',
                  onPressed: _selectedIndex > 0
                      ? () => _moveTo(_selectedIndex - 1, networkImages.length)
                      : null,
                  icon: const Icon(Icons.chevron_left),
                ),
              ),
            ),
            Positioned(
              right: 10,
              top: 0,
              bottom: 0,
              child: Center(
                child: IconButton.filledTonal(
                  tooltip: 'Photo suivante',
                  onPressed: _selectedIndex < networkImages.length - 1
                      ? () => _moveTo(_selectedIndex + 1, networkImages.length)
                      : null,
                  icon: const Icon(Icons.chevron_right),
                ),
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 12,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '${_selectedIndex + 1} / ${networkImages.length}',
                    style: const TextStyle(
                      color: AppColors.donkerblauw,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(
                      networkImages.length,
                      (index) => AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        height: 8,
                        width: index == _selectedIndex ? 20 : 8,
                        decoration: BoxDecoration(
                          color: index == _selectedIndex
                              ? AppColors.middenblauw
                              : AppColors.middenblauw.withValues(alpha: 0.3),
                          borderRadius: BorderRadius.circular(99),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _FullscreenProductGallery extends StatefulWidget {
  final List<String> images;
  final int initialIndex;

  const _FullscreenProductGallery({
    required this.images,
    required this.initialIndex,
  });

  @override
  State<_FullscreenProductGallery> createState() =>
      _FullscreenProductGalleryState();
}

class _FullscreenProductGalleryState extends State<_FullscreenProductGallery> {
  late final PageController _pageController;
  late int _selectedIndex;

  @override
  void initState() {
    super.initState();
    _selectedIndex = widget.initialIndex;
    _pageController = PageController(initialPage: _selectedIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _moveTo(int index) {
    if (index < 0 || index >= widget.images.length) return;
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            PageView.builder(
              controller: _pageController,
              itemCount: widget.images.length,
              onPageChanged: (index) => setState(() => _selectedIndex = index),
              itemBuilder: (context, index) => InteractiveViewer(
                minScale: 0.8,
                maxScale: 4,
                child: Center(
                  child: Image.network(
                    widget.images[index],
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const Icon(
                      Icons.broken_image_outlined,
                      color: Colors.white,
                      size: 64,
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              top: 8,
              right: 12,
              child: IconButton.filled(
                tooltip: 'Fermer',
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close),
              ),
            ),
            if (widget.images.length > 1) ...[
              Positioned(
                left: 12,
                top: 0,
                bottom: 0,
                child: Center(
                  child: IconButton.filledTonal(
                    tooltip: 'Photo précédente',
                    onPressed: _selectedIndex > 0
                        ? () => _moveTo(_selectedIndex - 1)
                        : null,
                    icon: const Icon(Icons.chevron_left),
                  ),
                ),
              ),
              Positioned(
                right: 12,
                top: 0,
                bottom: 0,
                child: Center(
                  child: IconButton.filledTonal(
                    tooltip: 'Photo suivante',
                    onPressed: _selectedIndex < widget.images.length - 1
                        ? () => _moveTo(_selectedIndex + 1)
                        : null,
                    icon: const Icon(Icons.chevron_right),
                  ),
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 20,
                child: Text(
                  '${_selectedIndex + 1} / ${widget.images.length}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StockLine extends StatelessWidget {
  final BoutiqueVariant? variant;
  final BoutiqueInventoryMode inventoryMode;

  const _StockLine({required this.variant, required this.inventoryMode});

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
            style: TextStyle(color: color, fontWeight: FontWeight.w800),
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
