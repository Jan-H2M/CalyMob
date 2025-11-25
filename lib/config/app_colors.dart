import 'package:flutter/material.dart';

/// Couleurs de l'application CalyMob
/// Centralise toutes les couleurs pour cohérence visuelle
class AppColors {
  // Empêcher l'instanciation
  AppColors._();

  // === Couleurs principales ===
  static const Color primary = Color(0xFF1976D2);        // Bleu Calypso
  static const Color primaryLight = Color(0xFF0066CC);   // Bleu clair
  static const Color secondary = Color(0xFFFF6F00);      // Orange (expenses)
  static const Color tertiary = Color(0xFF4CAF50);       // Vert (approvals)

  // === Couleurs de statut ===
  static const Color success = Color(0xFF4CAF50);        // Vert
  static const Color warning = Colors.orange;
  static const Color error = Colors.red;
  static const Color info = Colors.blue;

  // === Couleurs de fond ===
  static const Color background = Colors.white;
  static Color backgroundGrey = Colors.grey[50]!;
  static Color surfaceGrey = Colors.grey[100]!;

  // === Couleurs de texte ===
  static Color textPrimary = Colors.grey[800]!;
  static Color textSecondary = Colors.grey[600]!;
  static Color textTertiary = Colors.grey[400]!;
  static const Color textOnPrimary = Colors.white;

  // === Couleurs de bordure ===
  static Color border = Colors.grey[300]!;
  static Color borderLight = Colors.grey[200]!;

  // === Couleurs par module ===

  // Événements/Opérations
  static const Color eventsAppBar = Color(0xFF1976D2);

  // Dépenses
  static const Color expensesAppBar = Color(0xFFFF6F00);
  static const Color expensesPrimary = Colors.orange;

  // Approbations
  static const Color approvalsAppBar = Color(0xFF4CAF50);
  static const Color approvalsPrimary = Color(0xFF4CAF50);

  // === Couleurs de statut expense ===
  static Color statusSubmitted = Colors.blue[100]!;
  static Color statusSubmittedText = Colors.blue[900]!;
  static Color statusPending = Colors.orange[100]!;
  static Color statusPendingText = Colors.orange[900]!;
  static Color statusApproved = Colors.green[100]!;
  static Color statusApprovedText = Colors.green[900]!;
  static Color statusReimbursed = Colors.teal[100]!;
  static Color statusReimbursedText = Colors.teal[900]!;
  static Color statusRejected = Colors.red[100]!;
  static Color statusRejectedText = Colors.red[900]!;

  // === Méthodes utilitaires ===

  /// Obtenir la couleur de statut pour les opérations
  static Color getOperationStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'ouvert':
        return success;
      case 'complet':
        return warning;
      case 'ferme':
      case 'fermé':
        return Colors.grey;
      default:
        return Colors.grey;
    }
  }

  /// Obtenir la couleur pour la jauge de participants
  static Color getCapacityColor(double percentage) {
    if (percentage < 0.7) return success;
    if (percentage < 0.9) return warning;
    return error;
  }

  /// Obtenir les couleurs de badge de statut expense
  static (Color background, Color text) getExpenseStatusColors(String status) {
    switch (status) {
      case 'soumis':
        return (statusSubmitted, statusSubmittedText);
      case 'en_attente_validation':
        return (statusPending, statusPendingText);
      case 'approuve':
        return (statusApproved, statusApprovedText);
      case 'rembourse':
        return (statusReimbursed, statusReimbursedText);
      case 'refuse':
        return (statusRejected, statusRejectedText);
      default:
        return (Colors.grey[100]!, Colors.grey[900]!);
    }
  }
}
