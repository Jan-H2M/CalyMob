import 'package:cloud_firestore/cloud_firestore.dart';

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
  final String? paymentStatus; // Mollie status: open, pending, paid, failed, canceled, expired
  final bool transactionMatched; // True when bank transaction is matched in CalyCompta

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
    this.paymentStatus,
    this.transactionMatched = false,
  });

  /// Payment is confirmed via Mollie but bank transaction not yet matched
  bool get isPaidAwaitingBank => paye && !transactionMatched;

  /// Payment is fully confirmed (bank transaction matched)
  bool get isFullyPaid => paye && transactionMatched;

  /// Get display status for payment
  String get paymentDisplayStatus {
    if (!paye) return 'À payer';
    if (isPaidAwaitingBank) return 'Payé via CalyMob\nEn attente de traitement bancaire';
    return 'Payé';
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
      paymentStatus: data['payment_status'],
      transactionMatched: data['transaction_matched'] ?? false,
    );
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
      'date_paiement': datePaiement != null ? Timestamp.fromDate(datePaiement!) : null,
      'date_inscription': Timestamp.fromDate(dateInscription),
      'commentaire': commentaire,
      'notes': notes,
      'exercices': exercices,
      'payment_status': paymentStatus,
      'transaction_matched': transactionMatched,
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
    String? paymentStatus,
    bool? transactionMatched,
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
      paymentStatus: paymentStatus ?? this.paymentStatus,
      transactionMatched: transactionMatched ?? this.transactionMatched,
    );
  }
}
