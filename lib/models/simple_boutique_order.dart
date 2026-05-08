import 'package:cloud_firestore/cloud_firestore.dart';

/// Item in een eenvoudige boutique order (kassa-verkoop)
class BoutiqueOrderItem {
  final String productId;
  final String productName;
  final String? variantId;
  final String? variantLabel;
  final int qty;
  final double unitPrice;
  final double lineTotal;

  const BoutiqueOrderItem({
    required this.productId,
    required this.productName,
    this.variantId,
    this.variantLabel,
    required this.qty,
    required this.unitPrice,
    required this.lineTotal,
  });

  factory BoutiqueOrderItem.fromFirestore(Map<String, dynamic> data) {
    return BoutiqueOrderItem(
      productId: data['productId'] as String? ?? '',
      productName: data['productName'] as String? ?? '',
      variantId: data['variantId'] as String?,
      variantLabel: data['variantLabel'] as String?,
      qty: (data['qty'] as num?)?.toInt() ?? 1,
      unitPrice: (data['unitPrice'] as num?)?.toDouble() ?? 0.0,
      lineTotal: (data['lineTotal'] as num?)?.toDouble() ?? 0.0,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'productId': productId,
      'productName': productName,
      if (variantId != null) 'variantId': variantId,
      if (variantLabel != null) 'variantLabel': variantLabel,
      'qty': qty,
      'unitPrice': unitPrice,
      'lineTotal': lineTotal,
    };
  }
}

/// Statussen voor een eenvoudige boutique order (kassa-verkoop)
enum SimpleBoutiqueOrderStatus {
  pending,
  paid,
  cancelled,
  refunded;

  String get firestoreValue {
    switch (this) {
      case SimpleBoutiqueOrderStatus.pending:
        return 'pending';
      case SimpleBoutiqueOrderStatus.paid:
        return 'paid';
      case SimpleBoutiqueOrderStatus.cancelled:
        return 'cancelled';
      case SimpleBoutiqueOrderStatus.refunded:
        return 'refunded';
    }
  }

  String get label {
    switch (this) {
      case SimpleBoutiqueOrderStatus.pending:
        return 'En attente';
      case SimpleBoutiqueOrderStatus.paid:
        return 'Payée';
      case SimpleBoutiqueOrderStatus.cancelled:
        return 'Annulée';
      case SimpleBoutiqueOrderStatus.refunded:
        return 'Remboursée';
    }
  }

  static SimpleBoutiqueOrderStatus fromString(String value) {
    switch (value) {
      case 'pending':
        return SimpleBoutiqueOrderStatus.pending;
      case 'paid':
        return SimpleBoutiqueOrderStatus.paid;
      case 'cancelled':
        return SimpleBoutiqueOrderStatus.cancelled;
      case 'refunded':
        return SimpleBoutiqueOrderStatus.refunded;
      default:
        return SimpleBoutiqueOrderStatus.pending;
    }
  }
}

/// Eenvoudige boutique order (kassa-verkoop)
///
/// Collection: clubs/{clubId}/boutique_orders/{orderId}
/// Velden: memberId, items, total, status, created_at, paid_at, qr_code
class SimpleBoutiqueOrder {
  final String id;
  final String memberId;
  final List<BoutiqueOrderItem> items;
  final double total;
  final SimpleBoutiqueOrderStatus status;
  // ignore: non_constant_identifier_names
  final DateTime created_at;
  // ignore: non_constant_identifier_names
  final DateTime? paid_at;
  // ignore: non_constant_identifier_names
  final String qr_code;
  // ignore: non_constant_identifier_names
  final DateTime updated_at;

  const SimpleBoutiqueOrder({
    required this.id,
    required this.memberId,
    required this.items,
    required this.total,
    required this.status,
    required this.created_at,
    this.paid_at,
    required this.qr_code,
    required this.updated_at,
  });

  factory SimpleBoutiqueOrder.fromFirestore(
    String id,
    Map<String, dynamic> data,
  ) {
    final itemsList = (data['items'] as List<dynamic>?)
            ?.map(
              (e) => BoutiqueOrderItem.fromFirestore(e as Map<String, dynamic>),
            )
            .toList() ??
        [];

    return SimpleBoutiqueOrder(
      id: id,
      memberId: data['memberId'] as String? ?? '',
      items: itemsList,
      total: (data['total'] as num?)?.toDouble() ?? 0.0,
      status: SimpleBoutiqueOrderStatus.fromString(
        data['status'] as String? ?? 'pending',
      ),
      created_at: (data['created_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
      paid_at: (data['paid_at'] as Timestamp?)?.toDate(),
      qr_code: data['qr_code'] as String? ?? '',
      updated_at: (data['updated_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  /// Aantal items in de bestelling
  int get itemCount => items.fold<int>(0, (sum, item) => sum + item.qty);

  /// Of de order nog betaald moet worden
  bool get isPending => status == SimpleBoutiqueOrderStatus.pending;

  /// Of de order betaald is
  bool get isPaid => status == SimpleBoutiqueOrderStatus.paid;
}
