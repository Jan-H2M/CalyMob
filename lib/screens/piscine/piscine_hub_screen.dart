import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../providers/unread_count_provider.dart';
import '../../models/piscine_session.dart';
import '../../models/team_channel.dart';
import '../../services/piscine_session_service.dart';
import '../../services/team_channel_service.dart';
import '../../utils/club_role_utils.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

import 'availability_screen.dart';
import 'session_detail_screen.dart';
import '../teams/team_chat_screen.dart';

/// Écran hub Piscine avec deux onglets :
/// 1. Disponibilités (calendrier existant)
/// 2. Séances & Discussions (sessions + canaux d'équipe)
class PiscineHubScreen extends StatefulWidget {
  final List<String> userRoles;

  const PiscineHubScreen({super.key, required this.userRoles});

  @override
  State<PiscineHubScreen> createState() => _PiscineHubScreenState();
}

class _PiscineHubScreenState extends State<PiscineHubScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final unreadProvider = context.watch<UnreadCountProvider>();
    final unreadSeances =
        unreadProvider.sessionMessages + unreadProvider.teamMessages;

    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              // Header
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
                        'Piscine',
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

              // Tab bar
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: TabBar(
                  controller: _tabController,
                  indicator: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  indicatorSize: TabBarIndicatorSize.tab,
                  indicatorPadding: const EdgeInsets.all(4),
                  labelColor: AppColors.donkerblauw,
                  unselectedLabelColor: Colors.white,
                  labelStyle: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                  unselectedLabelStyle: const TextStyle(
                    fontWeight: FontWeight.w500,
                    fontSize: 14,
                  ),
                  dividerColor: Colors.transparent,
                  tabs: [
                    const Tab(
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.calendar_today, size: 16),
                          SizedBox(width: 6),
                          Text('Disponibilités'),
                        ],
                      ),
                    ),
                    Tab(
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.forum, size: 16),
                              SizedBox(width: 6),
                              Text('Séances'),
                            ],
                          ),
                          if (unreadSeances > 0)
                            Positioned(
                              top: -6,
                              right: -14,
                              child: _UnreadDot(count: unreadSeances),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              // Tab content
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    // Tab 1: Disponibilités
                    AvailabilityScreen(
                      userRoles: widget.userRoles,
                    ),
                    // Tab 2: Séances & Discussions
                    _SeancesTab(userRoles: widget.userRoles),
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

// ─── Séances & Discussions Tab ────────────────────────────────────────

class _SeancesTab extends StatelessWidget {
  final List<String> userRoles;
  final PiscineSessionService _sessionService = PiscineSessionService();
  final TeamChannelService _channelService = TeamChannelService();

  _SeancesTab({required this.userRoles});

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    final memberProvider = Provider.of<MemberProvider>(context);
    const clubId = FirebaseConfig.defaultClubId;
    final userId = authProvider.currentUser?.uid;

    if (userId == null) {
      return const Center(
          child: Text('Niet verbonden', style: TextStyle(color: Colors.white)));
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 8),

          // ── Séances à venir ──
          const _SectionLabel(text: 'Séances à venir'),
          StreamBuilder<List<PiscineSession>>(
            stream: _sessionService.getPublishedSessions(clubId),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(
                    child: CircularProgressIndicator(color: Colors.white),
                  ),
                );
              }

              final sessions = snapshot.data ?? [];
              if (sessions.isEmpty) {
                return _buildEmptyCard(
                  icon: Icons.event_busy,
                  text: 'Aucune séance planifiée',
                );
              }

              return Column(
                children: sessions
                    .map((session) => _SessionCard(
                          session: session,
                          userId: userId,
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) =>
                                  SessionDetailScreen(session: session),
                            ),
                          ),
                        ))
                    .toList(),
              );
            },
          ),

          const SizedBox(height: 24),

          // ── Canaux d'équipe ──
          const _SectionLabel(text: "Canaux d'équipe"),
          StreamBuilder<List<TeamChannel>>(
            stream: _channelService.getChannelsForUser(
              clubId,
              memberProvider.clubStatuten,
              includeAllChannels: ClubRoleUtils.hasAdminAccess(
                memberProvider.clubStatuten,
                appRole: memberProvider.appRole,
              ),
            ),
            builder: (context, snapshot) {
              final channels = snapshot.data ?? [];
              if (channels.isEmpty) {
                return _buildEmptyCard(
                  icon: Icons.groups_outlined,
                  text: 'Aucun canal disponible',
                );
              }

              return Column(
                children: channels
                    .map((channel) => _TeamChannelCard(
                          channel: channel,
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => TeamChatScreen(channel: channel),
                            ),
                          ),
                        ))
                    .toList(),
              );
            },
          ),

          const SizedBox(height: 80),
        ],
      ),
    );
  }

  Widget _buildEmptyCard({required IconData icon, required String text}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
      ),
      child: Column(
        children: [
          Icon(icon, size: 40, color: Colors.white.withValues(alpha: 0.4)),
          const SizedBox(height: 8),
          Text(
            text,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.6),
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Shared Widgets ───────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel({required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 4),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          letterSpacing: 1.2,
          color: Colors.white.withValues(alpha: 0.6),
        ),
      ),
    );
  }
}

class _UnreadDot extends StatelessWidget {
  final int count;
  const _UnreadDot({required this.count});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: Colors.red,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white, width: 1.5),
      ),
      constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
      child: Text(
        count > 99 ? '99+' : count.toString(),
        style: const TextStyle(
          color: Colors.white,
          fontSize: 10,
          fontWeight: FontWeight.bold,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }
}

class _SessionCard extends StatelessWidget {
  final PiscineSession session;
  final String userId;
  final VoidCallback onTap;

  const _SessionCard({
    required this.session,
    required this.userId,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      elevation: 2,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Date + status
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.calendar_today,
                        size: 16,
                        color: AppColors.donkerblauw,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        session.formattedDate,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: AppColors.donkerblauw,
                        ),
                      ),
                    ],
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.green.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      session.formattedHoraire,
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.green.shade700,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 8),

              // Location
              Row(
                children: [
                  Icon(Icons.location_on,
                      size: 14, color: Colors.grey.shade500),
                  const SizedBox(width: 4),
                  Text(
                    session.lieu,
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey.shade600,
                    ),
                  ),
                  const Spacer(),
                  Icon(Icons.chevron_right,
                      size: 20, color: Colors.grey.shade400),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TeamChannelCard extends StatelessWidget {
  final TeamChannel channel;
  final VoidCallback onTap;

  const _TeamChannelCard({
    required this.channel,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
      ),
      elevation: 2,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.middenblauw.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  channel.type.iconData,
                  color: channel.type == TeamChannelType.accueil
                      ? AppColors.middenblauw
                      : channel.type == TeamChannelType.gonflage
                          ? const Color(0xFF0E8A75)
                          : AppColors.donkerblauw,
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      channel.name,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: AppColors.donkerblauw,
                      ),
                    ),
                    if (channel.description != null)
                      Text(
                        channel.description!,
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade500,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: Colors.grey.shade400),
            ],
          ),
        ),
      ),
    );
  }
}
