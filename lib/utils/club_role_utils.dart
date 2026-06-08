import '../models/team_channel.dart';
import 'permission_helper.dart';

class ClubRoleUtils {
  static Set<String> normalizeRoles(List<String> roles) {
    final normalized = <String>{};

    for (final rawRole in roles) {
      final role = rawRole.trim().toLowerCase();
      if (role.isEmpty) continue;

      if (role == 'm' || role == 'membre' || role == 'member') {
        normalized.add('member');
      } else if (role == 'ca') {
        normalized.add('ca');
      } else if (role == 'e' || role == 'encadrant' || role == 'encadrants') {
        normalized.add('encadrant');
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

  static bool hasAdminAccess(List<String> roles, {String? appRole}) {
    final normalizedAppRole = appRole?.trim().toLowerCase();
    return normalizedAppRole == 'admin' ||
        normalizedAppRole == 'superadmin' ||
        PermissionHelper.isAdmin(roles);
  }

  static List<TeamChannelType> getVisibleTeamChannelTypes(
    List<String> roles, {
    bool includeAllChannels = false,
    String? plongeurCode,
    String? targetFormationLevel,
    bool formationActive = false,
  }) {
    final normalized = normalizeRoles(roles);
    final hasBS = normalized.contains('bs');

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

    if (normalized.contains('ca')) {
      availableTypes.add(TeamChannelType.ca);
    }
    if (normalized.contains('encadrant')) {
      availableTypes.add(TeamChannelType.encadrants);
    }
    if (normalized.contains('accueil')) {
      availableTypes.add(TeamChannelType.accueil);
    }
    if (normalized.contains('gonflage')) {
      availableTypes.add(TeamChannelType.gonflage);
    }
    if (hasBS) {
      availableTypes.add(TeamChannelType.bureau);
    }

    final hasExplicitFormationTarget =
        _normalizeTargetFormationLevel(targetFormationLevel) != null;
    if (formationActive || hasExplicitFormationTarget) {
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
    final raw = (value ?? '')
        .trim()
        .toUpperCase()
        .replaceAll('★', '*')
        .replaceAll('_', ' ');
    if (raw.isEmpty) return null;
    if (raw.contains('AM') || raw == 'AIDE MONITEUR') return 'AM';
    if (raw.contains('1') || raw.contains('P1')) return '1*';
    if (raw.contains('2') || raw.contains('P2')) return '2*';
    if (raw.contains('3') || raw.contains('P3')) return '3*';
    if (raw.contains('4') || raw.contains('P4')) return '4*';
    return null;
  }

  static String? _targetFromPlongeurCode(String? value) {
    final code = (value ?? '')
        .trim()
        .toUpperCase()
        .replaceAll('★', '*')
        .replaceAll(RegExp(r'[\u0300-\u036f]'), '');

    if (code.isEmpty) return null;

    if (code == 'NB' ||
        code.contains('NON BREVETE') ||
        code.contains('SANS BREVET') ||
        code.contains('DEBUTANT') ||
        code.contains('BAPTEME') ||
        code.contains('INITIATION')) {
      return '1*';
    }
    if (code == 'P1' ||
        code == '1' ||
        code == '1*' ||
        code.contains('PLONGEUR 1')) {
      return '2*';
    }
    if (code == 'P2' ||
        code == '2' ||
        code == '2*' ||
        code.contains('PLONGEUR 2')) {
      return '3*';
    }
    if (code == 'P3' ||
        code == '3' ||
        code == '3*' ||
        code.contains('PLONGEUR 3')) {
      return '4*';
    }
    if (code == 'P4' ||
        code == '4' ||
        code == '4*' ||
        code.contains('PLONGEUR 4')) {
      return 'AM';
    }
    return null;
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
