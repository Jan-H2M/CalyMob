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
import '../../utils/permission_helper.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../announcements/announcements_screen.dart';
import '../teams/team_chat_screen.dart';
import '../training/pool_checkin_screen.dart';
import '../training/monitor_validation_screen.dart';
import '../training/exercise_claim_retry_screen.dart';
import '../training/exercise_claim_screen.dart';
import '../training/logbook_entry_screen.dart';
import '../training/logbook_dive_confirmation_screen.dart';
import '../training/historical_claims_screen.dart';
import '../training/historical_qr_scan_screen.dart';
import '../training/historical_validation_screen.dart';
import '../training/monitor_observation_screen.dart';

enum _CommunicationFilter {
  all('Tout', Icons.forum_outlined),
  unread('Non lus', Icons.mark_chat_unread_outlined),
  announcements('Annonces', Icons.campaign_outlined),
  actions('Actions', Icons.flag_outlined),
  teams('Équipes', Icons.groups_outlined);

  final String label;
  final IconData icon;

  const _CommunicationFilter(this.label, this.icon);
}

class CommunicationHubScreen extends StatefulWidget {
  const CommunicationHubScreen({super.key});

  @override
  State<CommunicationHubScreen> createState() => _CommunicationHubScreenState();
}

class _CommunicationHubScreenState extends State<CommunicationHubScreen> {
  _CommunicationFilter _selectedFilter = _CommunicationFilter.all;
  String _searchQuery = '';
  List<String> _stableRoles = const [];
  bool _stableIncludeAllChannels = false;
  String? _stablePlongeurCode;
  String? _stableTargetFormationLevel;
  bool _stableFormationActive = false;
  bool _hasStableMemberContext = false;

  @override
  Widget build(BuildContext context) {
    final memberProvider = context.watch<MemberProvider>();
    final unreadProvider = context.watch<UnreadCountProvider>();
    final currentRoles = memberProvider.clubStatuten;
    final currentIncludeAllChannels = ClubRoleUtils.hasAdminAccess(
      currentRoles,
      appRole: memberProvider.appRole,
    );
    if (memberProvider.isLoaded) {
      _stableRoles = List<String>.from(currentRoles);
      _stableIncludeAllChannels = currentIncludeAllChannels;
      _stablePlongeurCode = memberProvider.plongeurCode;
      _stableTargetFormationLevel = memberProvider.targetFormationLevel;
      _stableFormationActive = memberProvider.formationActive;
      _hasStableMemberContext = true;
    }
    final roles = _hasStableMemberContext ? _stableRoles : currentRoles;
    final includeAllChannels = _hasStableMemberContext
        ? _stableIncludeAllChannels
        : currentIncludeAllChannels;
    final plongeurCode = _hasStableMemberContext
        ? _stablePlongeurCode
        : memberProvider.plongeurCode;
    final targetFormationLevel = _hasStableMemberContext
        ? _stableTargetFormationLevel
        : memberProvider.targetFormationLevel;
    final formationActive = _hasStableMemberContext
        ? _stableFormationActive
        : memberProvider.formationActive;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: OceanGradientBackground(
        creatures: CreatureSet.fishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _CommunicationHeader(
                searchQuery: _searchQuery,
                onSearchChanged: (value) {
                  setState(() {
                    _searchQuery = value;
                  });
                },
              ),
              _CommunicationFilterBar(
                selectedFilter: _selectedFilter,
                onSelected: (filter) {
                  setState(() {
                    _selectedFilter = filter;
                  });
                },
              ),
              Expanded(
                child: _CommunicationInboxList(
                  selectedFilter: _selectedFilter,
                  searchQuery: _searchQuery,
                  announcementUnreadCount: unreadProvider.announcements,
                  roles: roles,
                  includeAllChannels: includeAllChannels,
                  plongeurCode: plongeurCode,
                  targetFormationLevel: targetFormationLevel,
                  formationActive: formationActive,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CommunicationInboxList extends StatelessWidget {
  final _CommunicationFilter selectedFilter;
  final String searchQuery;
  final int announcementUnreadCount;
  final List<String> roles;
  final bool includeAllChannels;
  final String? plongeurCode;
  final String? targetFormationLevel;
  final bool formationActive;

  const _CommunicationInboxList({
    required this.selectedFilter,
    required this.searchQuery,
    required this.announcementUnreadCount,
    required this.roles,
    required this.includeAllChannels,
    this.plongeurCode,
    this.targetFormationLevel,
    this.formationActive = false,
  });

  bool _shows(_CommunicationFilter filter) {
    return selectedFilter == _CommunicationFilter.all ||
        selectedFilter == filter ||
        selectedFilter == _CommunicationFilter.unread;
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        if (_shows(_CommunicationFilter.announcements) &&
            (selectedFilter != _CommunicationFilter.unread ||
                announcementUnreadCount > 0) &&
            _matchesSearch(searchQuery, const [
              'Annonces du club',
              'Club',
              'Annonce',
              'Toutes les annonces sont lues',
              'nouveau à lire',
            ]))
          _AnnouncementChatRow(
            unreadCount: announcementUnreadCount,
            searchQuery: searchQuery,
          ),
        if (_shows(_CommunicationFilter.actions))
          _LogbookConfirmationsInboxSection(searchQuery: searchQuery),
        if (_shows(_CommunicationFilter.actions))
          _ActionsCalypsoInboxSection(
            filter: selectedFilter,
            searchQuery: searchQuery,
          ),
        if (_shows(_CommunicationFilter.teams))
          _TeamChannelsInboxSection(
            filter: selectedFilter,
            searchQuery: searchQuery,
            roles: roles,
            includeAllChannels: includeAllChannels,
            plongeurCode: plongeurCode,
            targetFormationLevel: targetFormationLevel,
            formationActive: formationActive,
          ),
        const SizedBox(height: 24),
      ],
    );
  }
}

class _CommunicationHeader extends StatefulWidget {
  final String searchQuery;
  final ValueChanged<String> onSearchChanged;

  const _CommunicationHeader({
    required this.searchQuery,
    required this.onSearchChanged,
  });

  @override
  State<_CommunicationHeader> createState() => _CommunicationHeaderState();
}

class _CommunicationHeaderState extends State<_CommunicationHeader> {
  late final TextEditingController _searchController;

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController(text: widget.searchQuery);
  }

  @override
  void didUpdateWidget(covariant _CommunicationHeader oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.searchQuery != _searchController.text) {
      _searchController.text = widget.searchQuery;
      _searchController.selection = TextSelection.collapsed(
        offset: _searchController.text.length,
      );
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 12),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.donkerblauw, AppColors.middenblauw],
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              IconButton(
                icon:
                    const Icon(Icons.arrow_back, color: Colors.white, size: 28),
                onPressed: () => Navigator.pop(context),
              ),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Communication',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 23,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Messages, annonces et actions',
                      style: TextStyle(
                        color: Color(0xD9FFFFFF),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            height: 38,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.94),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: Colors.white),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.search,
                  size: 17,
                  color: Color(0xFF4D6680),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    onChanged: widget.onSearchChanged,
                    textInputAction: TextInputAction.search,
                    style: const TextStyle(
                      color: AppColors.donkerblauw,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                    cursorColor: AppColors.middenblauw,
                    decoration: const InputDecoration(
                      isDense: true,
                      border: InputBorder.none,
                      hintText: 'Rechercher une conversation',
                      hintStyle: TextStyle(
                        color: Color(0xFF6B7F95),
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
                if (widget.searchQuery.trim().isNotEmpty)
                  GestureDetector(
                    onTap: () => widget.onSearchChanged(''),
                    child: Icon(
                      Icons.close,
                      size: 17,
                      color: AppColors.donkerblauw.withValues(alpha: 0.74),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CommunicationFilterBar extends StatelessWidget {
  final _CommunicationFilter selectedFilter;
  final ValueChanged<_CommunicationFilter> onSelected;

  const _CommunicationFilterBar({
    required this.selectedFilter,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 54,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(
          bottom: BorderSide(
            color: AppColors.donkerblauw.withValues(alpha: 0.10),
          ),
        ),
      ),
      child: Row(
        children: _CommunicationFilter.values.map((filter) {
          final selected = selectedFilter == filter;
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2.5),
              child: GestureDetector(
                onTap: () => onSelected(filter),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  decoration: BoxDecoration(
                    color: selected
                        ? AppColors.middenblauw
                        : const Color(0xFFEEF6FB),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                      color: selected
                          ? AppColors.middenblauw
                          : const Color(0xFFE0EDF5),
                    ),
                  ),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      filter.label,
                      maxLines: 1,
                      style: TextStyle(
                        color: selected ? Colors.white : AppColors.donkerblauw,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _CommunicationAvatar extends StatelessWidget {
  final IconData? icon;
  final String? text;
  final List<Color> colors;
  final bool online;

  const _CommunicationAvatar({
    this.icon,
    this.text,
    required this.colors,
    this.online = false,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: colors,
            ),
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: colors.last.withValues(alpha: 0.20),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          alignment: Alignment.center,
          child: icon != null
              ? Icon(icon, color: Colors.white, size: 22)
              : Text(
                  text ?? '',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                  ),
                ),
        ),
        if (online)
          Positioned(
            right: 0,
            bottom: 1,
            child: Container(
              width: 13,
              height: 13,
              decoration: BoxDecoration(
                color: const Color(0xFF25D366),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
              ),
            ),
          ),
      ],
    );
  }
}

class _CommunicationTag extends StatelessWidget {
  final String label;
  final Color color;

  const _CommunicationTag({
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.13),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label.toUpperCase(),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: color,
          fontSize: 9,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _CommunicationChatRow extends StatelessWidget {
  final Widget avatar;
  final String title;
  final String sender;
  final String preview;
  final String timeLabel;
  final String searchQuery;
  final int unreadCount;
  final String? tag;
  final Color tagColor;
  final VoidCallback onTap;

  const _CommunicationChatRow({
    required this.avatar,
    required this.title,
    required this.sender,
    required this.preview,
    required this.timeLabel,
    required this.onTap,
    this.searchQuery = '',
    this.unreadCount = 0,
    this.tag,
    this.tagColor = AppColors.middenblauw,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 68),
          padding: const EdgeInsets.fromLTRB(14, 8, 12, 8),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: AppColors.donkerblauw.withValues(alpha: 0.08),
              ),
            ),
          ),
          child: Row(
            children: [
              avatar,
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text.rich(
                            TextSpan(
                              children: _highlightSpans(
                                title,
                                searchQuery,
                                const TextStyle(
                                  color: AppColors.donkerblauw,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (tag != null) ...[
                          const SizedBox(width: 6),
                          Flexible(
                            flex: 0,
                            child: _CommunicationTag(
                              label: tag!,
                              color: tagColor,
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text.rich(
                      TextSpan(
                        children: [
                          ..._highlightSpans(
                            '$sender: ',
                            searchQuery,
                            const TextStyle(
                              color: Color(0xFF3B4F68),
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          ..._highlightSpans(
                            preview,
                            searchQuery,
                            const TextStyle(
                              color: Color(0xFF64748B),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    timeLabel,
                    style: const TextStyle(
                      color: Color(0xFF7A8AA0),
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 7),
                  if (unreadCount > 0)
                    _UnreadBadge(count: unreadCount)
                  else
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: Color(0xFFC9D5E2),
                        shape: BoxShape.circle,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _UnreadBadge extends StatelessWidget {
  final int count;
  const _UnreadBadge({required this.count});

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 20),
      height: 20,
      padding: const EdgeInsets.symmetric(horizontal: 6),
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        color: Color(0xFF25D366),
        borderRadius: BorderRadius.all(Radius.circular(999)),
      ),
      child: Text(
        count > 99 ? '99+' : '$count',
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _AnnouncementChatRow extends StatelessWidget {
  final int unreadCount;
  final String searchQuery;

  const _AnnouncementChatRow({
    required this.unreadCount,
    required this.searchQuery,
  });

  @override
  Widget build(BuildContext context) {
    return _CommunicationChatRow(
      avatar: const _CommunicationAvatar(
        icon: Icons.priority_high,
        colors: [AppColors.oranje, Color(0xFFFFBF65)],
      ),
      title: 'Annonces du club',
      sender: 'Club',
      preview: unreadCount > 0
          ? '$unreadCount nouveau${unreadCount > 1 ? 'x' : ''} à lire'
          : 'Toutes les annonces sont lues',
      timeLabel: unreadCount > 0 ? '12:41' : '08:17',
      unreadCount: unreadCount,
      searchQuery: searchQuery,
      tag: 'Annonce',
      tagColor: AppColors.oranje,
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) =>
                AnnouncementsScreen(initialSearchQuery: searchQuery),
          ),
        );
      },
    );
  }
}

class _LogbookConfirmationsInboxSection extends StatelessWidget {
  final String searchQuery;

  const _LogbookConfirmationsInboxSection({required this.searchQuery});

  @override
  Widget build(BuildContext context) {
    final userId = context.watch<AuthProvider>().currentUser?.uid;
    if (userId == null) return const SizedBox.shrink();

    const clubId = FirebaseConfig.defaultClubId;
    final stream = FirebaseFirestore.instance
        .collection('clubs')
        .doc(clubId)
        .collection('logbook_dive_confirmations')
        .where('target_member_id', isEqualTo: userId)
        .where('status', isEqualTo: 'pending')
        .snapshots();

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: stream,
      builder: (context, snapshot) {
        final docs = [...(snapshot.data?.docs ?? const [])];
        if (docs.isEmpty) return const SizedBox.shrink();
        final visibleDocs = docs.where((doc) {
          final data = doc.data();
          final snapshot =
              Map<String, dynamic>.from((data['dive_snapshot'] as Map?) ?? {});
          final sourceName = data['source_member_name'] as String?;
          final location = snapshot['location_name'] as String?;
          return _matchesSearch(searchQuery, [
            'Plongée avec ${sourceName ?? 'Un membre'}',
            'Carnet',
            location,
            'confirmer',
            'importer',
            'ignorer',
          ]);
        }).toList();
        if (visibleDocs.isEmpty) return const SizedBox.shrink();

        visibleDocs.sort((a, b) {
          final aTs = a.data()['created_at'];
          final bTs = b.data()['created_at'];
          if (aTs is Timestamp && bTs is Timestamp) return bTs.compareTo(aTs);
          return 0;
        });

        return Column(
          children: visibleDocs
              .map(
                (doc) => _LogbookConfirmationChatRow(
                  confirmationId: doc.id,
                  data: doc.data(),
                  searchQuery: searchQuery,
                ),
              )
              .toList(),
        );
      },
    );
  }
}

class _LogbookConfirmationChatRow extends StatelessWidget {
  final String confirmationId;
  final Map<String, dynamic> data;
  final String searchQuery;

  const _LogbookConfirmationChatRow({
    required this.confirmationId,
    required this.data,
    required this.searchQuery,
  });

  @override
  Widget build(BuildContext context) {
    final snapshot =
        Map<String, dynamic>.from((data['dive_snapshot'] as Map?) ?? {});
    final sourceName = data['source_member_name'] as String? ?? 'Un membre';
    final location = (snapshot['location_name'] as String?) ?? 'Plongée';
    final matchType = data['match_type'] as String? ?? 'none';

    return _CommunicationChatRow(
      avatar: _CommunicationAvatar(
        icon: matchType == 'identical'
            ? Icons.verified_outlined
            : matchType == 'similar'
                ? Icons.compare_arrows
                : Icons.scuba_diving_outlined,
        colors: const [Color(0xFFB875F2), Color(0xFF7C3AED)],
        online: true,
      ),
      title: 'Plongée avec $sourceName',
      sender: 'Carnet',
      preview: '$location · confirmer, importer ou ignorer',
      timeLabel: _formatShortTime(_timestampToDateTime(data['created_at'])),
      unreadCount: 1,
      searchQuery: searchQuery,
      tag: 'Action',
      tagColor: const Color(0xFF0F6D36),
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => LogbookDiveConfirmationScreen(
              confirmationId: confirmationId,
            ),
          ),
        );
      },
    );
  }
}

class _ActionsCalypsoInboxSection extends StatefulWidget {
  final _CommunicationFilter filter;
  final String searchQuery;

  const _ActionsCalypsoInboxSection({
    required this.filter,
    required this.searchQuery,
  });

  @override
  State<_ActionsCalypsoInboxSection> createState() =>
      _ActionsCalypsoInboxSectionState();
}

class _ActionsCalypsoInboxSectionState
    extends State<_ActionsCalypsoInboxSection> {
  final FormationTaskService _service = FormationTaskService();

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final memberProvider = context.watch<MemberProvider>();
    final userId = authProvider.currentUser?.uid;
    if (userId == null) return const SizedBox.shrink();

    final canScanHistoricalQr = PermissionHelper.canValidateLifras(
      clubStatuten: memberProvider.clubStatuten,
      plongeurCode: memberProvider.plongeurCode,
    );
    const clubId = FirebaseConfig.defaultClubId;

    return StreamBuilder<List<FormationTask>>(
      stream: _service.streamUserInbox(clubId, userId),
      builder: (context, snapshot) {
        final tasks = snapshot.data ?? const <FormationTask>[];
        final rows = <Widget>[];

        if (canScanHistoricalQr &&
            widget.filter != _CommunicationFilter.unread &&
            _matchesSearch(widget.searchQuery, const [
              'Scanner une carte papier',
              'Validation',
              'Contrôle une ancienne carte d’élève',
              'QR',
            ])) {
          rows.add(_HistoricalQrScanChatRow(searchQuery: widget.searchQuery));
        }

        rows.addAll(
          tasks
              .where((task) => _formationTaskMatchesSearch(
                    task,
                    widget.searchQuery,
                  ))
              .map((task) => _FormationTaskChatRow(
                    task: task,
                    searchQuery: widget.searchQuery,
                  )),
        );

        if (widget.filter == _CommunicationFilter.unread && rows.isEmpty) {
          return const SizedBox.shrink();
        }

        return Column(children: rows);
      },
    );
  }
}

class _HistoricalQrScanChatRow extends StatelessWidget {
  final String searchQuery;

  const _HistoricalQrScanChatRow({required this.searchQuery});

  @override
  Widget build(BuildContext context) {
    return _CommunicationChatRow(
      avatar: const _CommunicationAvatar(
        icon: Icons.qr_code_scanner,
        colors: [Color(0xFFD8B4FE), Color(0xFF7C3AED)],
        online: true,
      ),
      title: 'Scanner une carte papier',
      sender: 'Validation',
      preview: 'Contrôle une ancienne carte d’élève',
      timeLabel: '11:08',
      unreadCount: 1,
      searchQuery: searchQuery,
      tag: 'Action',
      tagColor: const Color(0xFF0F6D36),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const HistoricalQrScanScreen()),
      ),
    );
  }
}

class _FormationTaskChatRow extends StatelessWidget {
  final FormationTask task;
  final String searchQuery;

  const _FormationTaskChatRow({
    required this.task,
    required this.searchQuery,
  });

  @override
  Widget build(BuildContext context) {
    // WP-05 : pour une tâche de confirmation binôme, le badge reflète le nombre
    // de plongées réellement en attente de confirmation (pas un simple « 1 »).
    if (task.type == FormationTaskType.buddyConfirmation) {
      final userId = context.watch<AuthProvider>().currentUser?.uid;
      if (userId != null) {
        const clubId = FirebaseConfig.defaultClubId;
        final stream = FirebaseFirestore.instance
            .collection('clubs')
            .doc(clubId)
            .collection('logbook_dive_confirmations')
            .where('target_member_id', isEqualTo: userId)
            .where('status', isEqualTo: 'pending')
            .snapshots();
        return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: stream,
          builder: (context, snap) {
            final count = snap.data?.docs.length ?? 0;
            return _row(context, unreadCount: count > 0 ? count : 1);
          },
        );
      }
    }
    return _row(context, unreadCount: 1);
  }

  Widget _row(BuildContext context, {required int unreadCount}) {
    return _CommunicationChatRow(
      avatar: _CommunicationAvatar(
        text: task.glyph,
        colors: _formationTaskGradient(task),
        online: task.status == FormationTaskStatus.open,
      ),
      title: task.title,
      sender: task.typeLabel,
      preview: _formationTaskSubtitle(task).isEmpty
          ? _formationTaskStatusLabel(task)
          : _formationTaskSubtitle(task),
      timeLabel: _formatShortTime(task.updatedAt ?? task.createdAt),
      unreadCount: unreadCount,
      searchQuery: searchQuery,
      tag: 'Action',
      tagColor: const Color(0xFF0F6D36),
      onTap: () => _openFormationTask(context, task),
    );
  }
}

class _TeamChannelsInboxSection extends StatefulWidget {
  final _CommunicationFilter filter;
  final String searchQuery;
  final List<String> roles;
  final bool includeAllChannels;
  final String? plongeurCode;
  final String? targetFormationLevel;
  final bool formationActive;

  const _TeamChannelsInboxSection({
    required this.filter,
    required this.searchQuery,
    required this.roles,
    required this.includeAllChannels,
    this.plongeurCode,
    this.targetFormationLevel,
    this.formationActive = false,
  });

  @override
  State<_TeamChannelsInboxSection> createState() =>
      _TeamChannelsInboxSectionState();
}

class _TeamChannelsInboxSectionState extends State<_TeamChannelsInboxSection> {
  final TeamChannelService _channelService = TeamChannelService();
  List<TeamChannel> _lastChannels = const [];

  @override
  Widget build(BuildContext context) {
    const clubId = FirebaseConfig.defaultClubId;

    return StreamBuilder<List<TeamChannel>>(
      stream: _channelService.getChannelsForUser(
        clubId,
        widget.roles,
        includeAllChannels: widget.includeAllChannels,
        plongeurCode: widget.plongeurCode,
        targetFormationLevel: widget.targetFormationLevel,
        formationActive: widget.formationActive,
      ),
      builder: (context, snapshot) {
        if (snapshot.hasData && snapshot.data!.isNotEmpty) {
          _lastChannels = snapshot.data!;
        }
        final sourceChannels =
            snapshot.hasData ? snapshot.data! : _lastChannels;
        final channels = sourceChannels
            .where((channel) => _teamChannelMatchesSearch(
                  channel,
                  widget.searchQuery,
                ))
            .toList();
        if (channels.isEmpty) return const SizedBox.shrink();
        return Column(
          children: channels
              .map(
                (channel) => _TeamChannelChatRow(
                  channel: channel,
                  hideIfRead: widget.filter == _CommunicationFilter.unread,
                  searchQuery: widget.searchQuery,
                ),
              )
              .toList(),
        );
      },
    );
  }
}

class _TeamChannelChatRow extends StatelessWidget {
  final TeamChannel channel;
  final bool hideIfRead;
  final String searchQuery;
  static final UnreadCountService _unreadCountService = UnreadCountService();

  const _TeamChannelChatRow({
    required this.channel,
    required this.hideIfRead,
    required this.searchQuery,
  });

  @override
  Widget build(BuildContext context) {
    const clubId = FirebaseConfig.defaultClubId;
    final accentColor = _teamChannelAccentColor(channel.type);

    return FutureBuilder<int>(
      future: _unreadCountService.countUnreadForTeamChannel(clubId, channel.id),
      builder: (context, snapshot) {
        final unreadCount = snapshot.data ?? 0;
        if (hideIfRead && unreadCount == 0) return const SizedBox.shrink();
        return _CommunicationChatRow(
          avatar: _CommunicationAvatar(
            icon: channel.type.iconData,
            colors: [
              accentColor.withValues(alpha: 0.80),
              accentColor,
            ],
          ),
          title: channel.name,
          sender: channel.type.displayName,
          preview: channel.description ?? channel.type.description,
          timeLabel: unreadCount > 0 ? '10:22' : '09:55',
          unreadCount: unreadCount,
          searchQuery: searchQuery,
          onTap: () {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => TeamChatScreen(channel: channel),
              ),
            );
          },
        );
      },
    );
  }
}

String _formatShortTime(DateTime? date) {
  final value = date ?? DateTime.now();
  final hour = value.hour.toString().padLeft(2, '0');
  final minute = value.minute.toString().padLeft(2, '0');
  return '$hour:$minute';
}

DateTime? _timestampToDateTime(dynamic value) {
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  return null;
}

bool _matchesSearch(String query, Iterable<String?> values) {
  final needle = _normalizeSearch(query);
  if (needle.isEmpty) return true;
  return values
      .where((value) => value != null && value.trim().isNotEmpty)
      .map((value) => _normalizeSearch(value!))
      .any((value) => value.contains(needle));
}

String _normalizeSearch(String value) {
  return value
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[àáâãäå]'), 'a')
      .replaceAll(RegExp(r'[ç]'), 'c')
      .replaceAll(RegExp(r'[èéêë]'), 'e')
      .replaceAll(RegExp(r'[ìíîï]'), 'i')
      .replaceAll(RegExp(r'[ñ]'), 'n')
      .replaceAll(RegExp(r'[òóôõö]'), 'o')
      .replaceAll(RegExp(r'[ùúûü]'), 'u')
      .replaceAll(RegExp(r'[ýÿ]'), 'y')
      .replaceAll(RegExp(r'\s+'), ' ');
}

List<TextSpan> _highlightSpans(
  String text,
  String query,
  TextStyle baseStyle,
) {
  final needle = _normalizeSearch(query);
  if (needle.isEmpty || text.isEmpty) {
    return [TextSpan(text: text, style: baseStyle)];
  }

  final normalizedChars = <String>[];
  final originalOffsets = <int>[];
  var offset = 0;
  for (final rune in text.runes) {
    final char = String.fromCharCode(rune);
    normalizedChars.add(_foldSearchChar(char));
    originalOffsets.add(offset);
    offset += char.length;
  }

  final normalizedText = normalizedChars.join();
  final highlightStyle = baseStyle.copyWith(
    color: AppColors.donkerblauw,
    backgroundColor: const Color(0xFFFFE58A),
    fontWeight: FontWeight.w900,
  );

  final spans = <TextSpan>[];
  var normalizedIndex = 0;
  var originalIndex = 0;

  while (normalizedIndex < normalizedText.length) {
    final matchIndex = normalizedText.indexOf(needle, normalizedIndex);
    if (matchIndex < 0) break;

    final matchEndIndex = matchIndex + needle.length - 1;
    if (matchEndIndex >= originalOffsets.length) break;

    final originalStart = originalOffsets[matchIndex];
    final originalEndCharStart = originalOffsets[matchEndIndex];
    final originalEnd = originalEndCharStart +
        String.fromCharCode(text.runes.elementAt(matchEndIndex)).length;

    if (originalStart > originalIndex) {
      spans.add(TextSpan(
        text: text.substring(originalIndex, originalStart),
        style: baseStyle,
      ));
    }
    spans.add(TextSpan(
      text: text.substring(originalStart, originalEnd),
      style: highlightStyle,
    ));

    normalizedIndex = matchIndex + needle.length;
    originalIndex = originalEnd;
  }

  if (originalIndex < text.length) {
    spans.add(TextSpan(text: text.substring(originalIndex), style: baseStyle));
  }

  return spans.isEmpty ? [TextSpan(text: text, style: baseStyle)] : spans;
}

String _foldSearchChar(String char) {
  final lower = char.toLowerCase();
  if (RegExp(r'[àáâãäå]').hasMatch(lower)) return 'a';
  if (lower == 'ç') return 'c';
  if (RegExp(r'[èéêë]').hasMatch(lower)) return 'e';
  if (RegExp(r'[ìíîï]').hasMatch(lower)) return 'i';
  if (lower == 'ñ') return 'n';
  if (RegExp(r'[òóôõö]').hasMatch(lower)) return 'o';
  if (RegExp(r'[ùúûü]').hasMatch(lower)) return 'u';
  if (RegExp(r'[ýÿ]').hasMatch(lower)) return 'y';
  if (RegExp(r'\s').hasMatch(lower)) return ' ';
  return lower;
}

bool _formationTaskMatchesSearch(FormationTask task, String query) {
  return _matchesSearch(query, [
    task.title,
    task.description,
    task.typeLabel,
    _formationTaskSubtitle(task),
    _formationTaskStatusLabel(task),
    task.memberName,
    task.currentAssigneeName,
    task.context.operationTitle,
    task.context.targetGroupLevel,
  ]);
}

bool _teamChannelMatchesSearch(TeamChannel channel, String query) {
  return _matchesSearch(query, [
    channel.name,
    channel.description,
    channel.type.displayName,
    channel.type.description,
  ]);
}

String _formationTaskSubtitle(FormationTask task) {
  final parts = <String>[];
  if (task.context.targetGroupLevel != null) {
    parts.add(task.context.targetGroupLevel!);
  }
  if (task.context.operationTitle != null) {
    parts.add(task.context.operationTitle!);
  }
  if (task.status == FormationTaskStatus.blocked) parts.add('bloquée');
  if (task.status == FormationTaskStatus.snoozed) parts.add('reportée');
  return parts.join(' · ');
}

String _formationTaskStatusLabel(FormationTask task) {
  if (task.status == FormationTaskStatus.blocked) return 'Bloquée';
  if (task.status == FormationTaskStatus.snoozed) return 'Reportée';
  return 'À traiter';
}

void _openFormationTask(BuildContext context, FormationTask task) {
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
    case FormationTaskType.historicalValidation:
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) {
          final batchId = task.context.historicalClaimBatchId;
          if (batchId == null || batchId.isEmpty) {
            return const HistoricalClaimsScreen();
          }
          if (task.currentAssigneeType == FormationTaskAssigneeType.monitor ||
              task.currentAssigneeType ==
                  FormationTaskAssigneeType.schoolResponsible) {
            return HistoricalValidationScreen(batchId: batchId);
          }
          return HistoricalClaimQrScreen(batchId: batchId);
        },
      ));
      break;
    case FormationTaskType.monitorObservation:
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => MonitorObservationScreen(task: task),
      ));
      break;
    case FormationTaskType.externalProofReview:
      _openFormationTaskOnWeb(context, task, 'external-proof-review');
      break;
    case FormationTaskType.exerciseClaim:
      // WP-04 : écran natif si l'opération est connue ; sinon repli web
      // (anciennes tâches sans context.operation_id).
      if (task.context.operationId != null &&
          task.context.operationId!.isNotEmpty) {
        Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => ExerciseClaimScreen(task: task),
        ));
      } else {
        _openFormationTaskOnWeb(context, task, 'claim');
      }
      break;
    case FormationTaskType.claimRejected:
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => ExerciseClaimRetryScreen(task: task),
      ));
      break;
    case FormationTaskType.buddyConfirmation:
      // WP-05 : écran natif « Plongées à confirmer » au lieu du navigateur.
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => const LogbookDiveConfirmationsInboxScreen(),
      ));
      break;
    case FormationTaskType.eventPreparation:
      _openFormationTaskOnWeb(context, task, 'event-prep');
      break;
    case FormationTaskType.manualReminder:
      _openFormationTaskOnWeb(context, task, 'reminder');
      break;
    // ignore: unreachable_switch_default
    default:
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Action « ${task.typeLabel} » — bientôt disponible'),
        ),
      );
  }
}

Future<void> _openFormationTaskOnWeb(
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

List<Color> _formationTaskGradient(FormationTask task) {
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
    case FormationTaskType.historicalValidation:
      return [const Color(0xFFD8B4FE), const Color(0xFF7C3AED)];
    case FormationTaskType.externalProofReview:
      return [const Color(0xFFFCD9A6), const Color(0xFFF6921E)];
    default:
      return [const Color(0xFF94A3B8), const Color(0xFF475569)];
  }
}

Color _teamChannelAccentColor(TeamChannelType type) {
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
    case TeamChannelType.formation1:
    case TeamChannelType.formation2:
    case TeamChannelType.formation3:
    case TeamChannelType.formation4:
    case TeamChannelType.formationAM:
      return const Color(0xFF0E8A75);
  }
}
