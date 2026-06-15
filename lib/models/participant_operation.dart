import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'supplement.dart';

class InstallmentPayment {
  final String status;
  final double amountDue;
  final double? amountPaid;
  final String? transactionId;
  final DateTime? paidAt;
  final DateTime? qrSentAt;

  const InstallmentPayment({
    required this.status,
    required this.amountDue,
    this.amountPaid,
    this.transactionId,
    this.paidAt,
    this.qrSentAt,
  });

  factory InstallmentPayment.fromMap(Map<String, dynamic> map) {
    return InstallmentPayment(
      status: map['status']?.toString() ?? 'unpaid',
      amountDue: (map['amount_due'] as num?)?.toDouble() ?? 0,
      amountPaid: (map['amount_paid'] as num?)?.toDouble(),
      transactionId: map['transaction_id'] as String?,
      paidAt: (map['paid_at'] as Timestamp?)?.toDate(),
      qrSentAt: (map['qr_sent_at'] as Timestamp?)?.toDate(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'status': status,
      'amount_due': amountDue,
      if (amountPaid != null) 'amount_paid': amountPaid,
      if (transactionId != null) 'transaction_id': transactionId,
      if (paidAt != null) 'paid_at': Timestamp.fromDate(paidAt!),
      if (qrSentAt != null) 'qr_sent_at': Timestamp.fromDate(qrSentAt!),
    };
  }
}

/// A single field change in an edit history entry
class ChangeEntry {
  final String field;
  final dynamic from;
  final dynamic to;

  ChangeEntry({
    required this.field,
    this.from,
    this.to,
  });

  factory ChangeEntry.fromMap(Map<String, dynamic> map) {
    return ChangeEntry(
      field: map['field'] as String,
      from: map['from'],
      to: map['to'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'field': field,
      'from': from,
      'to': to,
    };
  }
}

/// A single edit in the edit history of a participant operation
class EditHistoryEntry {
  final DateTime timestamp;
  final List<ChangeEntry> changes;
  final double deltaAmount;
  final String? refundDemandeId;
  final String editedBy;

  EditHistoryEntry({
    required this.timestamp,
    this.changes = const [],
    this.deltaAmount = 0,
    this.refundDemandeId,
    required this.editedBy,
  });

  factory EditHistoryEntry.fromMap(Map<String, dynamic> map) {
    return EditHistoryEntry(
      timestamp: (map['timestamp'] as Timestamp).toDate(),
      changes: (map['changes'] as List<dynamic>?)
              ?.map((c) => ChangeEntry.fromMap(c as Map<String, dynamic>))
              .toList() ??
          [],
      deltaAmount: (map['delta_amount'] as num?)?.toDouble() ?? 0,
      refundDemandeId: map['refund_demande_id'] as String?,
      editedBy: map['edited_by'] as String,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'timestamp': Timestamp.fromDate(timestamp),
      'changes': changes.map((c) => c.toMap()).toList(),
      'delta_amount': deltaAmount,
      'refund_demande_id': refundDemandeId,
      'edited_by': editedBy,
    };
  }
}

/// Model ParticipantOperation - Inscription à une opération
class ParticipantOperation {
  final String id;
  final String operationId;
  final String? operationTitre;
  final String membreId;
  final String? membreNom;
  final String? membrePrenom;
  final double prix;
  final bool paye;
  final DateTime? datePaiement;
  final DateTime dateInscription;
  final String? commentaire;
  final String? notes;
  final List<String> exercices; // IDs des exercices LIFRAS sélectionnés
  final List<SelectedSupplement>
      selectedSupplements; // Suppléments sélectionnés (snapshot)
  final double supplementTotal; // Somme des prix des suppléments
  final String?
      paymentStatus; // Payment status: open, pending, paid, failed, canceled, expired
  final DateTime?
      paymentStatusAt; // Timestamp of last payment_status update (= last QR email sent time when status is 'qr_email_sent')
  final bool
      transactionMatched; // True when bank transaction is matched in CalyCompta
  final String?
      transactionId; // ID of linked bank transaction (fallback source of truth)
  final String? modePaiement; // Payment mode: 'bank', 'cash', 'other'
  final bool? present; // True when member has been marked present at the event
  final DateTime? presentAt; // Timestamp when marked present
  final String? presentBy; // User ID who marked them present
  final String? presentByName; // Name of user who marked them present
  final bool isGuest; // True for non-member guests
  final String? addedBy; // User ID who added the guest (for is_guest=true rows)
  final String? addedByName; // Display name of user who added the guest
  /// For guest inscriptions added by a member through CalyMob: ID of the
  /// inviting member's own inscription. Lets us aggregate the QR payment
  /// (member + their guests = single QR) and cascade actions (when the
  /// parent member unregisters, their guests are removed too). Stays null
  /// for guests added by admins from CalyCompta.
  final String? parentInscriptionId;

  /// ID of the Tariff (from operation.eventTariffs) used to compute this
  /// inscription's price. Lets us know which guest tariff was picked
  /// ("Invité adulte" vs "Invité enfant") and report on tariff usage later.
  final String? tariffId;
  final String? tariffLabel;
  final String? tariffSelectedBy;
  final String? tariffValidationStatus;
  final Map<String, InstallmentPayment> installmentPayments;

  /// Snapshot of the paid amount at the moment paye was set to true.
  /// Used for refund calculations and audit — freezes the amount so it
  /// doesn't change if the inscription price is later edited.
  final double? amountPaid;

  /// Ordered list of edits applied to this inscription. Each entry records
  /// what changed, by whom, and any financial delta.
  final List<EditHistoryEntry>? editHistory;

  ParticipantOperation({
    required this.id,
    required this.operationId,
    this.operationTitre,
    required this.membreId,
    this.membreNom,
    this.membrePrenom,
    required this.prix,
    this.paye = false,
    this.datePaiement,
    required this.dateInscription,
    this.commentaire,
    this.notes,
    this.exercices = const [],
    this.selectedSupplements = const [],
    this.supplementTotal = 0,
    this.paymentStatus,
    this.paymentStatusAt,
    this.transactionMatched = false,
    this.transactionId,
    this.modePaiement,
    this.present,
    this.presentAt,
    this.presentBy,
    this.presentByName,
    this.isGuest = false,
    this.addedBy,
    this.addedByName,
    this.parentInscriptionId,
    this.tariffId,
    this.tariffLabel,
    this.tariffSelectedBy,
    this.tariffValidationStatus,
    this.installmentPayments = const {},
    this.amountPaid,
    this.editHistory,
  });

  /// True when the bank-side reconciliation is considered done.
  ///
  /// Accepts either:
  /// - transactionMatched=true (canonical flag written by CalyCompta)
  /// - transactionId != null (fallback: a bank transaction is linked even
  ///   if the transaction_matched flag got out of sync from legacy code
  ///   paths that forgot to set it)
  bool get _hasMatchedBankTransaction =>
      transactionMatched ||
      (transactionId != null && transactionId!.isNotEmpty);

  /// Payment is confirmed but bank transaction not yet matched
  bool get isPaidAwaitingBank =>
      paye && !_hasMatchedBankTransaction && modePaiement != 'cash';

  /// Payment is fully confirmed (bank transaction matched, or paid in cash)
  bool get isFullyPaid =>
      paye && (_hasMatchedBankTransaction || modePaiement == 'cash');

  /// Total price including supplements
  double get totalPrix => prix + supplementTotal;

  /// True when at least one installment is paid but the inscription as a
  /// whole is not yet fully paid (i.e. a partial / installment payment).
  /// Used to show "Partiellement payé" instead of the misleading "Non payé"
  /// when e.g. only the first acompte has been settled.
  bool get hasPartialPayment =>
      !paye && installmentPayments.values.any((p) => p.status == 'paid');

  /// Get display status for payment
  String get paymentDisplayStatus {
    // Fully paid with bank transaction matched
    if (paye && _hasMatchedBankTransaction) return 'Payé';

    // Paid in cash (no bank transaction involved)
    if (paye && modePaiement == 'cash') return 'Espèces';

    // Paid but awaiting bank reconciliation
    if (paye) return 'Payé via CalyMob\nEn attente banque';

    // At least one installment paid, but not the full inscription yet
    if (hasPartialPayment) return 'Partiellement payé';

    // Check payment_status for pending states
    switch (paymentStatus) {
      case 'qr_email_sent':
        return 'QR code envoyé';
      case 'qr_on_site':
        return 'Paiement sur place';
      case 'cash':
        return 'Espèces';
      default:
        return 'À payer';
    }
  }

  /// Get payment status category for styling
  String get paymentStatusCategory {
    if (paye && _hasMatchedBankTransaction) return 'paid';
    if (paye && modePaiement == 'cash') return 'cash';
    if (paye) return 'pending_bank';
    if (hasPartialPayment) return 'partial';
    switch (paymentStatus) {
      case 'qr_email_sent':
        return 'qr_sent';
      case 'qr_on_site':
        return 'on_site';
      case 'cash':
        return 'cash';
      default:
        return 'unpaid';
    }
  }

  /// Convertir depuis Firestore
  /// Supports both 'operation_id' and legacy 'evenement_id' fields
  factory ParticipantOperation.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    // Handle date_inscription which might be null in some records
    DateTime inscriptionDate;
    if (data['date_inscription'] != null) {
      inscriptionDate = (data['date_inscription'] as Timestamp).toDate();
    } else if (data['created_at'] != null) {
      inscriptionDate = (data['created_at'] as Timestamp).toDate();
    } else {
      inscriptionDate = DateTime.now();
    }

    return ParticipantOperation(
      id: doc.id,
      // Support both field names for compatibility
      operationId: data['operation_id'] ?? data['evenement_id'] ?? '',
      operationTitre: data['operation_titre'] ?? data['evenement_titre'],
      membreId: data['membre_id'] ?? '',
      membreNom: data['membre_nom'],
      membrePrenom: data['membre_prenom'],
      prix: (data['prix'] ?? 0).toDouble(),
      paye: data['paye'] ?? false,
      datePaiement: (data['date_paiement'] as Timestamp?)?.toDate(),
      dateInscription: inscriptionDate,
      commentaire: data['commentaire'],
      notes: data['notes'],
      exercices: List<String>.from(data['exercices'] ?? []),
      selectedSupplements:
          _parseSelectedSupplements(data['selected_supplements']),
      supplementTotal: (data['supplement_total'] ?? 0).toDouble(),
      paymentStatus: data['payment_status'],
      paymentStatusAt: (data['payment_status_at'] as Timestamp?)?.toDate(),
      transactionMatched: data['transaction_matched'] ?? false,
      transactionId: data['transaction_id'] as String?,
      modePaiement: data['mode_paiement'] as String?,
      present: data['present'],
      presentAt: (data['present_at'] as Timestamp?)?.toDate(),
      presentBy: data['present_by'],
      presentByName: data['present_by_name'],
      isGuest: data['is_guest'] ?? false,
      addedBy: data['added_by'] as String?,
      addedByName: data['added_by_name'] as String?,
      parentInscriptionId: data['parent_inscription_id'] as String?,
      tariffId: data['tariff_id'] as String?,
      tariffLabel: data['tariff_label'] as String?,
      tariffSelectedBy: data['tariff_selected_by'] as String?,
      tariffValidationStatus: data['tariff_validation_status'] as String?,
      installmentPayments:
          _parseInstallmentPayments(data['installment_payments']),
      amountPaid: (data['amount_paid'] as num?)?.toDouble(),
      editHistory: _parseEditHistory(data['edit_history']),
    );
  }

  static Map<String, InstallmentPayment> _parseInstallmentPayments(
      dynamic data) {
    if (data is! Map) return const {};
    final result = <String, InstallmentPayment>{};
    data.forEach((key, value) {
      if (value is Map<String, dynamic>) {
        result[key.toString()] = InstallmentPayment.fromMap(value);
      }
    });
    return result;
  }

  /// Parse edit history from Firestore data
  /// Handles null and malformed data gracefully
  static List<EditHistoryEntry>? _parseEditHistory(dynamic data) {
    if (data == null) return null;
    if (data is! List) return null;

    try {
      return data
          .map((e) {
            if (e is! Map<String, dynamic>) return null;
            return EditHistoryEntry.fromMap(e);
          })
          .whereType<EditHistoryEntry>()
          .toList();
    } catch (e) {
      debugPrint('⚠️ Erreur parsing edit_history: $e');
      return null;
    }
  }

  /// Parse selected supplements from Firestore data
  /// Handles null, wrong types, and malformed data gracefully
  static List<SelectedSupplement> _parseSelectedSupplements(dynamic data) {
    if (data == null) return [];
    if (data is! List) return [];

    try {
      return data
          .map((s) {
            if (s is! Map<String, dynamic>) return null;
            return SelectedSupplement.fromMap(s);
          })
          .whereType<SelectedSupplement>()
          .toList();
    } catch (e) {
      debugPrint('⚠️ Erreur parsing selected_supplements: $e');
      return [];
    }
  }

  /// Convertir vers Firestore
  Map<String, dynamic> toFirestore() {
    return {
      'operation_id': operationId,
      'operation_titre': operationTitre,
      'membre_id': membreId,
      'membre_nom': membreNom,
      'membre_prenom': membrePrenom,
      'prix': prix,
      'paye': paye,
      'date_paiement':
          datePaiement != null ? Timestamp.fromDate(datePaiement!) : null,
      'date_inscription': Timestamp.fromDate(dateInscription),
      'commentaire': commentaire,
      'notes': notes,
      'exercices': exercices,
      'selected_supplements':
          selectedSupplements.map((s) => s.toMap()).toList(),
      'supplement_total': supplementTotal,
      'payment_status': paymentStatus,
      'transaction_matched': transactionMatched,
      'transaction_id': transactionId,
      'mode_paiement': modePaiement,
      'present': present,
      'present_at': presentAt != null ? Timestamp.fromDate(presentAt!) : null,
      'present_by': presentBy,
      'present_by_name': presentByName,
      'is_guest': isGuest,
      'added_by': addedBy,
      'added_by_name': addedByName,
      'parent_inscription_id': parentInscriptionId,
      'tariff_id': tariffId,
      'tariff_label': tariffLabel,
      'tariff_selected_by': tariffSelectedBy,
      'tariff_validation_status': tariffValidationStatus,
      'installment_payments': installmentPayments.map(
        (key, value) => MapEntry(key, value.toMap()),
      ),
      'amount_paid': amountPaid,
      'edit_history': editHistory?.map((e) => e.toMap()).toList(),
      'created_at': FieldValue.serverTimestamp(),
      'updated_at': FieldValue.serverTimestamp(),
    };
  }

  /// Copier avec modifications
  ParticipantOperation copyWith({
    String? id,
    String? operationId,
    String? operationTitre,
    String? membreId,
    String? membreNom,
    String? membrePrenom,
    double? prix,
    bool? paye,
    DateTime? datePaiement,
    DateTime? dateInscription,
    String? commentaire,
    String? notes,
    List<String>? exercices,
    List<SelectedSupplement>? selectedSupplements,
    double? supplementTotal,
    String? paymentStatus,
    DateTime? paymentStatusAt,
    bool? transactionMatched,
    String? transactionId,
    String? modePaiement,
    bool? present,
    DateTime? presentAt,
    String? presentBy,
    String? presentByName,
    bool? isGuest,
    String? addedBy,
    String? addedByName,
    String? parentInscriptionId,
    String? tariffId,
    String? tariffLabel,
    String? tariffSelectedBy,
    String? tariffValidationStatus,
    Map<String, InstallmentPayment>? installmentPayments,
    double? amountPaid,
    List<EditHistoryEntry>? editHistory,
  }) {
    return ParticipantOperation(
      id: id ?? this.id,
      operationId: operationId ?? this.operationId,
      operationTitre: operationTitre ?? this.operationTitre,
      membreId: membreId ?? this.membreId,
      membreNom: membreNom ?? this.membreNom,
      membrePrenom: membrePrenom ?? this.membrePrenom,
      prix: prix ?? this.prix,
      paye: paye ?? this.paye,
      datePaiement: datePaiement ?? this.datePaiement,
      dateInscription: dateInscription ?? this.dateInscription,
      commentaire: commentaire ?? this.commentaire,
      notes: notes ?? this.notes,
      exercices: exercices ?? this.exercices,
      selectedSupplements: selectedSupplements ?? this.selectedSupplements,
      supplementTotal: supplementTotal ?? this.supplementTotal,
      paymentStatus: paymentStatus ?? this.paymentStatus,
      paymentStatusAt: paymentStatusAt ?? this.paymentStatusAt,
      transactionMatched: transactionMatched ?? this.transactionMatched,
      transactionId: transactionId ?? this.transactionId,
      modePaiement: modePaiement ?? this.modePaiement,
      present: present ?? this.present,
      presentAt: presentAt ?? this.presentAt,
      presentBy: presentBy ?? this.presentBy,
      presentByName: presentByName ?? this.presentByName,
      isGuest: isGuest ?? this.isGuest,
      addedBy: addedBy ?? this.addedBy,
      addedByName: addedByName ?? this.addedByName,
      parentInscriptionId: parentInscriptionId ?? this.parentInscriptionId,
      tariffId: tariffId ?? this.tariffId,
      tariffLabel: tariffLabel ?? this.tariffLabel,
      tariffSelectedBy: tariffSelectedBy ?? this.tariffSelectedBy,
      tariffValidationStatus:
          tariffValidationStatus ?? this.tariffValidationStatus,
      installmentPayments: installmentPayments ?? this.installmentPayments,
      amountPaid: amountPaid ?? this.amountPaid,
      editHistory: editHistory ?? this.editHistory,
    );
  }
}
