import 'package:cloud_firestore/cloud_firestore.dart';

class MaterialLoanItem {
  final String id;
  final String code;
  final String name;
  final String? brand;
  final String? model;
  final String? serialNumber;
  final String status;
  final String? typeId;
  final String? typeName;

  const MaterialLoanItem({
    required this.id,
    required this.code,
    required this.name,
    this.brand,
    this.model,
    this.serialNumber,
    required this.status,
    this.typeId,
    this.typeName,
  });

  String get typeLabel {
    final label = typeName?.trim();
    if (label != null && label.isNotEmpty) return label;

    final normalizedCode = code.toUpperCase();
    final normalizedType = typeId?.toUpperCase() ?? '';
    if (normalizedCode.startsWith('BT-') ||
        normalizedType.contains('BOUTEILLE')) {
      return 'Bouteille';
    }
    if (normalizedCode.startsWith('GILET-') ||
        normalizedType.contains('GILET')) {
      return 'Gilet';
    }
    if (normalizedCode.startsWith('DET-') ||
        normalizedCode.startsWith('REG-') ||
        normalizedType.contains('DETENDEUR')) {
      return 'Detendeur';
    }
    if (normalizedCode.startsWith('ORD-') ||
        normalizedType.contains('ORDINATEUR')) {
      return 'Ordinateur';
    }
    if (normalizedCode.startsWith('LAMP-') ||
        normalizedType.contains('LAMPE')) {
      return 'Lampe';
    }
    return name;
  }

  String get technicalDetails {
    final parts = [
      code,
      if (brand != null && brand!.isNotEmpty) brand,
      if (model != null && model!.isNotEmpty) model,
      if (serialNumber != null && serialNumber!.isNotEmpty)
        'Serie $serialNumber',
    ];
    return parts.join(' - ');
  }

  String get displayName => '$typeLabel - $technicalDetails';

  bool get isBorrowable {
    final normalized = status.trim().toLowerCase();
    return normalized == 'disponible' ||
        normalized == 'available' ||
        normalized == 'en_stock' ||
        normalized == 'libre';
  }

  MaterialLoanItem copyWithTypeName(String? value) {
    return MaterialLoanItem(
      id: id,
      code: code,
      name: name,
      brand: brand,
      model: model,
      serialNumber: serialNumber,
      status: status,
      typeId: typeId,
      typeName: value ?? typeName,
    );
  }

  factory MaterialLoanItem.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    return MaterialLoanItem(
      id: doc.id,
      code: data['code']?.toString() ?? doc.id,
      name: data['nom']?.toString() ?? data['name']?.toString() ?? 'Materiel',
      brand: data['fabricant']?.toString(),
      model: data['modele']?.toString(),
      serialNumber: data['numero_serie']?.toString(),
      status: data['statut']?.toString() ??
          data['status']?.toString() ??
          data['etat_stock']?.toString() ??
          'disponible',
      typeId: data['typeId']?.toString() ?? data['type_id']?.toString(),
      typeName: data['typeName']?.toString() ?? data['type_name']?.toString(),
    );
  }
}

class MaterialLoanRequest {
  final String id;
  final String memberId;
  final String memberName;
  final List<String> itemIds;
  final DateTime? expectedReturnDate;
  final String status;
  final String? notes;
  final DateTime? createdAt;
  final List<MaterialLoanItem> items;

  const MaterialLoanRequest({
    required this.id,
    required this.memberId,
    required this.memberName,
    required this.itemIds,
    this.expectedReturnDate,
    required this.status,
    this.notes,
    this.createdAt,
    required this.items,
  });

  factory MaterialLoanRequest.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc, {
    List<MaterialLoanItem> items = const [],
  }) {
    final data = doc.data() ?? {};
    return MaterialLoanRequest(
      id: doc.id,
      memberId: data['memberId']?.toString() ?? '',
      memberName: data['memberName']?.toString() ?? 'Membre',
      itemIds: (data['itemIds'] as List<dynamic>?)
              ?.map((item) => item.toString())
              .where((item) => item.trim().isNotEmpty)
              .toList() ??
          const [],
      expectedReturnDate: _dateFromValue(
          data['date_retour_prevue'] ?? data['expectedReturnDate']),
      status: data['status']?.toString() ?? 'submitted',
      notes: data['notes']?.toString(),
      createdAt: _dateFromValue(data['createdAt'] ?? data['created_at']),
      items: items,
    );
  }
}

class MaterialLoan {
  final String id;
  final String loanNumber;
  final String memberId;
  final String memberName;
  final List<String> itemIds;
  final DateTime? loanDate;
  final DateTime? expectedReturnDate;
  final double cautionAmount;
  final String cautionStatus;
  final String status;
  final String? refundDemandId;
  final List<MaterialLoanItem> items;

  const MaterialLoan({
    required this.id,
    required this.loanNumber,
    required this.memberId,
    required this.memberName,
    required this.itemIds,
    this.loanDate,
    this.expectedReturnDate,
    required this.cautionAmount,
    required this.cautionStatus,
    required this.status,
    this.refundDemandId,
    required this.items,
  });

  bool get hasRefundDemand =>
      refundDemandId != null && refundDemandId!.isNotEmpty;

  factory MaterialLoan.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc, {
    List<MaterialLoanItem> items = const [],
  }) {
    final data = doc.data() ?? {};
    final loanNumber = data['loanNumber']?.toString() ??
        data['loan_number']?.toString() ??
        'PRET-${doc.id}';

    return MaterialLoan(
      id: doc.id,
      loanNumber: loanNumber,
      memberId:
          data['memberId']?.toString() ?? data['member_id']?.toString() ?? '',
      memberName: data['memberName']?.toString() ??
          data['member_name']?.toString() ??
          data['membre_nom']?.toString() ??
          'Membre',
      itemIds: (data['itemIds'] as List<dynamic>?)
              ?.map((item) => item.toString())
              .where((item) => item.trim().isNotEmpty)
              .toList() ??
          const [],
      loanDate: _dateFromValue(data['date_pret'] ?? data['date_debut']),
      expectedReturnDate:
          _dateFromValue(data['date_retour_prevue'] ?? data['date_fin_prevue']),
      cautionAmount: _doubleFromValue(
        data['caution_amount'] ??
            data['montant_caution'] ??
            data['caution_montant'],
      ),
      cautionStatus: data['caution_payment_status']?.toString() ??
          (data['caution_payee'] == true ? 'paid' : 'unpaid'),
      status: data['statut']?.toString() ?? 'actif',
      refundDemandId: data['caution_refund_demand_id']?.toString(),
      items: items,
    );
  }
}

DateTime? _dateFromValue(dynamic value) {
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  if (value is String) return DateTime.tryParse(value);
  return null;
}

double _doubleFromValue(dynamic value) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value.replaceAll(',', '.')) ?? 0;
  return 0;
}
