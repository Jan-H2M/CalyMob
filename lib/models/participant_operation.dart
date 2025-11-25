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
  });

  /// Convertir depuis Firestore
  factory ParticipantOperation.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return ParticipantOperation(
      id: doc.id,
      operationId: data['operation_id'] ?? '',
      operationTitre: data['operation_titre'],
      membreId: data['membre_id'] ?? '',
      membreNom: data['membre_nom'],
      membrePrenom: data['membre_prenom'],
      prix: (data['prix'] ?? 0).toDouble(),
      paye: data['paye'] ?? false,
      datePaiement: (data['date_paiement'] as Timestamp?)?.toDate(),
      dateInscription: (data['date_inscription'] as Timestamp).toDate(),
      commentaire: data['commentaire'],
      notes: data['notes'],
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
      'created_at': FieldValue.serverTimestamp(),
      'updated_at': FieldValue.serverTimestamp(),
    };
  }
}
