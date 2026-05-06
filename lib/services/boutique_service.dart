import 'package:cloud_firestore/cloud_firestore.dart';

import '../config/firebase_config.dart';
import '../providers/cart_provider.dart' show DeliveryMode, DeliveryModeCodec;

/// Modèle produit boutique (lecture Firestore)
class BoutiqueProduct {
  final String id;
  final String name;
  final String description;
  final String category;
  final String visibility;
  final String inventoryMode;
  final double salePrice;
  final List<String> images;
  final List<BoutiqueVariant> variants;
  final List<DeliveryMode> deliveryModes;

  const BoutiqueProduct({
    required this.id,
    required this.name,
    required this.description,
    required this.category,
    required this.visibility,
    required this.inventoryMode,
    required this.salePrice,
    required this.images,
    required this.variants,
    required this.deliveryModes,
  });

  String? get thumbnailUrl => images.isEmpty ? null : images.first;

  factory BoutiqueProduct.fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    return BoutiqueProduct(
      id: doc.id,
      name: data['name']?.toString() ?? 'Produit',
      description: data['description']?.toString() ?? '',
      category: data['category']?.toString() ?? 'autre',
      visibility: data['visibility']?.toString() ?? 'published',
      inventoryMode: data['inventoryMode']?.toString() ?? 'tracked',
      salePrice: _resolveBasePrice(data),
      images: _asStringList(data['images']),
      variants: _asVariantList(data['variants']),
      deliveryModes: _asDeliveryModes(data['deliveryModes']),
    );
  }
}

/// Variante produit (taille, type, etc.)
class BoutiqueVariant {
  final String id;
  final String label;
  final int? stockCount;
  final bool allowBackorder;
  final double? salePriceOverride;

  const BoutiqueVariant({
    required this.id,
    required this.label,
    required this.stockCount,
    required this.allowBackorder,
    required this.salePriceOverride,
  });

  bool get isInStock {
    if (allowBackorder) return true;
    return (stockCount ?? 0) > 0;
  }

  String get stockLabel {
    final stock = stockCount ?? 0;
    if (stock <= 0 && allowBackorder) return 'Précommande';
    if (stock <= 0) return 'Rupture de stock';
    if (stock <= 3) return 'Plus que $stock';
    return 'En stock';
  }
}

/// Résumé ligne d'une commande
class BoutiqueOrderItem {
  final String productId;
  final String variantId;
  final String productName;
  final String variantLabel;
  final int qty;
  final double unitPrice;
  final DeliveryMode deliveryMode;

  const BoutiqueOrderItem({
    required this.productId,
    required this.variantId,
    required this.productName,
    required this.variantLabel,
    required this.qty,
    required this.unitPrice,
    required this.deliveryMode,
  });

  double get lineTotal => unitPrice * qty;
}

/// Commande boutique (lecture Firestore)
class BoutiqueOrder {
  final String id;
  final String orderNumber;
  final DateTime createdAt;
  final String status;
  final double total;
  final String? iban;
  final String? beneficiary;
  final String? structuredCommunication;
  final String? epcPayload;
  final List<BoutiqueOrderItem> items;

  const BoutiqueOrder({
    required this.id,
    required this.orderNumber,
    required this.createdAt,
    required this.status,
    required this.total,
    required this.iban,
    required this.beneficiary,
    required this.structuredCommunication,
    required this.epcPayload,
    required this.items,
  });

  factory BoutiqueOrder.fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    final payment = _asMap(data['payment']);
    final pricing = _asMap(data['pricing']);
    final createdAtTs = data['createdAt'];

    return BoutiqueOrder(
      id: doc.id,
      orderNumber: data['orderNumber']?.toString() ?? doc.id,
      createdAt: createdAtTs is Timestamp
          ? createdAtTs.toDate()
          : DateTime.now(),
      status: data['status']?.toString() ?? 'pending',
      total: _asDouble(pricing['total'] ?? payment['amount']),
      iban: payment['iban']?.toString(),
      beneficiary: payment['beneficiary']?.toString(),
      structuredCommunication:
          (payment['ogm_display'] ?? data['structuredCommunication'])
              ?.toString(),
      epcPayload: payment['epcPayload']?.toString(),
      items: _asOrderItems(data['items']),
    );
  }

  /// Données à passer à BoutiqueOrderConfirmationScreen
  Map<String, dynamic> toConfirmationData() {
    return {
      'orderNumber': orderNumber,
      'payment': {
        'amount': total,
        'iban': iban ?? '',
        'beneficiary': beneficiary ?? 'Calypso',
        'ogm_display': structuredCommunication ?? '',
        'epcPayload': epcPayload ?? '',
      },
      'pricing': {'total': total},
      'structuredCommunication': structuredCommunication,
    };
  }
}

/// Service d'accès Firestore pour la boutique
class BoutiqueService {
  final FirebaseFirestore _firestore;
  final String _clubId;

  BoutiqueService({
    FirebaseFirestore? firestore,
    String? clubId,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _clubId = clubId ?? FirebaseConfig.defaultClubId;

  CollectionReference<Map<String, dynamic>> get _productsRef =>
      _firestore.collection('clubs').doc(_clubId).collection('products');

  CollectionReference<Map<String, dynamic>> get _ordersRef =>
      _firestore.collection('clubs').doc(_clubId).collection('orders');

  // ── Products ─────────────────────────────────────────────────────────────

  /// Stream de tous les produits publiés
  Stream<List<BoutiqueProduct>> streamPublishedProducts() {
    return _productsRef
        .where('visibility', isEqualTo: 'published')
        .snapshots()
        .map(
          (snap) =>
              snap.docs.map(BoutiqueProduct.fromSnapshot).toList(),
        );
  }

  /// Stream d'un seul produit (pour la page détail)
  Stream<BoutiqueProduct?> streamProduct(String productId) {
    return _productsRef.doc(productId).snapshots().map((doc) {
      if (!doc.exists) return null;
      return BoutiqueProduct.fromSnapshot(doc);
    });
  }

  /// Lecture unique d'un produit (utile pour validation au checkout)
  Future<BoutiqueProduct?> getProduct(String productId) async {
    final doc = await _productsRef.doc(productId).get();
    if (!doc.exists) return null;
    return BoutiqueProduct.fromSnapshot(doc);
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /// Stream des commandes d'un membre
  Stream<List<BoutiqueOrder>> streamOrdersForUser(String userId) {
    return _ordersRef
        .where('buyer.userId', isEqualTo: userId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map(
          (snap) =>
              snap.docs.map(BoutiqueOrder.fromSnapshot).toList(),
        );
  }

  /// Lecture unique d'une commande
  Future<BoutiqueOrder?> getOrder(String orderId) async {
    final doc = await _ordersRef.doc(orderId).get();
    if (!doc.exists) return null;
    return BoutiqueOrder.fromSnapshot(doc);
  }
}

// ── Helpers privés ──────────────────────────────────────────────────────────

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return const <String, dynamic>{};
}

List<String> _asStringList(Object? value) {
  if (value is! List) return const <String>[];
  return value.map((e) => e.toString()).toList();
}

double _asDouble(Object? value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

int? _asInt(Object? value) {
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '');
}

double _resolveBasePrice(Map<String, dynamic> data) {
  final pricing = _asMap(data['pricing']);
  final override = pricing['salePriceOverride'];
  if (override != null) return _asDouble(override);
  return _asDouble(pricing['salePrice']);
}

List<BoutiqueVariant> _asVariantList(Object? value) {
  if (value is! List) return const <BoutiqueVariant>[];
  return value.map((e) {
    final map = _asMap(e);
    return BoutiqueVariant(
      id: map['id']?.toString() ?? '',
      label: map['label']?.toString() ?? 'Standard',
      stockCount: _asInt(map['stockCount']),
      allowBackorder: map['allowBackorder'] == true,
      salePriceOverride: map['salePriceOverride'] == null
          ? null
          : _asDouble(map['salePriceOverride']),
    );
  }).where((v) => v.id.isNotEmpty).toList();
}

List<DeliveryMode> _asDeliveryModes(Object? value) {
  if (value is! List) return const <DeliveryMode>[DeliveryMode.poolPickup];
  final modes = value
      .map((e) => DeliveryModeCodec.fromWireValue(e?.toString()))
      .whereType<DeliveryMode>()
      .toList();
  return modes.isEmpty ? const <DeliveryMode>[DeliveryMode.poolPickup] : modes;
}

List<BoutiqueOrderItem> _asOrderItems(Object? value) {
  if (value is! List) return const <BoutiqueOrderItem>[];
  return value.map((e) {
    final map = _asMap(e);
    final snap = _asMap(map['productSnapshot']);
    return BoutiqueOrderItem(
      productId: map['productId']?.toString() ?? '',
      variantId: map['variantId']?.toString() ?? '',
      productName: snap['name']?.toString() ?? 'Produit',
      variantLabel: snap['variantLabel']?.toString() ?? 'Standard',
      qty: _asInt(map['qty']) ?? 1,
      unitPrice: _asDouble(snap['unitPrice']),
      deliveryMode: DeliveryModeCodec.fromWireValue(
            map['deliveryMode']?.toString(),
          ) ??
          DeliveryMode.poolPickup,
    );
  }).toList();
}
