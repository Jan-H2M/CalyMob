import 'operation.dart';
import 'piscine_session.dart';

/// Uniforme wrapper voor Operations en PiscineSession in de activiteitenlijst
/// Maakt het mogelijk om beide types in één lijst te tonen en te filteren
class ActivityItem {
  final String id;
  final String type; // 'operation' of 'piscine'
  final String titre;
  final DateTime date;
  final String? horaire; // "20:30" voor piscine, null voor operations
  final String? lieu;
  final String categorie; // 'plongee', 'piscine', 'sortie'

  // Originele data voor navigatie en detail weergave
  final Operation? operation;
  final PiscineSession? piscineSession;

  // Extra info voor display
  final int? capaciteMax;
  final double? prix;
  final int? accueilCount;
  final int? encadrantCount;

  ActivityItem({
    required this.id,
    required this.type,
    required this.titre,
    required this.date,
    this.horaire,
    this.lieu,
    required this.categorie,
    this.operation,
    this.piscineSession,
    this.capaciteMax,
    this.prix,
    this.accueilCount,
    this.encadrantCount,
  });

  /// Check of dit een piscine sessie is
  bool get isPiscine => type == 'piscine';

  /// Check of dit een reguliere operation is
  bool get isOperation => type == 'operation';

  /// Factory constructor voor Operation → ActivityItem
  factory ActivityItem.fromOperation(Operation op) {
    return ActivityItem(
      id: op.id,
      type: 'operation',
      titre: op.titre,
      date: op.dateDebut ?? DateTime.now(),
      horaire: null, // Operations gebruiken dateDebut met tijd
      lieu: op.lieu,
      categorie: op.categorie ?? 'plongee',
      operation: op,
      piscineSession: null,
      capaciteMax: op.capaciteMax,
      prix: op.prixMembre,
    );
  }

  /// Factory constructor voor PiscineSession → ActivityItem
  factory ActivityItem.fromPiscineSession(PiscineSession session) {
    // Tel encadrants over alle niveaux
    int totalEncadrants = 0;
    for (final level in session.niveaux.values) {
      totalEncadrants += level.encadrants.length;
    }
    totalEncadrants += session.baptemes.length;

    return ActivityItem(
      id: session.id,
      type: 'piscine',
      titre: 'Piscine - ${session.formattedDate}',
      date: session.date,
      horaire: session.horaireDebut,
      lieu: session.lieu,
      categorie: 'piscine',
      operation: null,
      piscineSession: session,
      accueilCount: session.accueil.length,
      encadrantCount: totalEncadrants,
    );
  }

  /// Formateer de datum voor weergave
  String get formattedDate {
    final weekdays = [
      'Lundi',
      'Mardi',
      'Mercredi',
      'Jeudi',
      'Vendredi',
      'Samedi',
      'Dimanche'
    ];
    final months = [
      'janvier',
      'février',
      'mars',
      'avril',
      'mai',
      'juin',
      'juillet',
      'août',
      'septembre',
      'octobre',
      'novembre',
      'décembre'
    ];
    return '${weekdays[date.weekday - 1]} ${date.day} ${months[date.month - 1]}';
  }

  /// Subtitle voor de card (verschilt per type)
  String? get subtitle {
    if (isPiscine) {
      return '$accueilCount accueil · $encadrantCount encadrants';
    }
    return null;
  }
}
