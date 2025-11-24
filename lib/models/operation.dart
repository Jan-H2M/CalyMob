import 'package:cloud_firestore/cloud_firestore.dart';
import 'tariff.dart';

/// Model Operation - Événements, cotisations, dons, etc.
class Operation {
  final String id;
  final String type; // 'evenement', 'cotisation', 'don', etc.
  final String titre;
  final String? description;
  final double montantPrevu;
  final String statut; // 'brouillon', 'ouvert', 'ferme', 'annule'

  // Spécifique événements
  final DateTime? dateDebut;
  final DateTime? dateFin;
  final String? lieu;
  final String? lieuId; // Référence au lieu de plongée
  final int? capaciteMax;

  // Tarifs (ancien système - DEPRECATED mais conservé pour compatibilité)
  final double? prixMembre;
  final double? prixNonMembre;

  // Tarifs flexibles (nouveau système CalyCompta)
  final List<Tariff>? eventTariffs;

  // Organisateur
  final String? organisateurId;
  final String? organisateurNom;

  // Métadonnées
  final DateTime createdAt;
  final DateTime updatedAt;

  Operation({
    required this.id,
    required this.type,
    required this.titre,
    this.description,
    required this.montantPrevu,
    required this.statut,
    this.dateDebut,
    this.dateFin,
    this.lieu,
    this.lieuId,
    this.capaciteMax,
    this.prixMembre,
    this.prixNonMembre,
    this.eventTariffs,
    this.organisateurId,
    this.organisateurNom,
    required this.createdAt,
    required this.updatedAt,
  });

  /// Convertir depuis Firestore DocumentSnapshot
  factory Operation.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    // Charger les tarifs flexibles si présents
    List<Tariff>? tariffs;
    if (data['event_tariffs'] != null) {
      final tariffsData = data['event_tariffs'] as List<dynamic>;
      tariffs = tariffsData
          .map((t) => Tariff.fromMap(t as Map<String, dynamic>))
          .toList();
    }

    return Operation(
      id: doc.id,
      type: data['type'] ?? 'evenement',
      titre: data['titre'] ?? '',
      description: data['description'],
      montantPrevu: (data['montant_prevu'] ?? 0).toDouble(),
      statut: data['statut'] ?? 'brouillon',
      dateDebut: (data['date_debut'] as Timestamp?)?.toDate(),
      dateFin: (data['date_fin'] as Timestamp?)?.toDate(),
      lieu: data['lieu'],
      lieuId: data['lieu_id'],
      capaciteMax: data['capacite_max'],
      prixMembre: (data['prix_membre'] as num?)?.toDouble(),
      prixNonMembre: (data['prix_non_membre'] as num?)?.toDouble(),
      eventTariffs: tariffs,
      organisateurId: data['organisateur_id'],
      organisateurNom: data['organisateur_nom'],
      createdAt: (data['created_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt: (data['updated_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  /// Est-ce que l'événement accepte encore des inscriptions ?
  bool isOpenForRegistration({int currentParticipants = 0}) {
    if (statut != 'ouvert') return false;
    if (capaciteMax == null) return true; // Capacité illimitée
    return currentParticipants < capaciteMax!;
  }
}
