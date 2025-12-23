/// Helper class for permission checking based on club statutes
class PermissionHelper {
  /// Admin statutes that grant administrative permissions
  static const List<String> adminStatutes = [
    'admin',
    'administrateur',
    'super admin',
    'super-admin',
    'superadmin',
    'president',
    'président',
    'secretaire',
    'secrétaire',
    'tresorier',
    'trésorier',
    'comite',
    'comité',
    'board',
  ];

  /// Roles that can use the attendance scanner
  static const List<String> scannerRoles = [
    'admin',
    'administrateur',
    'ca',
    'accueil',
    'encadrant',
    'encadrants', // plural form used in database
    'president',
    'président',
    'secretaire',
    'secrétaire',
    'tresorier',
    'trésorier',
    'board',
    'comite',
    'comité',
    'membre', // allow all members to scan for testing
  ];

  /// Check if user has admin permissions based on their club statutes
  static bool isAdmin(List<String> clubStatuten) {
    if (clubStatuten.isEmpty) return false;

    final normalizedStatuten = clubStatuten
        .map((s) => s.toLowerCase().trim())
        .toList();

    return adminStatutes.any(
      (adminStatut) => normalizedStatuten.contains(adminStatut.toLowerCase()),
    );
  }

  /// Check if user can approve expenses
  static bool canApproveExpenses(List<String> clubStatuten) {
    return isAdmin(clubStatuten);
  }

  /// Check if user can manage events
  static bool canManageEvents(List<String> clubStatuten) {
    return isAdmin(clubStatuten);
  }

  /// Check if user can manage announcements
  static bool canManageAnnouncements(List<String> clubStatuten) {
    return isAdmin(clubStatuten);
  }

  /// Check if user can use the attendance scanner
  static bool canScan(List<String> clubStatuten) {
    if (clubStatuten.isEmpty) return false;

    final normalizedStatuten = clubStatuten
        .map((s) => s.toLowerCase().trim())
        .toList();

    return scannerRoles.any(
      (role) => normalizedStatuten.contains(role.toLowerCase()),
    );
  }
}
