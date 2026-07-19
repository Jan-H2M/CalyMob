import 'dart:convert';
import 'dart:math';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/boutique/boutique_product.dart';

@immutable
class BoutiqueCartItem {
  final String key;
  final String productId;
  final String productName;
  final String? imageUrl;
  final String supplierId;
  final String variantId;
  final String variantLabel;
  final String deliveryMode;
  final String deliveryLabel;
  final int qty;
  final double unitPrice;
  final double deliverySurcharge;
  final Map<String, dynamic> personalization;

  const BoutiqueCartItem({
    required this.key,
    required this.productId,
    required this.productName,
    this.imageUrl,
    required this.supplierId,
    required this.variantId,
    required this.variantLabel,
    required this.deliveryMode,
    required this.deliveryLabel,
    required this.qty,
    required this.unitPrice,
    required this.deliverySurcharge,
    required this.personalization,
  });

  double get lineTotal => (unitPrice * qty) + deliverySurcharge;

  bool get hasPersonalization => personalization.isNotEmpty;

  BoutiqueCartItem copyWith({
    int? qty,
    double? unitPrice,
    double? deliverySurcharge,
    String? productName,
  }) {
    return BoutiqueCartItem(
      key: key,
      productId: productId,
      productName: productName ?? this.productName,
      imageUrl: imageUrl,
      supplierId: supplierId,
      variantId: variantId,
      variantLabel: variantLabel,
      deliveryMode: deliveryMode,
      deliveryLabel: deliveryLabel,
      qty: qty ?? this.qty,
      unitPrice: unitPrice ?? this.unitPrice,
      deliverySurcharge: deliverySurcharge ?? this.deliverySurcharge,
      personalization: personalization,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'key': key,
      'productId': productId,
      'productName': productName,
      'imageUrl': imageUrl,
      'supplierId': supplierId,
      'variantId': variantId,
      'variantLabel': variantLabel,
      'deliveryMode': deliveryMode,
      'deliveryLabel': deliveryLabel,
      'qty': qty,
      'unitPrice': unitPrice,
      'deliverySurcharge': deliverySurcharge,
      'personalization': personalization,
    };
  }

  Map<String, dynamic> toOrderPayload({
    Map<String, dynamic>? deliveryAddress,
  }) {
    return {
      'productId': productId,
      'variantId': variantId,
      'qty': qty,
      'deliveryMode': deliveryMode,
      if (deliveryMode == 'post' && deliveryAddress != null)
        'deliveryAddress': deliveryAddress,
      'unitPrice': unitPrice,
      'deliverySurcharge': deliverySurcharge,
      'lineTotal': lineTotal,
      'supplierId': supplierId,
      'productSnapshot': {
        'name': productName,
        'imageUrl': imageUrl,
        'variantLabel': variantLabel,
        'deliveryLabel': deliveryLabel,
        'personalization': personalization,
      },
      if (personalization.isNotEmpty) 'customizations': personalization,
    };
  }

  static BoutiqueCartItem? fromJson(dynamic value) {
    if (value is! Map) return null;
    final data = Map<String, dynamic>.from(value);
    final productId = data['productId']?.toString();
    final productName = data['productName']?.toString();
    final supplierId = data['supplierId']?.toString();
    final variantId = data['variantId']?.toString();
    final variantLabel = data['variantLabel']?.toString();
    final deliveryMode = data['deliveryMode']?.toString() ?? 'pool_pickup';
    final deliveryLabel =
        data['deliveryLabel']?.toString() ?? 'Retrait piscine';
    final key = data['key']?.toString();
    final qty = data['qty'];
    final unitPrice = data['unitPrice'];
    final deliverySurcharge = data['deliverySurcharge'];

    if (productId == null ||
        productName == null ||
        supplierId == null ||
        variantId == null ||
        variantLabel == null ||
        key == null ||
        qty is! num ||
        unitPrice is! num) {
      return null;
    }

    return BoutiqueCartItem(
      key: key,
      productId: productId,
      productName: productName,
      imageUrl: data['imageUrl']?.toString(),
      supplierId: supplierId,
      variantId: variantId,
      variantLabel: variantLabel,
      deliveryMode: deliveryMode,
      deliveryLabel: deliveryLabel,
      qty: qty.toInt(),
      unitPrice: unitPrice.toDouble(),
      deliverySurcharge: deliverySurcharge is num
          ? deliverySurcharge.toDouble()
          : double.tryParse(deliverySurcharge?.toString() ?? '') ?? 0,
      personalization: data['personalization'] is Map
          ? Map<String, dynamic>.from(data['personalization'])
          : const {},
    );
  }
}

class BoutiqueCartProvider extends ChangeNotifier {
  static const String _storageKey = 'boutique_cart_items_v1';
  static const String _idempotencyStorageKey = 'boutique_checkout_key_v1';

  final List<BoutiqueCartItem> _items = [];
  bool _loaded = false;

  BoutiqueCartProvider() {
    _load();
    // Fix audit 2026-07-19 (H1): mandje leegmaken zodra de gebruiker uitlogt —
    // het is toestel-lokaal en mag niet overerven naar een volgende gebruiker.
    // (AuthProvider.logout wist ook de SharedPreferences-keys als vangnet.)
    FirebaseAuth.instance.authStateChanges().listen((user) {
      if (user == null && _items.isNotEmpty) {
        clear();
      }
    });
  }

  bool get loaded => _loaded;

  List<BoutiqueCartItem> get items => List.unmodifiable(_items);

  bool get isEmpty => _items.isEmpty;

  int get itemCount => _items.fold(0, (sum, item) => sum + item.qty);

  double get itemsSubtotal {
    return _items.fold(0, (sum, item) => sum + (item.unitPrice * item.qty));
  }

  double get deliverySurcharges {
    return _items.fold(0, (sum, item) => sum + item.deliverySurcharge);
  }

  double get total => _items.fold(0, (sum, item) => sum + item.lineTotal);

  bool get requiresPostalAddress {
    return _items.any((item) => item.deliveryMode == 'post');
  }

  Future<void> addItem(BoutiqueCartItem item) async {
    final index = _items.indexWhere((existing) => existing.key == item.key);
    if (index >= 0) {
      final existing = _items[index];
      _items[index] = existing.copyWith(qty: existing.qty + item.qty);
    } else {
      _items.add(item);
    }
    await _persist();
    notifyListeners();
  }

  Future<void> updateQty(String key, int qty) async {
    final index = _items.indexWhere((item) => item.key == key);
    if (index < 0) return;
    if (qty <= 0) {
      _items.removeAt(index);
    } else {
      _items[index] = _items[index].copyWith(qty: qty);
    }
    await _persist();
    notifyListeners();
  }

  Future<void> removeItem(String key) async {
    _items.removeWhere((item) => item.key == key);
    await _persist();
    notifyListeners();
  }

  Future<void> clear() async {
    _items.clear();
    await _persist();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_idempotencyStorageKey);
    notifyListeners();
  }

  /// Resultaat van [revalidate] — hoeveel regels verwijderd/geprijsd zijn.
  /// Fix audit 2026-07-19 (H2): het mandje werd nooit gecontroleerd tegen de
  /// actuele catalogus; verwijderde producten en prijswijzigingen bleven staan
  /// tot een verwarrende checkout-fout of een ander bedrag in de betaalmail.
  Future<({int removed, int repriced})> revalidate(
    List<BoutiqueProduct> publishedProducts,
  ) async {
    final productsById = {
      for (final product in publishedProducts) product.id: product,
    };

    var removed = 0;
    var repriced = 0;
    final validated = <BoutiqueCartItem>[];

    for (final item in _items) {
      final product = productsById[item.productId];
      if (product == null) {
        removed += 1;
        continue;
      }
      BoutiqueVariant? variant;
      for (final candidate in product.variants) {
        if (candidate.id == item.variantId) {
          variant = candidate;
          break;
        }
      }
      if (variant == null) {
        removed += 1;
        continue;
      }

      final newUnitPrice = product.priceForVariant(variant) +
          _personalizationSurcharge(product, item.personalization);
      double newDeliverySurcharge = 0;
      for (final entry in product.deliverySurcharges.entries) {
        if (entry.key.name == item.deliveryMode) {
          newDeliverySurcharge = entry.value;
          break;
        }
      }

      if ((newUnitPrice - item.unitPrice).abs() > 0.004 ||
          (newDeliverySurcharge - item.deliverySurcharge).abs() > 0.004) {
        repriced += 1;
        validated.add(item.copyWith(
          unitPrice: newUnitPrice,
          deliverySurcharge: newDeliverySurcharge,
          productName: product.name,
        ));
      } else {
        validated.add(item);
      }
    }

    if (removed > 0 || repriced > 0) {
      _items
        ..clear()
        ..addAll(validated);
      await _persist();
      notifyListeners();
    }

    return (removed: removed, repriced: repriced);
  }

  /// Herrekent de personalisatie-toeslag uit de actuele productconfig —
  /// zelfde logica als de server (computeCustomizations in createOrder.js).
  double _personalizationSurcharge(
    BoutiqueProduct product,
    Map<String, dynamic> personalization,
  ) {
    final config = product.personalization;
    if (config == null || personalization.isEmpty) return 0;

    var total = 0.0;
    final logo = personalization['clubLogo'];
    if (logo is Map && logo['enabled'] == true) {
      total += config.clubLogo.surcharge;
    }
    final name = personalization['name'];
    final nameText =
        name is Map ? (name['text']?.toString().trim() ?? '') : '';
    if (nameText.isNotEmpty) {
      total += config.name.surcharge +
          nameText.length * config.name.pricePerCharacter;
    }
    final certification = personalization['certification'];
    final certValue = certification is Map
        ? (certification['value']?.toString().trim() ?? '')
        : '';
    if (certValue.isNotEmpty) {
      total += config.certification.surcharge;
    }
    return total;
  }

  /// Idempotency-key voor de checkout (fix audit 2026-07-19, K5).
  /// Eén key per winkelmandje, gepersisteerd zodat een retry na timeout of
  /// app-kill dezelfde key hergebruikt en de server geen tweede order maakt.
  /// Wordt gewist samen met het mandje (na een geslaagde bestelling).
  Future<String> checkoutIdempotencyKey() async {
    final prefs = await SharedPreferences.getInstance();
    final existing = prefs.getString(_idempotencyStorageKey);
    if (existing != null && existing.length >= 16) {
      return existing;
    }
    final random = Random.secure();
    final bytes = List<int>.generate(20, (_) => random.nextInt(256));
    final key = 'chk-${bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join()}';
    await prefs.setString(_idempotencyStorageKey, key);
    return key;
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_storageKey);
    if (raw != null && raw.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is List) {
          for (final entry in decoded) {
            final item = BoutiqueCartItem.fromJson(entry);
            if (item != null) _items.add(item);
          }
        }
      } catch (_) {
        await prefs.remove(_storageKey);
      }
    }
    _loaded = true;
    notifyListeners();
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    final encoded = jsonEncode(_items.map((item) => item.toJson()).toList());
    await prefs.setString(_storageKey, encoded);
  }
}
