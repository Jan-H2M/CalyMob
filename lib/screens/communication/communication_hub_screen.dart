import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/formation_task.dart';
import '../../models/team_channel.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../providers/unread_count_provider.dart';
import '../../services/formation_task_service.dart';
import '../../services/team_channel_service.dart';
import '../../services/unread_count_service.dart';
import '../../utils/club_role_utils.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../announcements/announcements_screen.dart';
import '../teams/team_chat_screen.dart';
import '../training/pool_checkin_screen.dart';
import '../training/monitor_validation_screen.dart';
import '../training/logbook_entry_screen.dart';

class CommunicationHubScreen extends StatelessWidget {
  const CommunicationHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final memberProvider = context.watch<MemberProvider>();
    final unreadProvider = context.watch<UnreadCountProvider>();
    final roles = memberProvider.clubStatuten;
    final includeAllChannels = ClubRoleUtils.hasAdminAccess(
      roles,
      appRole: memberProvider.appRole,
    );

    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.arrow_back,
                          color: Colors.white, size: 28),
                      onPressed: () => Navigator.pop(context),
                    ),
                    const Expanded(
                      child: Text(
                        'Communication',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                  children: [
                    // Carnet de Formation — persistent inbox. Always rendered;
                    // empty state shows nothing visible to non-formation members.
                    const _ActionsCalypsoSection(),
                    const _PlannedExercisesSection(),
                    const SizedBox(height: 18),
                    _AnnouncementsCard(
                      unreadCount: unreadProvider.announcements,
                    ),
                    const SizedBox(height: 18),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Canaux d\'équipe',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.9),
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'Affichés selon vos accès',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.68),
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    _TeamChannelsSection(
                      roles: roles,
                      includeAllChannels: includeAllChannels,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Carnet de Formation — Actions Calypso inbox section.
///
/// Sits at the top of the Communication screen, BEFORE announcements and
/// team channels. Surfaces all open formation_tasks where the user is
/// `current_assignee_id`. Tapping a card opens the relevant flow
/// (pool_checkin_screen for now; more in subsequent phases).
///
/// Tech doc reference : §11.1.
class _ActionsCalypsoSection extends StatefulWidget {
  const _ActionsCalypsoSection();

  @override
  State<_ActionsCalypsoSection> createState() => _ActionsCalypsoSectionState();
}

class _ActionsCalypsoSectionState extends State<_ActionsCalypsoSection> {
  final FormationTaskService _service = FormationTaskService();

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final userId = authProvider.currentUser?.uid;
    if (userId == null) return const SizedBox.shrink();

    const clubId = FirebaseConfig.defaultClubId;

    return StreamBuilder<List<FormationTask>>(
      stream: _service.streamUserInbox(clubId, userId),
      builder: (context, snapshot) {
        final tasks = snapshot.data ?? const <FormationTask>[];

        // Hide the section entirely when the user has no tasks at all.
        // Keeps the screen clean for members who aren't en formation.
        if (tasks.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 10, left: 2),
              child: Row(
                children: [
                  Icon(Icons.flag, color: Colors.white.withValues(alpha: 0.9), size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'Actions Calypso',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.95),
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(width: 8),
                  _CountBadge(tasks.length),
                ],
              ),
            ),
            ...tasks.map((task) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _ActionCalypsoCard(task: task),
                )),
          ],
        );
      },
    );
  }
}

class _PlannedExercisesSection extends StatelessWidget {
  const _PlannedExercisesSection();

  @override
  Widget build(BuildContext context) {
    final userId = context.watch<AuthProvider>().currentUser?.uid;
    if (userId == null) return const SizedBox.shrink();

    const clubId = FirebaseConfig.defaultClubId;
    final stream = FirebaseFirestore.instance
        .collection('clubs')
        .doc(clubId)
        .collection('exercise_claims')
        .where('member_id', isEqualTo: userId)
        .where('status', isEqualTo: 'draft')
        .snapshots();

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: stream,
      builder: (context, snapshot) {
        if (snapshot.hasError) return const SizedBox.shrink();
        final docs = snapshot.data?.docs ?? const [];
        if (docs.isEmpty) return const SizedBox.shrink();

        final byOperation = <String, List<Map<String, dynamic>>>{};
        for (final doc in docs) {
          final data = {'id': doc.id, ...doc.data()};
          final key = (data['operation_id'] ??
                  data['palanquee_id'] ??
                  'planned')
              .toString();
          byOperation.putIfAbsent(key, () => []).add(data);
        }

        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.96),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withValues(alpha: 0.72)),
              boxShadow: [
                BoxShadow(
                  color: AppColors.donkerblauw.withValues(alpha: 0.10),
                  blurRadius: 14,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.assignment_outlined,
                        color: AppColors.middenblauw, size: 20),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Exercices prévus pour ta sortie',
                        style: TextStyle(
                          color: AppColors.donkerblauw,
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 5),
                Text(
                  'Informatif: après la plongée, tu confirmeras dans ton carnet ce qui a vraiment été fait.',
                  style: TextStyle(
                    color: AppColors.donkerblauw.withValues(alpha: 0.68),
                    fontSize: 12,
                    height: 1.25,
                  ),
                ),
                const SizedBox(height: 10),
                ...byOperation.entries.map((entry) {
                  final claims = entry.value;
                  return Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (entry.key != 'planned')
                          Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Text(
                              'Sortie ${entry.key.length > 8 ? entry.key.substring(0, 8) : entry.key}',
                              style: TextStyle(
                                color: AppColors.donkerblauw
                                    .withValues(alpha: 0.58),
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        Wrap(
                          spacing: 7,
                          runSpacing: 7,
                          children: claims.map((claim) {
                            final code = (claim['exercise_code'] ??
                                    claim['exercise_id'] ??
                                    '?')
                                .toString();
                            final label =
                                claim['exercise_label']?.toString() ?? '';
                            return Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 9,
                                vertical: 6,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xFFE6F6FD),
                                borderRadius: BorderRadius.circular(9),
                                border: Border.all(
                                  color: AppColors.middenblauw
                                      .withValues(alpha: 0.18),
                                ),
                              ),
                              child: Text(
                                label.isEmpty ? code : '$code · $label',
                                style: const TextStyle(
                                  color: AppColors.donkerblauw,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                      ],
                    ),
                  );
                }),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _ActionCalypsoCard extends StatelessWidget {
  final FormationTask task;

  const _ActionCalypsoCard({required this.task});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => _open(context, task),
      borderRadius: BorderRadius.circular(16),
      child: Ink(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Colors.white.withValues(alpha: 0.96),
              Colors.white.withValues(alpha: 0.9),
            ],
          ),
          border: Border.all(color: Colors.white.withValues(alpha: 0.72)),
          boxShadow: [
            BoxShadow(
              color: AppColors.donkerblauw.withValues(alpha: 0.10),
              blurRadius: 14,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Row(
          children: [
            _StatusGlyph(task: task),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    task.title,
                    style: const TextStyle(
                      color: AppColors.donkerblauw,
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (_subtitleFor(task).isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Text(
                        _subtitleFor(task),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: AppColors.donkerblauw.withValues(alpha: 0.68),
                          fontSize: 12,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: Colors.grey.shade500),
          ],
        ),
      ),
    );
  }

  static String _subtitleFor(FormationTask task) {
    final parts = <String>[];
    if (task.context.targetGroupLevel != null) parts.add(task.context.targetGroupLevel!);
    if (task.context.operationTitle != null) parts.add(task.context.operationTitle!);
    if (task.status == FormationTaskStatus.blocked) parts.add('bloquée');
    if (task.status == FormationTaskStatus.snoozed) parts.add('reportée');
    return parts.join(' · ');
  }

  static void _open(BuildContext context, FormationTask task) {
    switch (task.type) {
      case FormationTaskType.poolCheckin:
        Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => PoolCheckinScreen(task: task),
        ));
        break;
      case FormationTaskType.monitorValidation:
        Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => MonitorValidationScreen(task: task),
        ));
        break;
      case FormationTaskType.logbookCompletion:
        Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => LogbookEntryScreen.auto(task: task),
        ));
        break;
      // Types that don't have a dedicated mobile screen yet — open the
      // already-shipped web equivalent on caly.club. The student is already
      // signed in via the same Firebase Auth account, so the deep link lands
      // them directly on the form. Better UX than "bientôt disponible".
      case FormationTaskType.monitorObservation:
        _openOnWeb(context, task, 'observation');
        break;
      case FormationTaskType.externalProofReview:
        _openOnWeb(context, task, 'external-proof-review');
        break;
      case FormationTaskType.exerciseClaim:
        _openOnWeb(context, task, 'claim');
        break;
      case FormationTaskType.buddyConfirmation:
        _openOnWeb(context, task, 'buddy-confirm');
        break;
      case FormationTaskType.eventPreparation:
        _openOnWeb(context, task, 'event-prep');
        break;
      case FormationTaskType.manualReminder:
        _openOnWeb(context, task, 'reminder');
        break;
      // Truly unknown future types stay friendly.
      // ignore: unreachable_switch_default
      default:
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Action « ${task.typeLabel} » — bientôt disponible'),
          ),
        );
    }
  }

  /// Open the web equivalent of a formation task on caly.club. Used for
  /// task types that don't have a dedicated mobile screen yet. The path
  /// segment matches the route slug declared in `CalyCompta/src/me/index.tsx`.
  static Future<void> _openOnWeb(
    BuildContext context,
    FormationTask task,
    String slug,
  ) async {
    final uri = Uri.parse('https://caly.club/me/inbox/${task.id}/$slug');
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Ouvre cette action sur caly.club — l\'écran mobile arrive bientôt.',
            ),
          ),
        );
      }
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Impossible d\'ouvrir caly.club ($e).')),
      );
    }
  }
}

class _StatusGlyph extends StatelessWidget {
  final FormationTask task;
  const _StatusGlyph({required this.task});

  @override
  Widget build(BuildContext context) {
    // Color by task type, intensity by status.
    final colors = _gradientFor(task);
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: colors,
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      alignment: Alignment.center,
      child: Text(
        task.glyph,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 17,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }

  static List<Color> _gradientFor(FormationTask task) {
    if (task.status == FormationTaskStatus.blocked) {
      return [const Color(0xFFFAB7B9), const Color(0xFFE5484D)];
    }
    if (task.status == FormationTaskStatus.snoozed) {
      return [const Color(0xFFCBD5E1), const Color(0xFF94A3B8)];
    }
    switch (task.type) {
      case FormationTaskType.poolCheckin:
      case FormationTaskType.logbookCompletion:
        return [const Color(0xFF6BCBE8), const Color(0xFF006DB6)];
      case FormationTaskType.exerciseClaim:
      case FormationTaskType.monitorValidation:
        return [const Color(0xFFB8E2BC), const Color(0xFF4CAF50)];
      case FormationTaskType.externalProofReview:
        return [const Color(0xFFFCD9A6), const Color(0xFFF6921E)];
      default:
        return [const Color(0xFF94A3B8), const Color(0xFF475569)];
    }
  }
}

class _CountBadge extends StatelessWidget {
  final int count;
  const _CountBadge(this.count);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.oranje,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        '$count',
        style: const TextStyle(
          color: Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _AnnouncementsCard extends StatelessWidget {
  final int unreadCount;

  const _AnnouncementsCard({required this.unreadCount});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const AnnouncementsScreen()),
        );
      },
      borderRadius: BorderRadius.circular(22),
      child: Ink(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(22),
          gradient: LinearGradient(
            colors: [
              Colors.white.withValues(alpha: 0.22),
              Colors.white.withValues(alpha: 0.12),
            ],
          ),
          border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
          boxShadow: [
            BoxShadow(
              color: AppColors.donkerblauw.withValues(alpha: 0.12),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Row(
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(
                    color: AppColors.middenblauw.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Icon(
                    Icons.campaign,
                    color: Colors.white,
                    size: 28,
                  ),
                ),
                if (unreadCount > 0)
                  const Positioned(
                    top: -2,
                    right: -2,
                    child: _UnreadDot(),
                  ),
              ],
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Annonces du club',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    unreadCount > 0
                        ? '$unreadCount nouveau${unreadCount > 1 ? 'x' : ''}'
                        : 'Toutes les annonces sont lues',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.88),
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: Colors.white),
          ],
        ),
      ),
    );
  }
}

class _TeamChannelsSection extends StatelessWidget {
  final List<String> roles;
  final bool includeAllChannels;
  final TeamChannelService _channelService = TeamChannelService();

  _TeamChannelsSection({
    required this.roles,
    required this.includeAllChannels,
  });

  @override
  Widget build(BuildContext context) {
    const clubId = FirebaseConfig.defaultClubId;

    return StreamBuilder<List<TeamChannel>>(
      stream: _channelService.getChannelsForUser(
        clubId,
        roles,
        includeAllChannels: includeAllChannels,
      ),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.all(24),
            child: Center(
              child: CircularProgressIndicator(color: Colors.white),
            ),
          );
        }

        final channels = snapshot.data ?? [];
        if (channels.isEmpty) {
          return Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Text(
              'Aucun canal disponible pour ce profil.',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.8),
                fontSize: 14,
              ),
            ),
          );
        }

        return Column(
          children: channels
              .map((channel) => Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: _TeamChannelTile(channel: channel),
                  ))
              .toList(),
        );
      },
    );
  }
}

class _TeamChannelTile extends StatelessWidget {
  final TeamChannel channel;
  static final UnreadCountService _unreadCountService = UnreadCountService();

  const _TeamChannelTile({required this.channel});

  @override
  Widget build(BuildContext context) {
    const clubId = FirebaseConfig.defaultClubId;
    final accentColor = _accentColorFor(channel.type);

    return FutureBuilder<int>(
      future: _unreadCountService.countUnreadForTeamChannel(clubId, channel.id),
      builder: (context, snapshot) {
        final unreadCount = snapshot.data ?? 0;

        return InkWell(
          onTap: () {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => TeamChatScreen(channel: channel),
              ),
            );
          },
          borderRadius: BorderRadius.circular(20),
          child: Ink(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(22),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Colors.white.withValues(alpha: 0.96),
                  Colors.white.withValues(alpha: 0.9),
                ],
              ),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.72),
              ),
              boxShadow: [
                BoxShadow(
                  color: AppColors.donkerblauw.withValues(alpha: 0.09),
                  blurRadius: 16,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Row(
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            accentColor.withValues(alpha: 0.24),
                            accentColor.withValues(alpha: 0.08),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: accentColor.withValues(alpha: 0.18),
                        ),
                      ),
                      alignment: Alignment.center,
                      child: Icon(
                        channel.type.iconData,
                        color: accentColor,
                        size: 24,
                      ),
                    ),
                    if (unreadCount > 0)
                      const Positioned(
                        top: -2,
                        right: -2,
                        child: _UnreadDot(),
                      ),
                  ],
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        channel.name,
                        style: const TextStyle(
                          color: AppColors.donkerblauw,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        channel.description ?? channel.type.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: AppColors.donkerblauw.withValues(alpha: 0.72),
                          fontSize: 12.5,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Icon(Icons.chevron_right, color: Colors.grey.shade500),
              ],
            ),
          ),
        );
      },
    );
  }

  static Color _accentColorFor(TeamChannelType type) {
    switch (type) {
      case TeamChannelType.general:
        return AppColors.middenblauw;
      case TeamChannelType.ca:
        return AppColors.oranje;
      case TeamChannelType.accueil:
        return const Color(0xFF0D9B8A);
      case TeamChannelType.encadrants:
        return const Color(0xFF4C6FFF);
      case TeamChannelType.gonflage:
        return const Color(0xFFE86B7A);
      case TeamChannelType.bureau:
        return const Color(0xFF7B5CE1);
    }
  }
}

class _UnreadDot extends StatelessWidget {
  const _UnreadDot();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        color: const Color(0xFFFF4D4F),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFFF4D4F).withValues(alpha: 0.32),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
    );
  }
}
