/// Helper class for permission checking based on club statutes
class PermissionHelper {
  /// Admin statutes that grant administrative permissions
  static const List<String> adminStatutes = [
    'admin',
    'administrateur',
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
}
