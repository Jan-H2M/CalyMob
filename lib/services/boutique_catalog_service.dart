import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../models/boutique_product.dart';
import 'crashlytics_service.dart';

/// Service voor het ophalen van de boutique product catalogus.
///
/// Leest uit Firestore: clubs/{clubId}/products
/// Filtert standaard op visibility == 'published' voor de mobiele app.
class BoutiqueCatalogService {
  final FirebaseFirestore _firestore;

  BoutiqueCatalogService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  /// Stream van alle gepubliceerde producten, gesorteerd op naam.
  Stream<List<BoutiqueProduct>> listenToPublishedProducts({
    required String clubId,
  }) {
    final query = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('products')
        .where('visibility', isEqualTo: 'published')
        .orderBy('name');

    return query.snapshots().map((snapshot) {
      try {
        return snapshot.docs
            .map((doc) => BoutiqueProduct.fromFirestore(
                doc.id, doc.data() as Map<String, dynamic>))
            .toList();
      } catch (e, stack) {
        debugPrint('❌ CatalogService parse error: $e');
        CrashlyticsService.log(
            'BoutiqueCatalogService.parseProducts error: $e');
        return <BoutiqueProduct>[];
      }
    });
  }

  /// Stream van gepubliceerde producten, gefilterd op categorie.
  Stream<List<BoutiqueProduct>> listenToProductsByCategory({
    required String clubId,
    required BoutiqueProductCategory category,
  }) {
    final query = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('products')
        .where('visibility', isEqualTo: 'published')
        .where('category', isEqualTo: category.name)
        .orderBy('name');

    return query.snapshots().map((snapshot) {
      try {
        return snapshot.docs
            .map((doc) => BoutiqueProduct.fromFirestore(
                doc.id, doc.data() as Map<String, dynamic>))
            .toList();
      } catch (e, stack) {
        debugPrint('❌ CatalogService category parse error: $e');
      CrashlyticsService.log(
          'BoutiqueCatalogService.categoryParse error: $e');
        return <BoutiqueProduct>[];
      }
    });
  }

  /// Eenmalig ophalen van een specifiek product.
  Future<BoutiqueProduct?> getProduct({
    required String clubId,
    required String productId,
  }) async {
    try {
      final doc = await _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('products')
          .doc(productId)
          .get();

      if (!doc.exists) return null;

      return BoutiqueProduct.fromFirestore(
          doc.id, doc.data() as Map<String, dynamic>);
    } catch (e, stack) {
      debugPrint('❌ CatalogService getProduct error: $e');
      CrashlyticsService.log(
          'BoutiqueCatalogService.getProduct error: $e');
      return null;
    }
  }

  /// Real-time stream voor een specifiek product.
  Stream<BoutiqueProduct?> productStream({
    required String clubId,
    required String productId,
  }) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('products')
        .doc(productId)
        .snapshots()
        .map((snapshot) {
      if (!snapshot.exists) return null;
      return BoutiqueProduct.fromFirestore(
          snapshot.id, snapshot.data() as Map<String, dynamic>);
    });
  }
}
