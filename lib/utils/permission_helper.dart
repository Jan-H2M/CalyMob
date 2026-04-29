/// Helper class for permission checking based on club statutes
class PermissionHelper {
  /// LIFRAS Moniteur niveaux — mogen LIFRAS-oefeningen / examens valideren.
  /// Bewust ZONDER 'AM' (Assistant Moniteur): per LIFRAS valideert AM enkel
  /// onder supervisie van een MC+; tot we die supervisor-flow modelleren
  /// behandelen we AM als niet validatie-bevoegd.
  static const List<String> moniteurCodes = ['MC', 'MF', 'MN'];

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

  /// Roles that can use the attendance scanner.
  /// Strict production gate — any logged-in member without one of these
  /// fonctions cannot scan. The previous 'membre' / empty-list testing
  /// fallback was removed on 2026-04-29.
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

  /// Check if user can use the attendance scanner.
  ///
  /// Returns true if any of the user's clubStatuten matches [scannerRoles].
  /// fonctionDefaut serves as a fallback when clubStatuten is empty (e.g.
  /// legacy member data without explicit fonctions). When neither
  /// clubStatuten nor fonctionDefaut yields a match, returns false.
  ///
  /// As of 2026-04-29 this gate is strict — there is no "allow all logged-in
  /// users" fallback. Members without an authorising fonction cannot scan.
  static bool canScan(List<String> clubStatuten, {String? fonctionDefaut}) {
    final List<String> rolesToCheck = List<String>.from(clubStatuten);

    if (rolesToCheck.isEmpty && fonctionDefaut != null && fonctionDefaut.isNotEmpty) {
      rolesToCheck.add(fonctionDefaut);
    }

    if (rolesToCheck.isEmpty) {
      return false;
    }

    final normalizedStatuten = rolesToCheck
        .map((s) => s.toLowerCase().trim())
        .toList();

    return scannerRoles.any(
      (role) => normalizedStatuten.contains(role.toLowerCase()),
    );
  }

  /// True als de user LIFRAS Moniteur is (plongeur_code in MC / MF / MN).
  /// Mirrors `isMoniteur(user)` in CalyCompta/src/utils/fieldMapper.ts and
  /// `isMoniteurForClub(clubId)` in firestore.rules.
  static bool isMoniteur(String? plongeurCode) {
    if (plongeurCode == null) return false;
    return moniteurCodes.contains(plongeurCode.trim().toUpperCase());
  }

  /// LIFRAS-validatie-gate: pedagogische beslissingen (oefeningen valideren,
  /// observaties, niveau-toewijzingen) vereisen Encadrant-fonctie ÉN
  /// Moniteur-niveau, of admin.
  static bool canValidateLifras({
    required List<String> clubStatuten,
    required String? plongeurCode,
  }) {
    if (isAdmin(clubStatuten)) return true;
    final normalized = clubStatuten.map((s) => s.toLowerCase().trim()).toList();
    final hasEncadrant = normalized.contains('encadrant') || normalized.contains('encadrants');
    return hasEncadrant && isMoniteur(plongeurCode);
  }
}
