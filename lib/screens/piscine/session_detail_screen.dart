import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/piscine_session.dart';
import '../../models/piscine_attendee.dart';
import '../../models/session_message.dart';
import '../../models/member_profile.dart';
import '../../services/piscine_session_service.dart';
import '../../services/session_message_service.dart';
import '../../services/profile_service.dart';
import '../../providers/auth_provider.dart';
import '../../utils/permission_helper.dart';
import '../../widgets/piscine_animated_background.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../widgets/scanner_modal_sheet.dart';
import 'theme_edit_dialog.dart';
import 'session_chat_screen.dart';
import 'add_attendee_dialog.dart';

class SessionDetailScreen extends StatefulWidget {
  final PiscineSession session;

  const SessionDetailScreen({
    super.key,
    required this.session,
  });

  @override
  State<SessionDetailScreen> createState() => _SessionDetailScreenState();
}

class _SessionDetailScreenState extends State<SessionDetailScreen> {
  final PiscineSessionService _sessionService = PiscineSessionService();
  final SessionMessageService _messageService = SessionMessageService();
  final ProfileService _profileService = ProfileService();
  late Stream<PiscineSession?> _sessionStream;
  List<SessionChatGroup> _chatGroups = [];
  MemberProfile? _userProfile;

  /// Check if current user can scan attendance
  bool get _canScan {
    if (_userProfile == null) return false;
    return PermissionHelper.canScan(_userProfile!.clubStatuten);
  }

  @override
  void initState() {
    super.initState();
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final clubId = FirebaseConfig.defaultClubId;
    final userId = authProvider.currentUser?.uid;

    _sessionStream = _sessionService.getSessionStream(clubId, widget.session.id);

    // Load user profile for permission check
    _loadUserProfile();

    // Get available chat groups for this user
    if (userId != null) {
      _chatGroups = _messageService.getAvailableGroups(
        session: widget.session,
        userId: userId,
      );
    }
  }

  Future<void> _loadUserProfile() async {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final userId = authProvider.currentUser?.uid ?? '';
    final clubId = FirebaseConfig.defaultClubId;

    final profile = await _profileService.getProfile(clubId, userId);
    if (mounted) {
      setState(() {
        _userProfile = profile;
      });
    }
  }

  /// Open scanner modal for this session
  void _openScanner() async {
    final clubId = FirebaseConfig.defaultClubId;

    await ScannerModalSheet.show(
      context: context,
      clubId: clubId,
      operationId: widget.session.id,
      operationTitle: 'Piscine ${widget.session.formattedDate}',
      isPiscine: true,
    );

    // Refresh after closing scanner
    if (mounted) {
      setState(() {});
    }
  }

  /// Show dialog to add attendee manually
  Future<void> _showAddAttendeeDialog() async {
    final clubId = FirebaseConfig.defaultClubId;
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final currentUser = authProvider.currentUser;

    if (currentUser == null) return;

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AddAttendeeDialog(clubId: clubId),
    );

    if (result != null && mounted) {
      try {
        await _sessionService.addAttendee(
          clubId: clubId,
          sessionId: widget.session.id,
          memberId: result['memberId'] as String,
          memberName: result['memberName'] as String,
          scannedBy: currentUser.uid,
          isGuest: result['isGuest'] as bool,
        );

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('${result['memberName']} ajouté'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Erreur: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    final userId = authProvider.currentUser?.uid ?? '';
    final clubId = FirebaseConfig.defaultClubId;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(
          widget.session.formattedDate,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          if (_canScan) ...[
            IconButton(
              onPressed: _showAddAttendeeDialog,
              icon: const Icon(Icons.person_add, color: Colors.white),
              tooltip: 'Ajouter manuellement',
            ),
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: IconButton(
                onPressed: _openScanner,
                iconSize: 40,
                icon: const Icon(Icons.qr_code_scanner, color: Colors.white),
                tooltip: 'Scanner présence',
              ),
            ),
          ],
        ],
      ),
      body: PiscineAnimatedBackground(
        showJellyfish: true,
        showSeaweed: true,
        jellyfishCount: 1,
        child: SafeArea(
          child: StreamBuilder<PiscineSession?>(
            stream: _sessionStream,
            initialData: widget.session,
            builder: (context, snapshot) {
              final session = snapshot.data ?? widget.session;

              return SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Session info card
                    _SessionInfoCard(session: session),

                    // Chat groups section
                    if (_chatGroups.isNotEmpty) ...[
                      const SizedBox(height: 24),
                      _buildChatGroupsSection(session, clubId),
                    ],

                    const SizedBox(height: 24),

                    // Accueil section
                    _SectionCard(
                      title: 'Équipe Accueil',
                      icon: Icons.badge,
                      iconColor: Colors.blue,
                      children: [
                        if (session.accueil.isEmpty)
                          _EmptyMessage(message: 'Aucun membre assigné')
                        else
                          ...session.accueil.map((member) => _MemberTile(
                                name: member.fullName,
                                isCurrentUser: member.membreId == userId,
                              )),
                      ],
                    ),

                    const SizedBox(height: 16),

                    // Baptêmes section
                    _SectionCard(
                      title: 'Baptêmes',
                      icon: Icons.pool,
                      iconColor: Colors.teal,
                      children: [
                        if (session.baptemes.isEmpty)
                          _EmptyMessage(message: 'Aucun encadrant assigné')
                        else
                          ...session.baptemes.map((member) => _MemberTile(
                                name: member.fullName,
                                isCurrentUser: member.membreId == userId,
                              )),
                      ],
                    ),

                    const SizedBox(height: 24),

                    // Niveaux section
                    _buildNiveauxSection(session, userId, clubId),

                    // Attendees section (only visible for users with scan permission)
                    if (_canScan) ...[
                      const SizedBox(height: 24),
                      _buildAttendeesSection(clubId),
                    ],
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildAttendeesSection(String clubId) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 12),
          child: Text(
            'Présences',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.white.withOpacity(0.9),
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.95),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.05),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: StreamBuilder<List<PiscineAttendee>>(
            stream: _sessionService.getAttendeesStream(clubId, widget.session.id),
            builder: (context, snapshot) {
              final attendees = snapshot.data ?? [];

              if (snapshot.connectionState == ConnectionState.waiting && attendees.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(
                    child: CircularProgressIndicator(color: AppColors.middenblauw),
                  ),
                );
              }

              return Column(
                children: [
                  // Header with count
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppColors.success.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Icon(
                            Icons.people,
                            color: AppColors.success,
                            size: 20,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          'Présents',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.success,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            '${attendees.length}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1),
                  // List of attendees
                  if (attendees.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'Aucun participant enregistré',
                        style: TextStyle(
                          color: Colors.grey.shade500,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    )
                  else
                    ListView.separated(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: attendees.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final attendee = attendees[index];
                        return Dismissible(
                          key: Key(attendee.id),
                          direction: DismissDirection.endToStart,
                          background: Container(
                            color: Colors.red,
                            alignment: Alignment.centerRight,
                            padding: const EdgeInsets.only(right: 16),
                            child: const Icon(Icons.delete, color: Colors.white),
                          ),
                          confirmDismiss: (direction) async {
                            return await showDialog<bool>(
                              context: context,
                              builder: (context) => AlertDialog(
                                title: const Text('Supprimer?'),
                                content: Text('Supprimer ${attendee.memberName} de la liste?'),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.of(context).pop(false),
                                    child: const Text('Annuler'),
                                  ),
                                  TextButton(
                                    onPressed: () => Navigator.of(context).pop(true),
                                    style: TextButton.styleFrom(foregroundColor: Colors.red),
                                    child: const Text('Supprimer'),
                                  ),
                                ],
                              ),
                            ) ?? false;
                          },
                          onDismissed: (direction) async {
                            await _sessionService.removeAttendee(
                              clubId: clubId,
                              sessionId: widget.session.id,
                              attendeeId: attendee.id,
                            );
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text('${attendee.memberName} supprimé'),
                                  backgroundColor: Colors.orange,
                                ),
                              );
                            }
                          },
                          child: ListTile(
                            leading: CircleAvatar(
                              backgroundColor: attendee.isGuest
                                  ? Colors.orange
                                  : AppColors.middenblauw,
                              child: Text(
                                attendee.memberName.isNotEmpty
                                    ? attendee.memberName[0].toUpperCase()
                                    : '?',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            title: Text(attendee.memberName),
                            subtitle: Text(
                              _formatTime(attendee.scannedAt),
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey.shade500,
                              ),
                            ),
                            trailing: attendee.isGuest
                                ? Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      color: Colors.orange.withOpacity(0.1),
                                      borderRadius: BorderRadius.circular(8),
                                      border: Border.all(color: Colors.orange.withOpacity(0.3)),
                                    ),
                                    child: const Text(
                                      'Invité',
                                      style: TextStyle(
                                        fontSize: 10,
                                        color: Colors.orange,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  )
                                : null,
                          ),
                        );
                      },
                    ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }

  String _formatTime(DateTime dateTime) {
    final hour = dateTime.hour.toString().padLeft(2, '0');
    final minute = dateTime.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  Widget _buildChatGroupsSection(PiscineSession session, String clubId) {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final userId = authProvider.currentUser?.uid ?? '';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 12),
          child: Text(
            'Discussions',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.white.withOpacity(0.9),
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.95),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.05),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: StreamBuilder<Map<String, int>>(
            stream: _messageService.getUnreadCountsStream(
              clubId: clubId,
              sessionId: session.id,
              userId: userId,
              groups: _chatGroups,
            ),
            builder: (context, snapshot) {
              final unreadCounts = snapshot.data ?? {};

              return Column(
                children: _chatGroups.asMap().entries.map((entry) {
                  final index = entry.key;
                  final group = entry.value;
                  final unreadCount = unreadCounts[group.id] ?? 0;

                  return Column(
                    children: [
                      if (index > 0) const Divider(height: 1),
                      ListTile(
                        leading: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppColors.lichtblauw.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Icon(
                            Icons.chat_bubble_outline,
                            color: AppColors.middenblauw,
                            size: 20,
                          ),
                        ),
                        title: Text(
                          group.displayName,
                          style: const TextStyle(
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (unreadCount > 0)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.red,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Text(
                                  unreadCount.toString(),
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            const SizedBox(width: 8),
                            Icon(
                              Icons.chevron_right,
                              color: Colors.grey.shade400,
                            ),
                          ],
                        ),
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => SessionChatScreen(
                                session: session,
                                chatGroup: group,
                              ),
                            ),
                          );
                        },
                      ),
                    ],
                  );
                }).toList(),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildNiveauxSection(
      PiscineSession session, String userId, String clubId) {
    final userEncadrantLevel = session.getEncadrantLevel(userId);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 12),
          child: Text(
            'Niveaux',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.white.withOpacity(0.9),
            ),
          ),
        ),
        ...PiscineLevel.all.map((level) {
          final levelAssignment = session.niveaux[level];
          if (levelAssignment == null) return const SizedBox.shrink();

          final isUserLevel = userEncadrantLevel == level;
          final canEditTheme = isUserLevel;

          return _LevelCard(
            level: level,
            assignment: levelAssignment,
            isUserLevel: isUserLevel,
            canEditTheme: canEditTheme,
            currentUserId: userId,
            onEditTheme: canEditTheme
                ? () => _showThemeEditDialog(
                      clubId: clubId,
                      sessionId: session.id,
                      level: level,
                      currentTheme: levelAssignment.theme ?? '',
                    )
                : null,
          );
        }),
      ],
    );
  }

  Future<void> _showThemeEditDialog({
    required String clubId,
    required String sessionId,
    required String level,
    required String currentTheme,
  }) async {
    final result = await showDialog<String>(
      context: context,
      builder: (context) => ThemeEditDialog(
        level: level,
        currentTheme: currentTheme,
      ),
    );

    if (result != null && result != currentTheme && mounted) {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      final userName = authProvider.displayName ?? 'Unknown';

      try {
        await _sessionService.updateTheme(
          clubId: clubId,
          sessionId: sessionId,
          level: level,
          theme: result,
          updatedBy: userName,
        );

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Thème mis à jour'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Erreur: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }
}

class _SessionInfoCard extends StatelessWidget {
  final PiscineSession session;

  const _SessionInfoCard({required this.session});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.donkerblauw.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.pool,
                  color: AppColors.donkerblauw,
                  size: 28,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Séance Piscine',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: AppColors.donkerblauw,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      session.formattedDate,
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const Divider(height: 32),
          Row(
            children: [
              Expanded(
                child: _InfoItem(
                  icon: Icons.access_time,
                  label: 'Horaire',
                  value: session.formattedHoraire,
                ),
              ),
              Expanded(
                child: _InfoItem(
                  icon: Icons.location_on,
                  label: 'Lieu',
                  value: session.lieu,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _InfoItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoItem({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 20, color: Colors.grey.shade500),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                color: Colors.grey.shade500,
              ),
            ),
            Text(
              value,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color iconColor;
  final List<Widget> children;

  const _SectionCard({
    required this.title,
    required this.icon,
    required this.iconColor,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.95),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: iconColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, color: iconColor, size: 20),
                ),
                const SizedBox(width: 12),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(children: children),
          ),
        ],
      ),
    );
  }
}

class _MemberTile extends StatelessWidget {
  final String name;
  final bool isCurrentUser;

  const _MemberTile({
    required this.name,
    this.isCurrentUser = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: isCurrentUser
            ? AppColors.lichtblauw.withOpacity(0.2)
            : Colors.grey.shade50,
        borderRadius: BorderRadius.circular(8),
        border: isCurrentUser
            ? Border.all(color: AppColors.middenblauw.withOpacity(0.3))
            : null,
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: isCurrentUser
                ? AppColors.middenblauw
                : Colors.grey.shade300,
            child: Text(
              name.isNotEmpty ? name[0].toUpperCase() : '?',
              style: TextStyle(
                color: isCurrentUser ? Colors.white : Colors.grey.shade600,
                fontWeight: FontWeight.bold,
                fontSize: 14,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              name,
              style: TextStyle(
                fontSize: 14,
                fontWeight: isCurrentUser ? FontWeight.w600 : FontWeight.normal,
              ),
            ),
          ),
          if (isCurrentUser)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.middenblauw,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Text(
                'Vous',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _EmptyMessage extends StatelessWidget {
  final String message;

  const _EmptyMessage({required this.message});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Text(
        message,
        style: TextStyle(
          fontSize: 14,
          color: Colors.grey.shade500,
          fontStyle: FontStyle.italic,
        ),
      ),
    );
  }
}

class _LevelCard extends StatelessWidget {
  final String level;
  final LevelAssignment assignment;
  final bool isUserLevel;
  final bool canEditTheme;
  final String currentUserId;
  final VoidCallback? onEditTheme;

  const _LevelCard({
    required this.level,
    required this.assignment,
    required this.isUserLevel,
    required this.canEditTheme,
    required this.currentUserId,
    this.onEditTheme,
  });

  @override
  Widget build(BuildContext context) {
    final hasEncadrants = assignment.encadrants.isNotEmpty;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.95),
        borderRadius: BorderRadius.circular(16),
        border: isUserLevel
            ? Border.all(color: AppColors.middenblauw, width: 2)
            : null,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Level header
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isUserLevel
                  ? AppColors.lichtblauw.withOpacity(0.2)
                  : Colors.grey.shade50,
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(14)),
            ),
            child: Row(
              children: [
                Text(
                  PiscineLevel.stars(level),
                  style: const TextStyle(fontSize: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        PiscineLevel.displayName(level),
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        '${assignment.encadrants.length} encadrant(s)',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
                if (isUserLevel)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.middenblauw,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'Votre niveau',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // Theme section
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Thème du jour',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade500,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (canEditTheme && onEditTheme != null)
                      TextButton.icon(
                        onPressed: onEditTheme,
                        icon: const Icon(Icons.edit, size: 16),
                        label: const Text('Modifier'),
                        style: TextButton.styleFrom(
                          foregroundColor: AppColors.middenblauw,
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: assignment.theme != null && assignment.theme!.isNotEmpty
                        ? AppColors.lichtblauw.withOpacity(0.1)
                        : Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: assignment.theme != null && assignment.theme!.isNotEmpty
                          ? AppColors.lichtblauw.withOpacity(0.3)
                          : Colors.grey.shade200,
                    ),
                  ),
                  child: Text(
                    assignment.theme?.isNotEmpty == true
                        ? assignment.theme!
                        : 'Pas encore défini',
                    style: TextStyle(
                      fontSize: 14,
                      color: assignment.theme?.isNotEmpty == true
                          ? Colors.black87
                          : Colors.grey.shade500,
                      fontStyle: assignment.theme?.isNotEmpty == true
                          ? FontStyle.normal
                          : FontStyle.italic,
                    ),
                  ),
                ),
                if (assignment.themeUpdatedBy != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      'Mis à jour par ${assignment.themeUpdatedBy}',
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.grey.shade500,
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // Encadrants
          if (hasEncadrants) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Encadrants',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade500,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...assignment.encadrants.map((member) => _MemberTile(
                        name: member.fullName,
                        isCurrentUser: member.membreId == currentUserId,
                      )),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
