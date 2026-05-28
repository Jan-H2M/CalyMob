import 'package:cloud_firestore/cloud_firestore.dart';
import 'tariff.dart';
import 'supplement.dart';
import 'document_justificatif.dart';

/// Model Operation - Événements, cotisations, dons, etc.
class Operation {
  final String id;
  final String type; // 'evenement', 'cotisation', 'don', etc.
  final String? categorie; // 'plongee' ou 'sortie' pour les événements
  final String titre;
  final String? description;
  final double montantPrevu;
  final String statut; // 'brouillon', 'ouvert', 'ferme', 'annule'

  // Unique event number for bank reconciliation
  // Format: 2XXXXX for dive events, 3XXXXX for other events
  final String? eventNumber;

  // Spécifique événements
  final DateTime? dateDebut;
  final DateTime? dateFin;
  final String? lieu;
  final String? lieuId;
  final int? capaciteMax;
  final double? prixMembre; // Legacy: prix pour membres
  final double? prixNonMembre; // Legacy: prix pour non-membres
  final List<Tariff> eventTariffs; // Nouveau: tarifs flexibles par fonction
  final List<Supplement>
      supplements; // Suppléments optionnels (location combinaison, etc.)
  /// Price-to-be-determined flag. When true the event's price has not yet
  /// been set — UI displays "Prix à confirmer" instead of "Gratuit" / price.
  /// Registration stays open; the payment link/QR is sent later once the
  /// organiser fills in [eventTariffs] and clears this flag in CalyCompta.
  final bool priceTbd;

  /// Allow members to register external guests (family / friends) for this
  /// event from CalyMob. When true, members see an "Ajouter un invité" button
  /// after registering, and pay a single aggregated QR for themselves + their
  /// guests. Guest pricing comes from [eventTariffs] entries with
  /// isGuestTariff=true. Default false — preserves current behaviour where
  /// only admins/encadrants can add guests via the existing flow.
  final bool allowGuests;

  // Organisateur (can be reassigned after creation)
  final String? organisateurId;
  final String? organisateurNom;

  /// Firebase UID of the user who originally created this operation. Used to
  /// authorize later changes (e.g. reassigning the responsable). Set at
  /// creation time and never changed afterwards. Distinct from the
  /// `created_by` source tag (e.g. 'manual', 'transaction') used elsewhere.
  final String? creatorUserId;

  // Communication
  final String? communication; // Message de l'organisateur aux participants

  // Documents justificatifs (uploaded via CalyCompta)
  final List<DocumentJustificatif> documentsJustificatifs;

  // Info document (single document displayed with description in CalyMob)
  final DocumentJustificatif? infoDocument;

  // Deadline d'inscription (optionnel, sinon dateDebut - 24h)
  final DateTime? registrationDeadline;

  /// Effective deadline for registration modifications.
  /// Falls back to dateDebut - 24h when no explicit deadline is set.
  DateTime? get effectiveDeadline {
    if (registrationDeadline != null) return registrationDeadline;
    if (dateDebut != null)
      return dateDebut!.subtract(const Duration(hours: 24));
    return null;
  }

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
    this.eventNumber,
    this.dateDebut,
    this.dateFin,
    this.lieu,
    this.lieuId,
    this.capaciteMax,
    this.prixMembre,
    this.prixNonMembre,
    this.eventTariffs = const [],
    this.supplements = const [],
    this.priceTbd = false,
    this.allowGuests = false,
    this.organisateurId,
    this.organisateurNom,
    this.creatorUserId,
    this.communication,
    this.documentsJustificatifs = const [],
    this.infoDocument,
    this.registrationDeadline,
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
      eventNumber: data['event_number'],
      dateDebut: (data['date_debut'] as Timestamp?)?.toDate(),
      dateFin: (data['date_fin'] as Timestamp?)?.toDate(),
      lieu: data['lieu'],
      lieuId: data['lieu_id'],
      capaciteMax: data['capacite_max'],
      prixMembre: (data['prix_membre'] as num?)?.toDouble(),
      prixNonMembre: (data['prix_non_membre'] as num?)?.toDouble(),
      eventTariffs: _parseTariffs(data['event_tariffs']),
      supplements: _parseSupplements(data['supplements']),
      priceTbd: data['price_tbd'] == true,
      allowGuests: data['allow_guests'] == true,
      organisateurId: data['organisateur_id'],
      organisateurNom: data['organisateur_nom'],
      creatorUserId: data['creator_user_id'],
      communication: data['communication'],
      documentsJustificatifs: _parseDocuments(data['documents_justificatifs']),
      infoDocument: data['info_document'] != null
          ? DocumentJustificatif.fromMap(
              data['info_document'] as Map<String, dynamic>)
          : null,
      registrationDeadline:
          (data['registration_deadline'] as Timestamp?)?.toDate(),
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
      print(
          '📊 Parsed ${tariffs.length} tariffs: ${tariffs.map((t) => "${t.label}=${t.price}€ (cat:${t.category})").join(", ")}');
    }

    return tariffs;
  }

  /// Parse supplements from Firestore data
  static List<Supplement> _parseSupplements(dynamic supplementsData) {
    if (supplementsData == null) return [];

    final supplementsList = supplementsData as List<dynamic>;
    return supplementsList
        .map((s) => Supplement.fromMap(s as Map<String, dynamic>))
        .toList();
  }

  /// Parse documents justificatifs from Firestore data
  static List<DocumentJustificatif> _parseDocuments(dynamic docsData) {
    if (docsData == null) return [];

    final docsList = docsData as List<dynamic>;
    return docsList
        .map((d) => DocumentJustificatif.fromMap(d as Map<String, dynamic>))
        .toList();
  }

  /// Est-ce que l'événement accepte encore des inscriptions ?
  bool isOpenForRegistration({int currentParticipants = 0}) {
    if (statut != 'ouvert') return false;
    if (capaciteMax == null) return true; // Capacité illimitée
    return currentParticipants < capaciteMax!;
  }
}
