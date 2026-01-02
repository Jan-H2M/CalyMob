import 'package:cloud_firestore/cloud_firestore.dart';
import 'supplement.dart';

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
  final List<SelectedSupplement> selectedSupplements; // Suppléments sélectionnés (snapshot)
  final double supplementTotal; // Somme des prix des suppléments
  final String? paymentStatus; // Mollie status: open, pending, paid, failed, canceled, expired
  final bool transactionMatched; // True when bank transaction is matched in CalyCompta
  final bool? present; // True when member has been marked present at the event
  final DateTime? presentAt; // Timestamp when marked present
  final String? presentBy; // User ID who marked them present
  final String? presentByName; // Name of user who marked them present
  final bool isGuest; // True for non-member guests

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
    this.transactionMatched = false,
    this.present,
    this.presentAt,
    this.presentBy,
    this.presentByName,
    this.isGuest = false,
  });

  /// Payment is confirmed via Mollie but bank transaction not yet matched
  bool get isPaidAwaitingBank => paye && !transactionMatched;

  /// Payment is fully confirmed (bank transaction matched)
  bool get isFullyPaid => paye && transactionMatched;

  /// Total price including supplements
  double get totalPrix => prix + supplementTotal;

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
      selectedSupplements: _parseSelectedSupplements(data['selected_supplements']),
      supplementTotal: (data['supplement_total'] ?? 0).toDouble(),
      paymentStatus: data['payment_status'],
      transactionMatched: data['transaction_matched'] ?? false,
      present: data['present'],
      presentAt: (data['present_at'] as Timestamp?)?.toDate(),
      presentBy: data['present_by'],
      presentByName: data['present_by_name'],
      isGuest: data['is_guest'] ?? false,
    );
  }

  /// Parse selected supplements from Firestore data
  static List<SelectedSupplement> _parseSelectedSupplements(dynamic data) {
    if (data == null) return [];
    final list = data as List<dynamic>;
    return list.map((s) => SelectedSupplement.fromMap(s as Map<String, dynamic>)).toList();
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
      'selected_supplements': selectedSupplements.map((s) => s.toMap()).toList(),
      'supplement_total': supplementTotal,
      'payment_status': paymentStatus,
      'transaction_matched': transactionMatched,
      'present': present,
      'present_at': presentAt != null ? Timestamp.fromDate(presentAt!) : null,
      'present_by': presentBy,
      'present_by_name': presentByName,
      'is_guest': isGuest,
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
    bool? transactionMatched,
    bool? present,
    DateTime? presentAt,
    String? presentBy,
    String? presentByName,
    bool? isGuest,
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
      transactionMatched: transactionMatched ?? this.transactionMatched,
      present: present ?? this.present,
      presentAt: presentAt ?? this.presentAt,
      presentBy: presentBy ?? this.presentBy,
      presentByName: presentByName ?? this.presentByName,
      isGuest: isGuest ?? this.isGuest,
    );
  }
}
