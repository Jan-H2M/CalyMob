import 'package:cloud_firestore/cloud_firestore.dart';
import 'tariff.dart';

/// Model Operation - Événements, cotisations, dons, etc.
class Operation {
  final String id;
  final String type; // 'evenement', 'cotisation', 'don', etc.
  final String? categorie; // 'plongee' ou 'sortie' pour les événements
  final String titre;
  final String? description;
  final double montantPrevu;
  final String statut; // 'brouillon', 'ouvert', 'ferme', 'annule'

  // Spécifique événements
  final DateTime? dateDebut;
  final DateTime? dateFin;
  final String? lieu;
  final int? capaciteMax;
  final double? prixMembre; // Legacy: prix pour membres
  final double? prixNonMembre; // Legacy: prix pour non-membres
  final List<Tariff> eventTariffs; // Nouveau: tarifs flexibles par fonction

  // Organisateur
  final String? organisateurId;
  final String? organisateurNom;

  // Communication
  final String? communication; // Message de l'organisateur aux participants

  // Métadonnées
  final DateTime createdAt;
  final DateTime updatedAt;

  Operation({
    required this.id,
    required this.type,
    this.categorie,
    required this.titre,
    this.description,
    required this.montantPrevu,
    required this.statut,
    this.dateDebut,
    this.dateFin,
    this.lieu,
    this.capaciteMax,
    this.prixMembre,
    this.prixNonMembre,
    this.eventTariffs = const [],
    this.organisateurId,
    this.organisateurNom,
    this.communication,
    required this.createdAt,
    required this.updatedAt,
  });

  /// Convertir depuis Firestore DocumentSnapshot
  factory Operation.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return Operation(
      id: doc.id,
      type: data['type'] ?? 'evenement',
      categorie: data['event_category'],
      titre: data['titre'] ?? '',
      description: data['description'],
      montantPrevu: (data['montant_prevu'] ?? 0).toDouble(),
      statut: data['statut'] ?? 'brouillon',
      dateDebut: (data['date_debut'] as Timestamp?)?.toDate(),
      dateFin: (data['date_fin'] as Timestamp?)?.toDate(),
      lieu: data['lieu'],
      capaciteMax: data['capacite_max'],
      prixMembre: (data['prix_membre'] as num?)?.toDouble(),
      prixNonMembre: (data['prix_non_membre'] as num?)?.toDouble(),
      eventTariffs: _parseTariffs(data['event_tariffs']),
      organisateurId: data['organisateur_id'],
      organisateurNom: data['organisateur_nom'],
      communication: data['communication'],
      createdAt: (data['created_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt: (data['updated_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  /// Parse tariffs from Firestore data with debug logging
  static List<Tariff> _parseTariffs(dynamic tariffsData) {
    if (tariffsData == null) return [];

    final tariffsList = tariffsData as List<dynamic>;
    final tariffs = tariffsList
        .map((t) => Tariff.fromMap(t as Map<String, dynamic>))
        .toList();

    // Debug logging
    if (tariffs.isNotEmpty) {
      print('📊 Parsed ${tariffs.length} tariffs: ${tariffs.map((t) => "${t.label}=${t.price}€ (cat:${t.category})").join(", ")}');
    }

    return tariffs;
  }

  /// Est-ce que l'événement accepte encore des inscriptions ?
  bool isOpenForRegistration({int currentParticipants = 0}) {
    if (statut != 'ouvert') return false;
    if (capaciteMax == null) return true; // Capacité illimitée
    return currentParticipants < capaciteMax!;
  }
}
