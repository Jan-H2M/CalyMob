import 'package:cloud_firestore/cloud_firestore.dart';

enum BoutiqueProductCategory {
  brevetsFormations,
  vetements,
  accessoiresClub,
  abonnements,
  produitsDigitaux,
  autre,
}

enum BoutiqueInventoryMode { tracked, preorder }

enum BoutiqueCustomizationTechnique { embroidery, print }

enum BoutiqueDeliveryMode { digital, poolPickup, post, inPerson }

class BoutiquePrice {
  final double salePrice;
  final double? salePriceOverride;
  final String currency;

  const BoutiquePrice({
    required this.salePrice,
    this.salePriceOverride,
    required this.currency,
  });

  double get effectivePrice => salePriceOverride ?? salePrice;

  factory BoutiquePrice.fromMap(Map<String, dynamic>? data) {
    return BoutiquePrice(
      salePrice: _asDouble(data?['salePrice']),
      salePriceOverride: _nullableDouble(data?['salePriceOverride']),
      currency: data?['currency']?.toString() ?? 'EUR',
    );
  }
}

class BoutiqueVariant {
  final String id;
  final String label;
  final String? sku;
  final Map<String, dynamic> attributes;
  final int? stockCount;
  final bool allowBackorder;
  final double? salePriceOverride;

  const BoutiqueVariant({
    required this.id,
    required this.label,
    this.sku,
    required this.attributes,
    this.stockCount,
    required this.allowBackorder,
    this.salePriceOverride,
  });

  bool get hasStock => stockCount == null || stockCount! > 0 || allowBackorder;

  factory BoutiqueVariant.fromMap(Map<String, dynamic> data) {
    final attributes = Map<String, dynamic>.from(data['attributes'] ?? {});
    final explicitLabel = data['label']?.toString().trim() ?? '';
    final derivedLabel = deriveBoutiqueVariantLabel(attributes);

    return BoutiqueVariant(
      id: data['id']?.toString() ?? '',
      label: explicitLabel.isNotEmpty
          ? explicitLabel
          : derivedLabel.isNotEmpty
              ? derivedLabel
              : 'Standard',
      sku: data['sku']?.toString(),
      attributes: attributes,
      stockCount: _nullableInt(data['stockCount']),
      allowBackorder: data['allowBackorder'] == true,
      salePriceOverride: _nullableDouble(data['salePriceOverride']),
    );
  }
}

/// Returns the canonical, human-readable fallback for an unlabeled catalogue
/// variant. Keep this field order aligned with CalyCompta so both clients show
/// the same option: size, colour, then model/cut.
String deriveBoutiqueVariantLabel(Map<String, dynamic> attributes) {
  String firstNonEmpty(List<String> keys) {
    for (final key in keys) {
      final value = attributes[key];
      if (value is String && value.trim().isNotEmpty) return value.trim();
    }
    return '';
  }

  return [
    firstNonEmpty(const ['taille', 'size']),
    firstNonEmpty(const ['couleur', 'color']),
    firstNonEmpty(const ['coupe', 'genre']),
  ].where((value) => value.isNotEmpty).join(' · ');
}

class BoutiqueProduct {
  final String id;
  final String name;
  final String description;
  final BoutiqueProductCategory category;
  final String supplierId;
  final List<String> images;
  final BoutiquePrice pricing;
  final BoutiqueInventoryMode inventoryMode;
  final List<BoutiqueVariant> variants;
  final List<BoutiqueDeliveryMode> deliveryModes;
  final Map<BoutiqueDeliveryMode, double> deliverySurcharges;
  final String visibility;
  final BoutiquePersonalizationConfig? personalization;

  const BoutiqueProduct({
    required this.id,
    required this.name,
    required this.description,
    required this.category,
    required this.supplierId,
    required this.images,
    required this.pricing,
    required this.inventoryMode,
    required this.variants,
    required this.deliveryModes,
    required this.deliverySurcharges,
    required this.visibility,
    this.personalization,
  });

  bool get isPersonalizable => personalization?.enabled == true;

  double priceForVariant(BoutiqueVariant? variant) {
    return variant?.salePriceOverride ?? pricing.effectivePrice;
  }

  factory BoutiqueProduct.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    final variantsData = data['variants'];

    return BoutiqueProduct(
      id: doc.id,
      name: data['name']?.toString() ?? '',
      description: data['description']?.toString() ?? '',
      category: _categoryFromString(data['category']?.toString()),
      supplierId: data['supplierId']?.toString() ?? '',
      images: (data['images'] as List<dynamic>?)
              ?.map((image) => image.toString())
              .where((image) => image.trim().isNotEmpty)
              .toList() ??
          const [],
      pricing: BoutiquePrice.fromMap(
        Map<String, dynamic>.from(data['pricing'] ?? {}),
      ),
      inventoryMode: data['inventoryMode'] == 'preorder'
          ? BoutiqueInventoryMode.preorder
          : BoutiqueInventoryMode.tracked,
      variants: variantsData is List
          ? variantsData
              .whereType<Map>()
              .map(
                (variant) => BoutiqueVariant.fromMap(
                  Map<String, dynamic>.from(variant),
                ),
              )
              .toList()
          : const [],
      deliveryModes: _deliveryModesFromList(data['deliveryModes']),
      deliverySurcharges: _deliverySurchargesFromMap(
        data['deliverySurcharges'],
      ),
      visibility: data['visibility']?.toString() ?? 'draft',
      personalization: BoutiquePersonalizationConfig.fromMap(
        data['embroidery'],
      ),
    );
  }
}

class BoutiquePersonalizationConfig {
  final bool enabled;
  final String baseType;
  final BoutiqueCustomizationTechnique technique;
  final BoutiqueProductionConstraints productionConstraints;
  final BoutiquePersonalizationOption clubLogo;
  final BoutiqueNameOption name;
  final BoutiqueCertificationOption certification;

  const BoutiquePersonalizationConfig({
    required this.enabled,
    required this.baseType,
    required this.technique,
    required this.productionConstraints,
    required this.clubLogo,
    required this.name,
    required this.certification,
  });

  String get techniqueLabel {
    switch (technique) {
      case BoutiqueCustomizationTechnique.embroidery:
        return 'Broderie';
      case BoutiqueCustomizationTechnique.print:
        return 'Impression';
    }
  }

  static BoutiquePersonalizationConfig? fromMap(dynamic value) {
    if (value is! Map) return null;
    final data = Map<String, dynamic>.from(value);
    final enabled = data['enabled'] == true;
    if (!enabled) return null;

    return BoutiquePersonalizationConfig(
      enabled: enabled,
      baseType: data['baseType']?.toString() ?? 'other',
      technique: data['technique'] == 'print'
          ? BoutiqueCustomizationTechnique.print
          : BoutiqueCustomizationTechnique.embroidery,
      productionConstraints: BoutiqueProductionConstraints.fromMap(
        data['productionConstraints'],
      ),
      clubLogo: BoutiquePersonalizationOption.fromMap(data['clubLogo']),
      name: BoutiqueNameOption.fromMap(data['name']),
      certification: BoutiqueCertificationOption.fromMap(data['certification']),
    );
  }
}

class BoutiqueProductionConstraints {
  final int minimumOrderQuantity;
  final double setupCost;
  final bool groupOrderOnly;
  final int? leadTimeDays;
  final String? notes;

  const BoutiqueProductionConstraints({
    required this.minimumOrderQuantity,
    required this.setupCost,
    required this.groupOrderOnly,
    this.leadTimeDays,
    this.notes,
  });

  factory BoutiqueProductionConstraints.fromMap(dynamic value) {
    final data = value is Map ? Map<String, dynamic>.from(value) : {};
    return BoutiqueProductionConstraints(
      minimumOrderQuantity: _nullableInt(data['minimumOrderQuantity']) ?? 1,
      setupCost: _asDouble(data['setupCost']),
      groupOrderOnly: data['groupOrderOnly'] == true,
      leadTimeDays: _nullableInt(data['leadTimeDays']),
      notes: data['notes']?.toString(),
    );
  }
}

class BoutiquePersonalizationOption {
  final bool enabled;
  final List<String> zones;
  final double surcharge;

  const BoutiquePersonalizationOption({
    required this.enabled,
    required this.zones,
    required this.surcharge,
  });

  bool get canChoose => enabled && zones.isNotEmpty;

  factory BoutiquePersonalizationOption.fromMap(dynamic value) {
    final data = value is Map ? Map<String, dynamic>.from(value) : {};
    return BoutiquePersonalizationOption(
      enabled: data['enabled'] == true,
      zones: _stringList(data['zones']),
      surcharge: _asDouble(data['surcharge']),
    );
  }
}

class BoutiqueNameOption extends BoutiquePersonalizationOption {
  final BoutiqueThreadColors threadColors;
  final BoutiqueNamePricingMode pricingMode;
  final double pricePerCharacter;
  final double fixedPrice;
  final int? maxLength;

  const BoutiqueNameOption({
    required super.enabled,
    required super.zones,
    required super.surcharge,
    required this.pricingMode,
    required this.pricePerCharacter,
    required this.fixedPrice,
    this.maxLength,
    this.threadColors = const BoutiqueThreadColors(),
  });

  factory BoutiqueNameOption.fromMap(dynamic value) {
    final data = value is Map ? Map<String, dynamic>.from(value) : {};
    return BoutiqueNameOption(
      enabled: data['enabled'] == true,
      zones: _stringList(data['zones']),
      surcharge: _asDouble(data['surcharge']),
      pricingMode: data['pricingMode'] == 'fixed'
          ? BoutiqueNamePricingMode.fixed
          : BoutiqueNamePricingMode.perCharacter,
      pricePerCharacter: _asDouble(
        data['pricePerCharacter'] ?? data['surcharge'],
      ),
      fixedPrice: _asDouble(data['fixedPrice']),
      maxLength: _nullableInt(data['maxLength']),
      threadColors:
          BoutiqueThreadColors.fromMap(Map<String, dynamic>.from(data)),
    );
  }

  double priceForText(String text) =>
      pricingMode == BoutiqueNamePricingMode.fixed
          ? fixedPrice
          : text.length * pricePerCharacter;
}

enum BoutiqueNamePricingMode { perCharacter, fixed }

class BoutiqueCertificationOption extends BoutiquePersonalizationOption {
  final List<String> allowedValues;
  final BoutiqueThreadColors threadColors;

  const BoutiqueCertificationOption({
    required super.enabled,
    required super.zones,
    required super.surcharge,
    required this.allowedValues,
    this.threadColors = const BoutiqueThreadColors(),
  });

  factory BoutiqueCertificationOption.fromMap(dynamic value) {
    final data = value is Map ? Map<String, dynamic>.from(value) : {};
    return BoutiqueCertificationOption(
      enabled: data['enabled'] == true,
      zones: _stringList(data['zones']),
      surcharge: _asDouble(data['surcharge']),
      allowedValues: _stringList(data['allowedValues']),
      threadColors:
          BoutiqueThreadColors.fromMap(Map<String, dynamic>.from(data)),
    );
  }
}

/// Product-scoped text colours. Malformed configuration cannot become a choice.
class BoutiqueThreadColors {
  final String? fixedColor;
  final List<String> choices;
  final bool valid;
  const BoutiqueThreadColors({
    this.fixedColor,
    this.choices = const [],
    this.valid = true,
  });

  factory BoutiqueThreadColors.fromMap(Map<String, dynamic> data) {
    bool label(dynamic value) =>
        value is String &&
        value.trim().isNotEmpty &&
        value.trim().length <= 40 &&
        !RegExp(r'[\x00-\x1f\x7f<>]').hasMatch(value.trim());
    final raw = data['allowedColors'];
    final fixed =
        data['color'] is String ? (data['color'] as String).trim() : '';
    if ((fixed.isNotEmpty && !label(fixed)) ||
        (data.containsKey('allowedColors') &&
            (raw is! List || raw.length > 16 || !raw.every(label)))) {
      return const BoutiqueThreadColors(valid: false);
    }
    final colors = <String, String>{};
    for (final value in (raw as List? ?? const [])) {
      colors[(value as String).trim().toLowerCase()] = value.trim();
    }
    return BoutiqueThreadColors(
      fixedColor: fixed.isEmpty ? null : fixed,
      choices: List.unmodifiable(colors.values),
    );
  }

  String? get defaultColor => choices.isEmpty
      ? fixedColor
      : choices
              .where(
                (value) => value.toLowerCase() == fixedColor?.toLowerCase(),
              )
              .firstOrNull ??
          choices.first;

  bool accepts(String? value) =>
      valid &&
      (value == null ||
          value.isEmpty ||
          (choices.isEmpty
              ? fixedColor?.toLowerCase() == value.trim().toLowerCase()
              : choices.any(
                  (color) => color.toLowerCase() == value.trim().toLowerCase(),
                )));

  String? resolve(String? value) {
    if (!accepts(value)) {
      throw ArgumentError('Couleur de personnalisation indisponible.');
    }
    if (value == null || value.isEmpty) return defaultColor;
    return choices.isEmpty
        ? fixedColor
        : choices.firstWhere(
            (color) => color.toLowerCase() == value.trim().toLowerCase(),
          );
  }
}

class BoutiquePersonalizationSelection {
  final bool clubLogo;
  final String? clubLogoZone;
  final bool nameEnabled;
  final String? nameText;
  final String? nameZone;
  final String? nameColor;
  final bool certificationEnabled;
  final String? certification;
  final String? certificationZone;
  final String? certificationColor;

  const BoutiquePersonalizationSelection({
    this.clubLogo = false,
    this.clubLogoZone,
    this.nameEnabled = false,
    this.nameText,
    this.nameZone,
    this.nameColor,
    this.certificationEnabled = false,
    this.certification,
    this.certificationZone,
    this.certificationColor,
  });

  bool get hasName => nameEnabled && (nameText ?? '').trim().isNotEmpty;

  bool get hasCertification =>
      certificationEnabled && (certification ?? '').trim().isNotEmpty;

  BoutiquePersonalizationSelection copyWith({
    bool? clubLogo,
    String? clubLogoZone,
    bool clearClubLogoZone = false,
    bool? nameEnabled,
    String? nameText,
    bool clearNameText = false,
    String? nameZone,
    bool clearNameZone = false,
    String? nameColor,
    bool clearNameColor = false,
    bool? certificationEnabled,
    String? certification,
    bool clearCertification = false,
    String? certificationZone,
    bool clearCertificationZone = false,
    String? certificationColor,
    bool clearCertificationColor = false,
  }) {
    return BoutiquePersonalizationSelection(
      clubLogo: clubLogo ?? this.clubLogo,
      clubLogoZone:
          clearClubLogoZone ? null : clubLogoZone ?? this.clubLogoZone,
      nameEnabled: nameEnabled ?? this.nameEnabled,
      nameText: clearNameText ? null : nameText ?? this.nameText,
      nameZone: clearNameZone ? null : nameZone ?? this.nameZone,
      nameColor: clearNameColor ? null : nameColor ?? this.nameColor,
      certificationEnabled: certificationEnabled ?? this.certificationEnabled,
      certification:
          clearCertification ? null : certification ?? this.certification,
      certificationZone: clearCertificationZone
          ? null
          : certificationZone ?? this.certificationZone,
      certificationColor: clearCertificationColor
          ? null
          : certificationColor ?? this.certificationColor,
    );
  }

  double surcharge(BoutiquePersonalizationConfig? config) {
    if (config == null) return 0;
    var total = 0.0;
    if (clubLogo && clubLogoZone != null) {
      total += config.clubLogo.surcharge;
    }
    final cleanName = (nameText ?? '').trim();
    if (cleanName.isNotEmpty && nameZone != null) {
      total += config.name.surcharge + config.name.priceForText(cleanName);
    }
    if (hasCertification && certificationZone != null) {
      total += config.certification.surcharge;
    }
    return total;
  }

  Map<String, dynamic> toOrderPayload(BoutiquePersonalizationConfig? config) {
    if (config == null) return {};
    final hasLogo = clubLogo && clubLogoZone != null;
    final cleanName = (nameText ?? '').trim();
    final hasNamePayload = cleanName.isNotEmpty && nameZone != null;
    final hasCertificationPayload =
        hasCertification && certificationZone != null;
    if (!hasLogo && !hasNamePayload && !hasCertificationPayload) {
      return {};
    }

    final payload = <String, dynamic>{
      'technique': config.technique.name,
      'baseType': config.baseType,
      'surcharge': surcharge(config),
    };
    if (hasLogo) {
      payload['clubLogo'] = {
        'enabled': true,
        'zone': clubLogoZone,
        'surcharge': config.clubLogo.surcharge,
      };
    }
    if (hasNamePayload) {
      final color = config.name.threadColors.resolve(nameColor);
      payload['name'] = {
        'text': cleanName,
        'zone': nameZone,
        if (color != null) 'color': color,
        'pricingMode': config.name.pricingMode == BoutiqueNamePricingMode.fixed
            ? 'fixed'
            : 'per_character',
        'pricePerCharacter': config.name.pricePerCharacter,
        'fixedPrice': config.name.fixedPrice,
        'surcharge':
            config.name.surcharge + config.name.priceForText(cleanName),
      };
    }
    if (hasCertificationPayload) {
      final color = config.certification.threadColors.resolve(
        certificationColor,
      );
      payload['certification'] = {
        'value': certification,
        'zone': certificationZone,
        if (color != null) 'color': color,
        'surcharge': config.certification.surcharge,
      };
    }
    return payload;
  }
}

/// Describes the saved order snapshot, never the current catalogue palette.
List<String> boutiquePersonalizationLines(Map<String, dynamic> data) {
  String color(dynamic option) => option is Map &&
          option['color'] is String &&
          (option['color'] as String).trim().isNotEmpty
      ? ' — couleur : ${(option['color'] as String).trim()}'
      : '';
  final name = data['name'];
  final certification = data['certification'];
  final logo = data['clubLogo'];
  return [
    if (logo is Map && logo['enabled'] == true)
      'Logo club — ${boutiqueZoneLabel(logo['zone']?.toString() ?? '')}',
    if (name is Map && (name['text']?.toString().trim().isNotEmpty ?? false))
      'Nom : ${name['text']} — ${boutiqueZoneLabel(name['zone']?.toString() ?? '')}${color(name)}',
    if (certification is Map &&
        (certification['value']?.toString().trim().isNotEmpty ?? false))
      'Brevet : ${certification['value']} — ${boutiqueZoneLabel(certification['zone']?.toString() ?? '')}${color(certification)}',
  ];
}

BoutiqueDeliveryMode _deliveryModeFromString(String? value) {
  switch (value) {
    case 'digital':
      return BoutiqueDeliveryMode.digital;
    case 'post':
      return BoutiqueDeliveryMode.post;
    case 'in_person':
      return BoutiqueDeliveryMode.inPerson;
    case 'pool_pickup':
    default:
      return BoutiqueDeliveryMode.poolPickup;
  }
}

List<BoutiqueDeliveryMode> _deliveryModesFromList(dynamic value) {
  if (value is! List) return const [BoutiqueDeliveryMode.poolPickup];
  final modes = value
      .map((entry) => _deliveryModeFromString(entry?.toString()))
      .toSet()
      .toList();
  return modes.isEmpty ? const [BoutiqueDeliveryMode.poolPickup] : modes;
}

Map<BoutiqueDeliveryMode, double> _deliverySurchargesFromMap(dynamic value) {
  if (value is! Map) return const {};
  final data = Map<String, dynamic>.from(value);
  return {
    for (final entry in data.entries)
      _deliveryModeFromString(entry.key): _asDouble(entry.value),
  };
}

BoutiqueProductCategory _categoryFromString(String? value) {
  switch (value) {
    case 'brevets_formations':
    case 'formation':
      return BoutiqueProductCategory.brevetsFormations;
    case 'vetements':
    case 'vetement':
    case 'vetements_brodes':
      return BoutiqueProductCategory.vetements;
    case 'accessoires_club':
    case 'carnets_documentation':
    case 'carnet':
      return BoutiqueProductCategory.accessoiresClub;
    case 'abonnements':
    case 'abonnement':
    case 'abonnements_sites':
      return BoutiqueProductCategory.abonnements;
    case 'produits_digitaux':
      return BoutiqueProductCategory.produitsDigitaux;
    default:
      return BoutiqueProductCategory.autre;
  }
}

String boutiqueCategoryLabel(BoutiqueProductCategory category) {
  switch (category) {
    case BoutiqueProductCategory.brevetsFormations:
      return 'Brevets & formations';
    case BoutiqueProductCategory.vetements:
      return 'Vêtements';
    case BoutiqueProductCategory.accessoiresClub:
      return 'Accessoires club';
    case BoutiqueProductCategory.abonnements:
      return 'Abonnements';
    case BoutiqueProductCategory.produitsDigitaux:
      return 'Produits digitaux';
    case BoutiqueProductCategory.autre:
      return 'Autre';
  }
}

String boutiqueDeliveryModeWireValue(BoutiqueDeliveryMode mode) {
  switch (mode) {
    case BoutiqueDeliveryMode.digital:
      return 'digital';
    case BoutiqueDeliveryMode.poolPickup:
      return 'pool_pickup';
    case BoutiqueDeliveryMode.post:
      return 'post';
    case BoutiqueDeliveryMode.inPerson:
      return 'in_person';
  }
}

String boutiqueDeliveryModeLabel(BoutiqueDeliveryMode mode) {
  switch (mode) {
    case BoutiqueDeliveryMode.digital:
      return 'Digital';
    case BoutiqueDeliveryMode.poolPickup:
      return 'Retrait piscine';
    case BoutiqueDeliveryMode.post:
      return 'Envoi postal';
    case BoutiqueDeliveryMode.inPerson:
      return 'Remise en main propre';
  }
}

double _asDouble(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

double? _nullableDouble(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString());
}

int? _nullableInt(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toInt();
  return int.tryParse(value.toString());
}

List<String> _stringList(dynamic value) {
  if (value is! List) return const [];
  return value
      .map((entry) => entry.toString())
      .where((entry) => entry.trim().isNotEmpty)
      .toList();
}

String boutiqueZoneLabel(String zone) {
  switch (zone) {
    case 'chest_left':
      return 'Poitrine gauche';
    case 'chest_right':
      return 'Poitrine droite';
    case 'front_center':
      return 'Centre avant';
    case 'sleeve_left':
      return 'Manche gauche';
    case 'sleeve_right':
      return 'Manche droite';
    case 'back':
      return 'Dos';
    case 'cap_front':
      return 'Casquette avant';
    case 'cap_side_left':
      return 'Casquette côté gauche';
    case 'cap_side_right':
      return 'Casquette côté droit';
    case 'cap_back':
      return 'Casquette arrière';
    case 'towel_corner':
      return 'Coin serviette';
    case 'towel_border':
      return 'Bord serviette';
    case 'patch_front':
      return 'Face écusson';
    case 'mask_strap_left':
      return 'Sangle masque gauche';
    case 'mask_strap_center':
      return 'Sangle masque centre';
    case 'mask_strap_right':
      return 'Sangle masque droite';
    case 'bcd_tag_front':
      return 'Étiquette BCD';
    case 'tank_band_front':
      return 'Sangle bouteille';
    case 'bag_front':
      return 'Sac face';
    case 'bag_side':
      return 'Sac côté';
    case 'bag_flap':
      return 'Sac rabat';
    case 'print_front':
      return 'Impression face';
    case 'print_back':
      return 'Impression arrière';
    case 'print_wrap':
      return 'Impression panoramique';
    case 'print_left':
      return 'Impression gauche';
    case 'print_right':
      return 'Impression droite';
    default:
      return zone;
  }
}
