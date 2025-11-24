/// Helper pour vérifier les permissions des utilisateurs
class PermissionHelper {
  /// Vérifier si l'utilisateur est admin (CA = Conseil d'Administration)
  static bool isAdmin(List<String>? clubStatuten) {
    if (clubStatuten == null || clubStatuten.isEmpty) {
      return false;
    }

    // Check for 'CA' (case-insensitive)
    return clubStatuten.any(
      (statut) => statut.toUpperCase() == 'CA' || statut.toLowerCase() == 'ca',
    );
  }

  /// Vérifier si l'utilisateur a un rôle spécifique
  static bool hasRole(List<String>? clubStatuten, String role) {
    if (clubStatuten == null || clubStatuten.isEmpty) {
      return false;
    }

    return clubStatuten.any(
      (statut) => statut.toLowerCase() == role.toLowerCase(),
    );
  }

  /// Vérifier si l'utilisateur est encadrant (instructeur)
  static bool isInstructor(List<String>? clubStatuten) {
    return hasRole(clubStatuten, 'Encadrant') ||
        hasRole(clubStatuten, 'Instructor');
  }

  /// Vérifier si l'utilisateur a des droits d'administration
  /// (CA ou autre rôle administratif)
  static bool hasAdminRights(List<String>? clubStatuten) {
    if (clubStatuten == null || clubStatuten.isEmpty) {
      return false;
    }

    // Admin roles
    return isAdmin(clubStatuten) ||
        hasRole(clubStatuten, 'Président') ||
        hasRole(clubStatuten, 'Trésorier') ||
        hasRole(clubStatuten, 'Comité');
  }
}
