import 'operation.dart';
import 'participant_operation.dart';

/// Modèle combinant une Operation et une ParticipantOperation
/// pour afficher "Mes événements"
class UserEventRegistration {
  final Operation operation;
  final ParticipantOperation participant;

  UserEventRegistration({
    required this.operation,
    required this.participant,
  });

  /// L'événement est-il déjà passé ?
  bool get isPast {
    if (operation.dateDebut == null) return false;
    return operation.dateDebut!.isBefore(DateTime.now());
  }

  /// L'événement est-il payé ?
  bool get isPaid => participant.paye;

  /// Statut pour l'affichage
  String get statusLabel {
    if (isPaid) return 'Payé';
    return 'À payer';
  }

  /// Couleur du badge de statut
  String get statusColor {
    if (isPaid) return 'green';
    return 'orange';
  }
}
