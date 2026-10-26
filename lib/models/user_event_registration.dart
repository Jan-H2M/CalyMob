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
  bool get isPaid => participant.isPaymentSettled;

  /// A bank receipt was linked to this participant but still requires a
  /// CalyCompta decision. This is not the same as an unpaid QR request.
  bool get isPaymentInManualReview => participant.isPaymentInManualReview;

  /// Payment is confirmed via Mollie but bank transaction not yet matched
  bool get isPaidAwaitingBank => participant.isPaidAwaitingBank;

  /// Payment is fully confirmed (bank transaction matched)
  bool get isFullyPaid => participant.isFullyPaid;

  /// Statut pour l'affichage
  String get statusLabel {
    if (isPaymentInManualReview) return 'Vérification bancaire';
    if (!isPaid) return 'À payer';
    if (isPaidAwaitingBank) return 'En attente banque';
    return 'Payé';
  }

  /// Couleur du badge de statut
  String get statusColor {
    if (isPaymentInManualReview) return 'deepOrange';
    if (!isPaid) return 'orange';
    if (isPaidAwaitingBank) return 'amber';
    return 'green';
  }
}
