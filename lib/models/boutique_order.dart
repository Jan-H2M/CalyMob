import 'package:cloud_firestore/cloud_firestore.dart';

/// Statussen van een boutique bestelling
/// Matches de V2 types in CalyCompta (types/boutique-v2.ts)
enum BoutiqueOrderStatus {
  cart,             // Winkelmandje (nog niet bevestigd)
  awaitingPayment,  // Wacht op betaling
  paid,             // Betaald
  preparing,        // In voorbereiding
  ready,            // Klaar om af te halen
  delivered,        // Afgehaald/geleverd
  cancelled,        // Geannuleerd
  refunded;         // Terugbetaald

  String get label {
    switch (this) {
      case BoutiqueOrderStatus.cart:
        return 'Panier';
      case BoutiqueOrderStatus.awaitingPayment:
        return 'En attente de paiement';
      case BoutiqueOrderStatus.paid:
        return 'Payée';
      case BoutiqueOrderStatus.preparing:
        return 'En préparation';
      case BoutiqueOrderStatus.ready:
        return 'Prête';
      case BoutiqueOrderStatus.delivered:
        return 'Remise';
      case BoutiqueOrderStatus.cancelled:
        return 'Annulée';
      case BoutiqueOrderStatus.refunded:
        return 'Remboursée';
    }
  }

  bool get isActive => this == BoutiqueOrderStatus.awaitingPayment ||
      this == BoutiqueOrderStatus.paid ||
      this == BoutiqueOrderStatus.preparing ||
      this == BoutiqueOrderStatus.ready;

  bool get isCancellable => this == BoutiqueOrderStatus.awaitingPayment ||
      this == BoutiqueOrderStatus.paid;

  bool get showQr => this == BoutiqueOrderStatus.awaitingPayment;

  static BoutiqueOrderStatus fromString(String value) {
    switch (value) {
      case 'cart':
        return BoutiqueOrderStatus.cart;
      case 'awaiting_payment':
        return BoutiqueOrderStatus.awaitingPayment;
      case 'paid':
        return BoutiqueOrderStatus.paid;
      case 'preparing':
        return BoutiqueOrderStatus.preparing;
      case 'ready':
        return BoutiqueOrderStatus.ready;
      case 'delivered':
        return BoutiqueOrderStatus.delivered;
      case 'cancelled':
        return BoutiqueOrderStatus.cancelled;
      case 'refunded':
        return BoutiqueOrderStatus.refunded;
      default:
        return BoutiqueOrderStatus.awaitingPayment;
    }
  }
}

/// Betalingsstatus voor boutique bestellingen
enum BoutiqueOrderPaymentStatus {
  pending,
  paid,
  failed,
  cancelled,
  refunded;

  String get label {
    switch (this) {
      case BoutiqueOrderPaymentStatus.pending:
        return 'En attente';
      case BoutiqueOrderPaymentStatus.paid:
        return 'Payé';
      case BoutiqueOrderPaymentStatus.failed:
        return 'Échoué';
      case BoutiqueOrderPaymentStatus.cancelled:
        return 'Annulé';
      case BoutiqueOrderPaymentStatus.refunded:
        return 'Remboursé';
    }
  }

  static BoutiqueOrderPaymentStatus fromString(String value) {
    switch (value) {
      case 'pending':
        return BoutiqueOrderPaymentStatus.pending;
      case 'paid':
        return BoutiqueOrderPaymentStatus.paid;
      case 'failed':
        return BoutiqueOrderPaymentStatus.failed;
      case 'cancelled':
        return BoutiqueOrderPaymentStatus.cancelled;
      case 'refunded':
        return BoutiqueOrderPaymentStatus.refunded;
      default:
        return BoutiqueOrderPaymentStatus.pending;
    }
  }
}

/// Leveringsmodus voor een orderitem
enum BoutiqueDeliveryMode {
  digital,
  poolPickup,
  post,
  inPerson;

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

/// Fulfilment status per item
enum BoutiqueFulfillmentStatus {
  pending,
  awaitingRestock,
  preparing,
  ready,
  delivered;

  static BoutiqueFulfillmentStatus fromString(String value) {
    switch (value) {
      case 'pending':
        return BoutiqueFulfillmentStatus.pending;
      case 'awaiting_restock':
        return BoutiqueFulfillmentStatus.awaitingRestock;
      case 'preparing':
        return BoutiqueFulfillmentStatus.preparing;
      case 'ready':
        return BoutiqueFulfillmentStatus.ready;
      case 'delivered':
        return BoutiqueFulfillmentStatus.delivered;
      default:
        return BoutiqueFulfillmentStatus.pending;
    }
  }
}

/// Koper info
class BoutiqueOrderBuyer {
  final String userId;
  final String displayName;
  final String email;
  final String? phone;
  final String? memberId;

  const BoutiqueOrderBuyer({
    required this.userId,
    required this.displayName,
    required this.email,
    this.phone,
    this.memberId,
  });

  factory BoutiqueOrderBuyer.fromFirestore(Map<String, dynamic>? data) {
    return BoutiqueOrderBuyer(
      userId: data?['userId'] as String? ?? '',
      displayName: data?['displayName'] as String? ?? '',
      email: data?['email'] as String? ?? '',
      phone: data?['phone'] as String?,
      memberId: data?['memberId'] as String?,
    );
  }
}

/// Item in een bestelling
class BoutiqueOrderItem {
  final String lineId;
  final String productId;
  final String variantId;
  final int qty;
  final double unitPrice;
  final double lineTotal;
  final String deliveryMode;
  final BoutiqueFulfillmentStatus fulfillmentStatus;

  const BoutiqueOrderItem({
    required this.lineId,
    required this.productId,
    required this.variantId,
    required this.qty,
    required this.unitPrice,
    required this.lineTotal,
    required this.deliveryMode,
    this.fulfillmentStatus = BoutiqueFulfillmentStatus.pending,
  });

  factory BoutiqueOrderItem.fromFirestore(Map<String, dynamic>? data) {
    final d = data ?? <String, dynamic>{};
    return BoutiqueOrderItem(
      lineId: d['lineId'] as String? ?? '',
      productId: d['productId'] as String? ?? '',
      variantId: d['variantId'] as String? ?? '',
      qty: (d['qty'] as num?)?.toInt() ?? 1,
      unitPrice: (d['unitPrice'] as num?)?.toDouble() ?? 0.0,
      lineTotal: (d['lineTotal'] as num?)?.toDouble() ?? 0.0,
      deliveryMode: d['deliveryMode'] as String? ?? 'pool_pickup',
      fulfillmentStatus: BoutiqueFulfillmentStatus.fromString(
          d['fulfillmentStatus'] as String? ?? 'pending'),
    );
  }

  /// The product name is embedded in productSnapshot server-side.
  /// On mobile, we show the variantId as a reference.
}

/// Pricing info
class BoutiqueOrderPricing {
  final double itemsSubtotal;
  final double deliverySurcharges;
  final double total;

  const BoutiqueOrderPricing({
    required this.itemsSubtotal,
    required this.deliverySurcharges,
    required this.total,
  });

  factory BoutiqueOrderPricing.fromFirestore(Map<String, dynamic> data) {
    return BoutiqueOrderPricing(
      itemsSubtotal: (data['itemsSubtotal'] as num?)?.toDouble() ?? 0.0,
      deliverySurcharges: (data['deliverySurcharges'] as num?)?.toDouble() ?? 0.0,
      total: (data['total'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

/// Betalingsinfo
class BoutiqueOrderPayment {
  final String method;
  final String? qrCodeUrl;
  final BoutiqueOrderPaymentStatus status;
  final DateTime? paidAt;
  final String? bankRef;

  const BoutiqueOrderPayment({
    this.method = 'qr_transfer',
    this.qrCodeUrl,
    this.status = BoutiqueOrderPaymentStatus.pending,
    this.paidAt,
    this.bankRef,
  });

  factory BoutiqueOrderPayment.fromFirestore(Map<String, dynamic> data) {
    return BoutiqueOrderPayment(
      method: data['method'] as String? ?? 'qr_transfer',
      qrCodeUrl: data['qrCodeUrl'] as String?,
      status: BoutiqueOrderPaymentStatus.fromString(
          data['status'] as String? ?? 'pending'),
      paidAt: (data['paidAt'] as Timestamp?)?.toDate(),
      bankRef: data['bankRef'] as String?,
    );
  }
}

/// Bankrekening instellingen voor EPC QR code
class BoutiqueBankSettings {
  final String beneficiaryName;
  final String iban;
  final String? bic;

  const BoutiqueBankSettings({
    required this.beneficiaryName,
    required this.iban,
    this.bic,
  });

  factory BoutiqueBankSettings.fromFirestore(Map<String, dynamic> data) {
    return BoutiqueBankSettings(
      beneficiaryName: data['beneficiaryName'] as String? ?? '',
      iban: data['iban'] as String? ?? '',
      bic: data['bic'] as String?,
    );
  }

  bool get isValid =>
      beneficiaryName.isNotEmpty && iban.isNotEmpty;
}

/// Volwaardige bestelling
class BoutiqueOrder {
  final String id;
  final String orderNumber;
  final String structuredCommunication;
  final BoutiqueOrderBuyer buyer;
  final List<BoutiqueOrderItem> items;
  final BoutiqueOrderPricing pricing;
  final BoutiqueOrderPayment payment;
  final BoutiqueOrderStatus status;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime expiresAt;

  const BoutiqueOrder({
    required this.id,
    required this.orderNumber,
    required this.structuredCommunication,
    required this.buyer,
    required this.items,
    required this.pricing,
    required this.payment,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    required this.expiresAt,
  });

  factory BoutiqueOrder.fromFirestore(String id, Map<String, dynamic> data) {
    final itemsList = (data['items'] as List<dynamic>?)
            ?.map((e) => BoutiqueOrderItem.fromFirestore(e as Map<String, dynamic>))
            .toList() ??
        [];

    return BoutiqueOrder(
      id: id,
      orderNumber: data['orderNumber'] as String? ?? id.substring(0, 8),
      structuredCommunication: data['structuredCommunication'] as String? ?? '',
      buyer: BoutiqueOrderBuyer.fromFirestore(
          data['buyer'] as Map<String, dynamic>? ?? {}),
      items: itemsList,
      pricing: BoutiqueOrderPricing.fromFirestore(
          data['pricing'] as Map<String, dynamic>? ?? {}),
      payment: BoutiqueOrderPayment.fromFirestore(
          data['payment'] as Map<String, dynamic>? ?? {}),
      status: BoutiqueOrderStatus.fromString(
          data['status'] as String? ?? 'awaiting_payment'),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      expiresAt: (data['expiresAt'] as Timestamp?)?.toDate() ??
          DateTime.now().add(const Duration(days: 30)),
    );
  }

  /// Aantal items in de bestelling
  int get itemCount =>
      items.fold<int>(0, (sum, item) => sum + item.qty);
}
