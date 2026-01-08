import 'package:cloud_firestore/cloud_firestore.dart';

/// Model ExpenseClaim - Demande de remboursement
class ExpenseClaim {
  final String id;
  final String clubId;
  final String demandeurId;
  final String? demandeurNom;
  final double montant;
  final String description;
  final String? categorie;
  final String? codeComptable;
  final String? codeComptableLabel;
  final String statut; // 'soumis', 'en_attente_validation', 'approuve', 'rembourse', 'refuse'
  final DateTime dateDepense;
  final DateTime dateDemande;
  final List<String> urlsJustificatifs;
  final String? operationId; // Lien optionnel vers opération

  // Premier approbateur
  final DateTime? dateApprobation;
  final String? approuvePar;
  final String? appouveParNom;

  // Deuxième approbateur (pour montants > seuil)
  final DateTime? dateApprobation2;
  final String? approuvePar2;
  final String? approuvePar2Nom;
  final bool requiresDoubleApproval;

  // Refus
  final DateTime? dateRefus;
  final String? refusePar;
  final String? refuseParNom;
  final String? motifRefus;

  ExpenseClaim({
    required this.id,
    required this.clubId,
    required this.demandeurId,
    this.demandeurNom,
    required this.montant,
    required this.description,
    this.categorie,
    this.codeComptable,
    this.codeComptableLabel,
    required this.statut,
    required this.dateDepense,
    required this.dateDemande,
    this.urlsJustificatifs = const [],
    this.operationId,
    this.dateApprobation,
    this.approuvePar,
    this.appouveParNom,
    this.dateApprobation2,
    this.approuvePar2,
    this.approuvePar2Nom,
    this.requiresDoubleApproval = false,
    this.dateRefus,
    this.refusePar,
    this.refuseParNom,
    this.motifRefus,
  });

  /// Helper to parse date fields that can be Timestamp, String, or null
  static DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    if (value is Timestamp) return value.toDate();
    if (value is String) {
      try {
        return DateTime.parse(value);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /// Convertir depuis Firestore
  factory ExpenseClaim.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    // Handle date fields that can be Timestamp, String, or null
    final dateDepense = _parseDate(data['date_depense']);
    final dateDemande = _parseDate(data['date_demande']);
    final dateApprobation = _parseDate(data['date_approbation']);
    final dateApprobation2 = _parseDate(data['date_approbation_2']);
    final dateRefus = _parseDate(data['date_refus']);

    // Read documents - support both old and new formats
    List<String> documents = [];
    if (data['documents_justificatifs'] != null) {
      // New format: array of objects with {url, nom, type, etc}
      try {
        documents = (data['documents_justificatifs'] as List)
            .map((doc) => doc['url'] as String)
            .toList();
      } catch (e) {
        // If parsing fails, try as simple string array (fallback)
        try {
          documents = List<String>.from(data['documents_justificatifs']);
        } catch (e2) {
          // If both fail, leave empty
          documents = [];
        }
      }
    } else if (data['urls_justificatifs'] != null) {
      // Old format: simple array of URLs
      documents = List<String>.from(data['urls_justificatifs'] ?? []);
    }

    return ExpenseClaim(
      id: doc.id,
      clubId: data['club_id'] ?? '',
      demandeurId: data['demandeur_id'] ?? '',
      demandeurNom: data['demandeur_nom'],
      montant: (data['montant'] ?? 0).toDouble(),
      description: data['description'] ?? '',
      categorie: data['categorie'],
      codeComptable: data['code_comptable'],
      codeComptableLabel: data['code_comptable_label'],
      statut: data['statut'] ?? 'soumis',
      dateDepense: dateDepense ?? DateTime.now(),
      dateDemande: dateDemande ?? DateTime.now(),
      urlsJustificatifs: documents,
      operationId: data['operation_id'],
      dateApprobation: dateApprobation,
      approuvePar: data['approuve_par'],
      appouveParNom: data['approuve_par_nom'],
      dateApprobation2: dateApprobation2,
      approuvePar2: data['approuve_par_2'],
      approuvePar2Nom: data['approuve_par_2_nom'],
      requiresDoubleApproval: data['requires_double_approval'] ?? false,
      dateRefus: dateRefus,
      refusePar: data['refuse_par'],
      refuseParNom: data['refuse_par_nom'],
      motifRefus: data['motif_refus'],
    );
  }

  /// Convertir vers Firestore
  Map<String, dynamic> toFirestore() {
    return {
      'club_id': clubId,
      'demandeur_id': demandeurId,
      'demandeur_nom': demandeurNom,
      'montant': montant,
      'description': description,
      'categorie': categorie ?? 'Autre',
      'code_comptable': codeComptable,
      'code_comptable_label': codeComptableLabel,
      'statut': statut,
      'date_depense': Timestamp.fromDate(dateDepense),
      'date_demande': Timestamp.fromDate(dateDemande),
      'urls_justificatifs': urlsJustificatifs,
      'operation_id': operationId,
      'created_at': FieldValue.serverTimestamp(),
      'updated_at': FieldValue.serverTimestamp(),
    };
  }

  /// Badge de couleur selon statut
  String get statusColor {
    switch (statut) {
      case 'approuve':
      case 'rembourse':
        return 'green';
      case 'refuse':
        return 'red';
      case 'en_attente_validation':
        return 'orange';
      default:
        return 'grey';
    }
  }

  /// Label statut en français
  String get statusLabel {
    switch (statut) {
      case 'soumis':
        return 'En attente';
      case 'en_attente_validation':
        return 'En validation';
      case 'approuve':
        return 'Approuvé';
      case 'rembourse':
        return 'Remboursé';
      case 'refuse':
        return 'Refusé';
      default:
        return statut;
    }
  }
}
