import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/team_channel.dart';
import '../../providers/member_provider.dart';
import '../../providers/unread_count_provider.dart';
import '../../services/team_channel_service.dart';
import '../../services/unread_count_service.dart';
import '../../utils/club_role_utils.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../announcements/announcements_screen.dart';
import '../teams/team_chat_screen.dart';

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
                    _AnnouncementsCard(
                      unreadCount: unreadProvider.announcements,
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Canaux d\'équipe',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.86),
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
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
              Colors.white.withValues(alpha: 0.18),
              Colors.white.withValues(alpha: 0.1),
            ],
          ),
          border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
        ),
        child: Row(
          children: [
            Container(
              width: 58,
              height: 58,
              decoration: BoxDecoration(
                color: AppColors.middenblauw.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(18),
              ),
              child: const Icon(Icons.campaign, color: Colors.white, size: 28),
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
                      color: Colors.white.withValues(alpha: 0.75),
                      fontSize: 13,
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
                    padding: const EdgeInsets.only(bottom: 12),
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
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: AppColors.lichtblauw.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    channel.type.icon,
                    style: const TextStyle(fontSize: 22),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        channel.name,
                        style: const TextStyle(
                          color: Colors.black87,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        channel.description ?? channel.type.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: Colors.grey.shade600,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                if (unreadCount > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.middenblauw,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '$unreadCount',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  )
                else
                  Icon(Icons.chevron_right, color: Colors.grey.shade500),
              ],
            ),
          ),
        );
      },
    );
  }
}
