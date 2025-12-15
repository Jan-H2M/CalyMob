import 'package:flutter/material.dart';

/// Couleurs de l'application CalyMob
/// Thème maritime avec palette océan
class AppColors {
  // Empêcher l'instanciation
  AppColors._();

  // === Thème Maritime - Couleurs principales ===
  static const Color donkerblauw = Color(0xFF183868);    // Bleu foncé - texte
  static const Color middenblauw = Color(0xFF006DB6);    // Bleu moyen - accents
  static const Color lichtblauw = Color(0xFF6BCBE8);     // Bleu clair - vagues
  static const Color oranje = Color(0xFFF6921E);         // Orange - highlights

  // === Couleurs principales (utilisant le thème maritime) ===
  static const Color primary = middenblauw;              // Bleu moyen
  static const Color primaryLight = lichtblauw;          // Bleu clair
  static const Color primaryDark = donkerblauw;          // Bleu foncé
  static const Color secondary = oranje;                 // Orange
  static const Color tertiary = Color(0xFF4CAF50);       // Vert (approvals)

  // === Couleurs de statut (restent fonctionnelles) ===
  static const Color success = Color(0xFF4CAF50);        // Vert
  static const Color warning = Colors.orange;
  static const Color error = Colors.red;
  static const Color info = middenblauw;

  // === Couleurs de fond ===
  static const Color background = Colors.white;
  static Color backgroundGrey = Colors.grey[50]!;
  static Color surfaceGrey = Colors.grey[100]!;

  // === Couleurs de texte ===
  static const Color textPrimary = donkerblauw;          // Texte principal
  static Color textSecondary = Colors.grey[600]!;
  static Color textTertiary = Colors.grey[400]!;
  static const Color textOnPrimary = Colors.white;       // Texte sur fond bleu
  static const Color textOnOcean = Colors.white;         // Texte sur fond océan

  // === Couleurs de bordure ===
  static Color border = Colors.grey[300]!;
  static Color borderLight = Colors.grey[200]!;

  // === Couleurs AppBar (unifiées avec thème maritime) ===
  static const Color appBarBackground = Colors.transparent;
  static const Color appBarForeground = Colors.white;

  // === Couleurs par module (pour compatibilité, utilisent middenblauw) ===

  // Événements/Opérations
  static const Color eventsAppBar = middenblauw;

  // Dépenses (garde orange comme accent)
  static const Color expensesAppBar = middenblauw;
  static const Color expensesPrimary = oranje;

  // Approbations
  static const Color approvalsAppBar = middenblauw;
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
