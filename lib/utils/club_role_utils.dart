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
  }) {
    if (includeAllChannels) {
      return List<TeamChannelType>.from(TeamChannelType.values);
    }

    final normalized = normalizeRoles(roles);
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
    if (normalized.contains('bs')) {
      availableTypes.add(TeamChannelType.bureau);
    }

    return availableTypes;
  }

  static List<String> getVisibleTeamChannelIds(
    List<String> roles, {
    bool includeAllChannels = false,
  }) {
    return getVisibleTeamChannelTypes(
      roles,
      includeAllChannels: includeAllChannels,
    ).map((type) => type.id).toList();
  }
}
