import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../models/simple_boutique_order.dart';
import 'crashlytics_service.dart';

/// Service voor eenvoudige boutique orders (kassa-verkoop).
///
/// Collection: clubs/{clubId}/boutique_orders/{orderId}
/// Velden: memberId, items, total, status, created_at, paid_at, qr_code
///
/// Deze service werkt op de eenvoudige boutique_orders collectie,
/// los van de complexe v2 orders (clubs/{clubId}/orders/).
class SimpleBoutiqueOrderService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  CollectionReference _collection(String clubId) =>
      _firestore.collection('clubs').doc(clubId).collection('boutique_orders');

  // ========================================
  // READ
  // ========================================

  /// Stream van alle orders voor een specifiek lid, gesorteerd op created_at (nieuwste eerst).
  Stream<List<SimpleBoutiqueOrder>> listenToMemberOrders({
    required String clubId,
    required String memberId,
  }) {
    final query = _collection(clubId)
        .where('memberId', isEqualTo: memberId)
        .orderBy('created_at', descending: true);

    return query.snapshots().map((snapshot) {
      try {
        return snapshot.docs
            .map((doc) => SimpleBoutiqueOrder.fromFirestore(
                doc.id, doc.data() as Map<String, dynamic>))
            .toList();
      } catch (e) {
        debugPrint('❌ SimpleBoutiqueOrderService parse error: $e');
        CrashlyticsService.log('SimpleBoutiqueOrderService.parseOrders error');
        return <SimpleBoutiqueOrder>[];
      }
    });
  }

  /// Stream van alle orders voor een club (admin view), gesorteerd op created_at.
  Stream<List<SimpleBoutiqueOrder>> listenToAllOrders({
    required String clubId,
  }) {
    final query =
        _collection(clubId).orderBy('created_at', descending: true);

    return query.snapshots().map((snapshot) {
      try {
        return snapshot.docs
            .map((doc) => SimpleBoutiqueOrder.fromFirestore(
                doc.id, doc.data() as Map<String, dynamic>))
            .toList();
      } catch (e) {
        debugPrint('❌ SimpleBoutiqueOrderService parse error: $e');
        CrashlyticsService.log('SimpleBoutiqueOrderService.parseAllOrders error');
        return <SimpleBoutiqueOrder>[];
      }
    });
  }

  /// Haal een specifieke order op (eenmalig).
  Future<SimpleBoutiqueOrder?> getOrder({
    required String clubId,
    required String orderId,
  }) async {
    try {
      final doc =
          await _collection(clubId).doc(orderId).get();

      if (!doc.exists) return null;

      return SimpleBoutiqueOrder.fromFirestore(
          doc.id, doc.data() as Map<String, dynamic>);
    } catch (e) {
      debugPrint('❌ SimpleBoutiqueOrderService getOrder error: $e');
      CrashlyticsService.log('SimpleBoutiqueOrderService.getOrder error');
      return null;
    }
  }

  /// Real-time stream voor een specifieke order.
  Stream<SimpleBoutiqueOrder?> orderStream({
    required String clubId,
    required String orderId,
  }) {
    return _collection(clubId).doc(orderId).snapshots().map((snapshot) {
      if (!snapshot.exists) return null;
      return SimpleBoutiqueOrder.fromFirestore(
          snapshot.id, snapshot.data() as Map<String, dynamic>);
    });
  }

  // ========================================
  // WRITE
  // ========================================

  /// Maak een nieuwe boutique order aan.
  /// Retourneert het aangemaakte document ID.
  Future<String> createOrder({
    required String clubId,
    required String memberId,
    required List<Map<String, dynamic>> items,
    required double total,
    required String qrCode,
  }) async {
    try {
      final now = FieldValue.serverTimestamp();

      final docRef = await _collection(clubId).add({
        'memberId': memberId,
        'items': items,
        'total': total,
        'status': 'pending',
        'qr_code': qrCode,
        'created_at': now,
        'paid_at': null,
        'updated_at': now,
      });

      debugPrint('✅ Simple boutique order created: $docRef.id');
      return docRef.id;
    } catch (e) {
      debugPrint('❌ SimpleBoutiqueOrderService createOrder error: $e');
      CrashlyticsService.log('SimpleBoutiqueOrderService.createOrder error');
      rethrow;
    }
  }

  /// Markeer een order als betaald.
  Future<void> markAsPaid({
    required String clubId,
    required String orderId,
  }) async {
    try {
      await _collection(clubId).doc(orderId).update({
        'status': 'paid',
        'paid_at': FieldValue.serverTimestamp(),
        'updated_at': FieldValue.serverTimestamp(),
      });

      debugPrint('✅ Simple boutique order $orderId marked as paid');
    } catch (e) {
      debugPrint('❌ SimpleBoutiqueOrderService markAsPaid error: $e');
      CrashlyticsService.log('SimpleBoutiqueOrderService.markAsPaid error');
      rethrow;
    }
  }

  /// Annuleer een order.
  Future<void> cancelOrder({
    required String clubId,
    required String orderId,
  }) async {
    try {
      await _collection(clubId).doc(orderId).update({
        'status': 'cancelled',
        'updated_at': FieldValue.serverTimestamp(),
      });

      debugPrint('✅ Simple boutique order $orderId cancelled');
    } catch (e) {
      debugPrint('❌ SimpleBoutiqueOrderService cancelOrder error: $e');
      CrashlyticsService.log('SimpleBoutiqueOrderService.cancelOrder error');
      rethrow;
    }
  }
}
