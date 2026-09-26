import '../models/team_channel.dart';

class ClubRoleUtils {
  static Set<String> normalizeRoles(List<String> roles) {
    final normalized = <String>{};

    for (final rawRole in roles) {
      final role = rawRole.trim().toLowerCase();
      if (role.isEmpty) continue;

      if (role == 'm' || role == 'membre' || role == 'member') {
        normalized.add('member');
      } else if (role == 'ca' ||
          role == 'conseil administration' ||
          role == 'comite' ||
          role == 'comité') {
        normalized.add('ca');
        // Career and pool encadrants deliberately normalize to different values:
        // the former shares career team/formation access; the latter must not.
      } else if (role == 'e' ||
          role == 'encadrant' ||
          role == 'encadrants' ||
          role == 'encadrant carrière') {
        normalized.add('encadrant');
      } else if (role == 'p' ||
          role == 'piscine' ||
          role == 'encadrant piscine' ||
          role == 'encadrants et assistants') {
        normalized.add('encadrant_piscine');
      } else if (role == 'a' || role == 'accueil') {
        normalized.add('accueil');
      } else if (role == 'g' || role == 'gonflage') {
        normalized.add('gonflage');
      } else if (role == 'bs' || role == 'banque signature') {
        normalized.add('bs');
      } else {
        normalized.add(role);
      }
    }

    return normalized;
  }

  /// Availability roles shown in the pool profile. Pool assistants and
  /// official Encadrants share the same pool and theory availability roster;
  /// only the latter retain career/LIFRAS permissions elsewhere.
  static List<String> piscineAvailabilityRoles(List<String> roles) {
    final normalized = normalizeRoles(roles);
    final out = <String>[];
    if (normalized.contains('encadrant') ||
        normalized.contains('encadrant_piscine')) {
      out.addAll(['encadrant', 'theorie']);
    }
    if (normalized.contains('accueil')) out.add('accueil');
    if (normalized.contains('gonflage')) out.add('gonflage');
    return out;
  }

  static bool hasAdminAccess(List<String> roles, {String? appRole}) {
    final normalizedAppRole = appRole?.trim().toLowerCase();
    return normalizedAppRole == 'admin' || normalizedAppRole == 'superadmin';
  }

  static List<TeamChannelType> getVisibleTeamChannelTypes(
    List<String> roles, {
    bool includeAllChannels = false,
    String? plongeurCode,
    String? targetFormationLevel,
    bool formationActive = false,
  }) {
    final normalized = normalizeRoles(roles);
    final rawRoles = roles.toSet();
    final hasBS = rawRoles.intersection(const {
      'BS',
      'bs',
      'Banque Signature',
      'banque signature',
    }).isNotEmpty;

    // Bureau is strikt confidentieel: enkel leden met 'Banque Signature' (BS).
    // Zelfs de admin-override (includeAllChannels=true) mag dit kanaal NIET
    // openen — Bureau is voor bank-signataires, niet voor algemene admins.
    // Formation-kanalen zijn beheerbaar door admins: zij moeten in alle
    // formationgroepen kunnen posten.
    if (includeAllChannels) {
      final all = List<TeamChannelType>.from(TeamChannelType.values);
      if (!hasBS) {
        all.remove(TeamChannelType.bureau);
      }
      return all;
    }

    final availableTypes = <TeamChannelType>[TeamChannelType.general];

    if (rawRoles.intersection(const {
      'ca',
      'CA',
      'comite',
      'Comite',
      'comité',
      'Comité',
    }).isNotEmpty) {
      availableTypes.add(TeamChannelType.ca);
    }
    if (rawRoles.intersection(const {
      'encadrant',
      'Encadrant',
      'encadrants',
      'Encadrants',
      'E',
      'encadrant carrière',
      'Encadrant Carrière',
    }).isNotEmpty) {
      availableTypes.add(TeamChannelType.encadrants);
    }
    if (rawRoles.intersection(const {'accueil', 'Accueil', 'A'}).isNotEmpty) {
      availableTypes.add(TeamChannelType.accueil);
    }
    if (normalized.contains('gonflage')) {
      availableTypes.add(TeamChannelType.gonflage);
    }
    if (hasBS) {
      availableTypes.add(TeamChannelType.bureau);
    }

    if (formationActive) {
      final formationType = getFormationChannelType(
        plongeurCode: plongeurCode,
        targetFormationLevel: targetFormationLevel,
      );
      if (formationType != null) {
        availableTypes.add(formationType);
      }
    }

    return availableTypes;
  }

  static TeamChannelType? getFormationChannelType({
    String? plongeurCode,
    String? targetFormationLevel,
  }) {
    final explicitTarget = _normalizeTargetFormationLevel(targetFormationLevel);
    final target = explicitTarget ?? _targetFromPlongeurCode(plongeurCode);

    switch (target) {
      case '1*':
        return TeamChannelType.formation1;
      case '2*':
        return TeamChannelType.formation2;
      case '3*':
        return TeamChannelType.formation3;
      case '4*':
        return TeamChannelType.formation4;
      case 'AM':
        return TeamChannelType.formationAM;
      default:
        return null;
    }
  }

  static String? _normalizeTargetFormationLevel(String? value) {
    // Keep this deliberately exact: it mirrors targetFormationLevel() in
    // Firestore rules. A UI-only fuzzy match would advertise a channel that
    // the member cannot actually read.
    return switch (value) {
      '1*' || '1' || 'P1' => '1*',
      '2*' || '2' || 'P2' => '2*',
      '3*' || '3' || 'P3' => '3*',
      '4*' || '4' || 'P4' => '4*',
      'AM' => 'AM',
      _ => null,
    };
  }

  static String? _targetFromPlongeurCode(String? value) {
    return switch (value) {
      'NB' => '1*',
      'P1' || '1' || '1*' => '2*',
      'P2' || '2' || '2*' => '3*',
      'P3' || '3' || '3*' => '4*',
      'P4' || '4' || '4*' => 'AM',
      _ => null,
    };
  }

  static List<String> getVisibleTeamChannelIds(
    List<String> roles, {
    bool includeAllChannels = false,
    String? plongeurCode,
    String? targetFormationLevel,
    bool formationActive = false,
  }) {
    return getVisibleTeamChannelTypes(
      roles,
      includeAllChannels: includeAllChannels,
      plongeurCode: plongeurCode,
      targetFormationLevel: targetFormationLevel,
      formationActive: formationActive,
    ).map((type) => type.id).toList();
  }
}
