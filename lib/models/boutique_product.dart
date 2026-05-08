import 'package:cloud_firestore/cloud_firestore.dart';

// ──────────────────────────────────────────────
// Enums (mirroring CalyCompta types/boutique-v2.ts)
// ──────────────────────────────────────────────

enum BoutiqueProductCategory {
  carnet,
  formation,
  vetement,
  abonnement,
  autre;

  String get label {
    switch (this) {
      case BoutiqueProductCategory.carnet:
        return 'Carnet';
      case BoutiqueProductCategory.formation:
        return 'Formation';
      case BoutiqueProductCategory.vetement:
        return 'Vêtement';
      case BoutiqueProductCategory.abonnement:
        return 'Abonnement';
      case BoutiqueProductCategory.autre:
        return 'Autre';
    }
  }

  static BoutiqueProductCategory fromString(String value) {
    switch (value) {
      case 'carnet':
        return BoutiqueProductCategory.carnet;
      case 'formation':
        return BoutiqueProductCategory.formation;
      case 'vetement':
        return BoutiqueProductCategory.vetement;
      case 'abonnement':
        return BoutiqueProductCategory.abonnement;
      default:
        return BoutiqueProductCategory.autre;
    }
  }
}

enum BoutiqueInventoryMode {
  tracked,
  preorder;

  static BoutiqueInventoryMode fromString(String value) {
    switch (value) {
      case 'tracked':
        return BoutiqueInventoryMode.tracked;
      default:
        return BoutiqueInventoryMode.preorder;
    }
  }
}

enum BoutiqueDeliveryMode {
  digital,
  poolPickup,
  post,
  inPerson;

  String get label {
    switch (this) {
      case BoutiqueDeliveryMode.digital:
        return 'Numérique';
      case BoutiqueDeliveryMode.poolPickup:
        return 'Retrait piscine';
      case BoutiqueDeliveryMode.post:
        return 'Envoi postal';
      case BoutiqueDeliveryMode.inPerson:
        return 'Remise en main propre';
    }
  }

  static BoutiqueDeliveryMode fromString(String value) {
    switch (value) {
      case 'digital':
        return BoutiqueDeliveryMode.digital;
      case 'pool_pickup':
        return BoutiqueDeliveryMode.poolPickup;
      case 'post':
        return BoutiqueDeliveryMode.post;
      case 'in_person':
        return BoutiqueDeliveryMode.inPerson;
      default:
        return BoutiqueDeliveryMode.poolPickup;
    }
  }
}

enum BoutiqueCommissionType {
  fixed,
  percentage;

  static BoutiqueCommissionType fromString(String value) {
    switch (value) {
      case 'fixed':
        return BoutiqueCommissionType.fixed;
      default:
        return BoutiqueCommissionType.percentage;
    }
  }
}

enum BoutiqueProductVisibility {
  draft,
  published,
  archived;

  String get label {
    switch (this) {
      case BoutiqueProductVisibility.draft:
        return 'Brouillon';
      case BoutiqueProductVisibility.published:
        return 'Publié';
      case BoutiqueProductVisibility.archived:
        return 'Archivé';
    }
  }

  static BoutiqueProductVisibility fromString(String value) {
    switch (value) {
      case 'draft':
        return BoutiqueProductVisibility.draft;
      case 'published':
        return BoutiqueProductVisibility.published;
      case 'archived':
        return BoutiqueProductVisibility.archived;
      default:
        return BoutiqueProductVisibility.draft;
    }
  }
}

// ──────────────────────────────────────────────
// Data classes
// ──────────────────────────────────────────────

class BoutiqueCommission {
  final BoutiqueCommissionType type;
  final double value;

  const BoutiqueCommission({
    required this.type,
    required this.value,
  });

  factory BoutiqueCommission.fromFirestore(Map<String, dynamic> data) {
    return BoutiqueCommission(
      type: BoutiqueCommissionType.fromString(data['type'] as String? ?? 'fixed'),
      value: (data['value'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class BoutiquePricingBreakdown {
  final double purchasePrice;
  final BoutiqueCommission commission;
  final double extraCosts;
  final double salePrice;
  final double? salePriceOverride;
  final String currency;

  const BoutiquePricingBreakdown({
    required this.purchasePrice,
    required this.commission,
    this.extraCosts = 0.0,
    required this.salePrice,
    this.salePriceOverride,
    this.currency = 'EUR',
  });

  double get effectiveSalePrice => salePriceOverride ?? salePrice;

  factory BoutiquePricingBreakdown.fromFirestore(Map<String, dynamic> data) {
    return BoutiquePricingBreakdown(
      purchasePrice: (data['purchasePrice'] as num?)?.toDouble() ?? 0.0,
      commission: BoutiqueCommission.fromFirestore(
        data['commission'] as Map<String, dynamic>? ?? {},
      ),
      extraCosts: (data['extraCosts'] as num?)?.toDouble() ?? 0.0,
      salePrice: (data['salePrice'] as num?)?.toDouble() ?? 0.0,
      salePriceOverride: (data['salePriceOverride'] as num?)?.toDouble(),
      currency: data['currency'] as String? ?? 'EUR',
    );
  }
}

class BoutiqueProductVariant {
  final String id;
  final String label;
  final String? sku;
  final Map<String, dynamic> attributes;
  final int? stockCount;
  final int? stockMin;
  final bool allowBackorder;
  final double? salePriceOverride;

  const BoutiqueProductVariant({
    required this.id,
    required this.label,
    this.sku,
    this.attributes = const {},
    this.stockCount,
    this.stockMin,
    this.allowBackorder = false,
    this.salePriceOverride,
  });

  factory BoutiqueProductVariant.fromFirestore(Map<String, dynamic> data) {
    return BoutiqueProductVariant(
      id: data['id'] as String? ?? '',
      label: data['label'] as String? ?? '',
      sku: data['sku'] as String?,
      attributes: data['attributes'] as Map<String, dynamic>? ?? {},
      stockCount: (data['stockCount'] as num?)?.toInt(),
      stockMin: (data['stockMin'] as num?)?.toInt(),
      allowBackorder: data['allowBackorder'] == true,
      salePriceOverride: (data['salePriceOverride'] as num?)?.toDouble(),
    );
  }
}

class BoutiqueProduct {
  final String id;
  final String name;
  final String description;
  final BoutiqueProductCategory category;
  final String supplierId;
  final List<String> images;
  final BoutiquePricingBreakdown pricing;
  final BoutiqueInventoryMode inventoryMode;
  final List<BoutiqueProductVariant> variants;
  final List<BoutiqueDeliveryMode> deliveryModes;
  final Map<String, double> deliverySurcharges;
  final String? accountingCode;
  final BoutiqueProductVisibility visibility;
  final DateTime? publishedAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  const BoutiqueProduct({
    required this.id,
    required this.name,
    this.description = '',
    required this.category,
    this.supplierId = '',
    this.images = const [],
    required this.pricing,
    this.inventoryMode = BoutiqueInventoryMode.preorder,
    this.variants = const [],
    this.deliveryModes = const [BoutiqueDeliveryMode.poolPickup],
    this.deliverySurcharges = const {},
    this.accountingCode,
    this.visibility = BoutiqueProductVisibility.draft,
    this.publishedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  double get salePrice => pricing.effectiveSalePrice;

  bool get isPublished => visibility == BoutiqueProductVisibility.published;

  String get categoryLabel => category.label;

  factory BoutiqueProduct.fromFirestore(
    String id,
    Map<String, dynamic> data,
  ) {
    final variantsList = (data['variants'] as List<dynamic>?)
            ?.map((e) =>
                BoutiqueProductVariant.fromFirestore(e as Map<String, dynamic>))
            .toList() ??
        [];

    final imagesList = (data['images'] as List<dynamic>?)
            ?.map((e) => e as String)
            .toList() ??
        [];

    final deliveryModesList = (data['deliveryModes'] as List<dynamic>?)
            ?.map((e) => BoutiqueDeliveryMode.fromString(e as String))
            .toList() ??
        [BoutiqueDeliveryMode.poolPickup];

    final rawSurcharges = data['deliverySurcharges'] as Map<String, dynamic>?;
    final surcharges = <String, double>{};
    if (rawSurcharges != null) {
      for (final entry in rawSurcharges.entries) {
        surcharges[entry.key] = (entry.value as num).toDouble();
      }
    }

    return BoutiqueProduct(
      id: id,
      name: data['name'] as String? ?? '',
      description: data['description'] as String? ?? '',
      category: BoutiqueProductCategory.fromString(
        data['category'] as String? ?? 'autre',
      ),
      supplierId: data['supplierId'] as String? ?? '',
      images: imagesList,
      pricing: BoutiquePricingBreakdown.fromFirestore(
        data['pricing'] as Map<String, dynamic>? ?? {},
      ),
      inventoryMode: BoutiqueInventoryMode.fromString(
        data['inventoryMode'] as String? ?? 'preorder',
      ),
      variants: variantsList,
      deliveryModes: deliveryModesList,
      deliverySurcharges: surcharges,
      accountingCode: data['accountingCode'] as String?,
      visibility: BoutiqueProductVisibility.fromString(
        data['visibility'] as String? ?? 'draft',
      ),
      publishedAt: (data['publishedAt'] as Timestamp?)?.toDate(),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }
}
