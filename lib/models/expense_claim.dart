import 'package:cloud_firestore/cloud_firestore.dart';
import '../contracts/expense_claim_contract.dart';

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

  /// Eerste niet-null waarde uit een lijst sleutels (legacy + canonical namen).
  static dynamic _pick(Map<String, dynamic> data, List<String> keys) {
    for (final k in keys) {
      if (data[k] != null) return data[k];
    }
    return null;
  }

  /// Convertir depuis Firestore — leest ZOWEL legacy (demandes_remboursement)
  /// ALS canonical (expense_claims) veldnamen, zodat de app robuust is tijdens
  /// de migratie. Statussen worden naar de interne (legacy-vorm) gemapt zodat
  /// de bestaande UI (statusLabel/statusColor) ongewijzigd blijft.
  factory ExpenseClaim.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    final dateDepense = _parseDate(_pick(data, ['date_depense', 'expense_date']));
    final dateDemande = _parseDate(_pick(data, ['date_demande', 'requested_at']));
    final dateApprobation = _parseDate(_pick(data, ['date_approbation', 'approved_at']));
    final dateApprobation2 = _parseDate(_pick(data, ['date_approbation_2', 'second_approved_at']));
    final dateRefus = _parseDate(_pick(data, ['date_refus', 'rejected_at']));

    // Documenten: objet-array, simpele URL-array (legacy of canonical)
    List<String> documents = [];
    final docsObj = _pick(data, ['documents_justificatifs', 'supporting_documents']);
    final urls = _pick(data, ['urls_justificatifs', 'supporting_document_urls']);
    if (docsObj != null) {
      try {
        documents = (docsObj as List).map((d) => d['url'] as String).toList();
      } catch (e) {
        try {
          documents = List<String>.from(docsObj);
        } catch (e2) {
          documents = [];
        }
      }
    } else if (urls != null) {
      documents = List<String>.from(urls);
    }

    final rawStatus = _pick(data, ['statut', 'status'])?.toString() ?? 'soumis';

    return ExpenseClaim(
      id: doc.id,
      clubId: data['club_id'] ?? '',
      demandeurId: _pick(data, ['demandeur_id', 'requester_id']) ?? '',
      demandeurNom: _pick(data, ['demandeur_nom', 'requester_name']),
      montant: (_pick(data, ['montant', 'amount']) ?? 0).toDouble(),
      description: _pick(data, ['description', 'title', 'titre']) ?? '',
      categorie: _pick(data, ['categorie', 'category']),
      codeComptable: _pick(data, ['code_comptable', 'account_code']),
      codeComptableLabel: data['code_comptable_label'],
      // canonical->legacy zodat statusLabel/statusColor ongewijzigd werken
      statut: canonicalToLegacyStatus(rawStatus),
      dateDepense: dateDepense ?? DateTime.now(),
      dateDemande: dateDemande ?? DateTime.now(),
      urlsJustificatifs: documents,
      operationId: _pick(data, ['operation_id', 'evenement_id']),
      dateApprobation: dateApprobation,
      approuvePar: _pick(data, ['approuve_par', 'approved_by']),
      appouveParNom: _pick(data, ['approuve_par_nom', 'approved_by_name']),
      dateApprobation2: dateApprobation2,
      approuvePar2: _pick(data, ['approuve_par_2', 'second_approved_by']),
      approuvePar2Nom: _pick(data, ['approuve_par_2_nom', 'second_approved_by_name']),
      requiresDoubleApproval: data['requires_double_approval'] ?? false,
      dateRefus: dateRefus,
      refusePar: _pick(data, ['refuse_par', 'rejected_by']),
      refuseParNom: _pick(data, ['refuse_par_nom', 'rejected_by_name']),
      motifRefus: _pick(data, ['motif_refus', 'rejection_reason']),
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
