import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/team_channel.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../providers/unread_count_provider.dart';
import '../../services/team_channel_service.dart';
import '../../services/unread_count_service.dart';
import '../../utils/club_role_utils.dart';
import '../../widgets/communication_filter_semantics.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'notification_history_screen.dart';
import '../announcements/announcements_screen.dart';
import '../home/landing_screen.dart';
import '../teams/team_chat_screen.dart';

enum _CommunicationFilter {
  all('Tout', Icons.forum_outlined),
  unread('Non lus', Icons.mark_chat_unread_outlined),
  notifications('Notif.', Icons.notifications_none_rounded),
  announcements('Annonces', Icons.campaign_outlined),
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
  late _CommunicationFilter _selectedFilter;
  String _searchQuery = '';
  List<String> _stableRoles = const [];
  bool _stableIncludeAllChannels = false;
  String? _stablePlongeurCode;
  String? _stableTargetFormationLevel;
  bool _stableFormationActive = false;
  bool _hasStableMemberContext = false;

  @override
  void initState() {
    super.initState();
    _selectedFilter = _CommunicationFilter.all;
  }

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
                onNotificationsTap: () => setState(
                  () => _selectedFilter = _CommunicationFilter.notifications,
                ),
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
    if (selectedFilter == _CommunicationFilter.notifications) {
      final memberId = context.read<AuthProvider>().currentUser?.uid;
      if (memberId == null) {
        return const Center(child: CircularProgressIndicator());
      }
      return NotificationHistoryContent(
        clubId: FirebaseConfig.defaultClubId,
        memberId: memberId,
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 32),
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
  final VoidCallback? onNotificationsTap;

  const _CommunicationHeader({
    required this.searchQuery,
    required this.onSearchChanged,
    this.onNotificationsTap,
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
                tooltip: 'Retour',
                onPressed: () {
                  final navigator = Navigator.of(context);
                  if (navigator.canPop()) {
                    navigator.pop();
                    return;
                  }

                  navigator.pushReplacement(
                    MaterialPageRoute(builder: (_) => const LandingScreen()),
                  );
                },
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
                      'Messages et annonces du club',
                      style: TextStyle(
                        color: Color(0xD9FFFFFF),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              if (widget.onNotificationsTap != null)
                IconButton(
                  tooltip: 'Historique des notifications',
                  onPressed: widget.onNotificationsTap,
                  icon: const Icon(
                    Icons.notifications_none_rounded,
                    color: Colors.white,
                    size: 27,
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
    const filters = _CommunicationFilter.values;

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
        children: filters.map((filter) {
          final selected = selectedFilter == filter;
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2.5),
              child: CommunicationFilterSemantics(
                label: filter.label,
                selected: selected,
                onTap: () => onSelected(filter),
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
                          color:
                              selected ? Colors.white : AppColors.donkerblauw,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
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
  final IconData icon;
  final List<Color> colors;

  const _CommunicationAvatar({
    required this.icon,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
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
      child: Icon(icon, color: Colors.white, size: 22),
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            constraints: const BoxConstraints(minHeight: 88),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: unreadCount > 0
                    ? const Color(0xFFB8DCF2)
                    : const Color(0xFFE4EDF3),
                width: unreadCount > 0 ? 1.5 : 1,
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                avatar,
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Semantics(
                              container: true,
                              label: title,
                              excludeSemantics: true,
                              child: Text.rich(
                                TextSpan(
                                  children: _highlightSpans(
                                    title,
                                    searchQuery,
                                    TextStyle(
                                      color: AppColors.donkerblauw,
                                      fontSize: 14,
                                      fontWeight: unreadCount > 0
                                          ? FontWeight.w900
                                          : FontWeight.w700,
                                    ),
                                  ),
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                          if (unreadCount > 0) ...[
                            const SizedBox(width: 8),
                            const _UnreadDot(),
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
                                color: Color(0xFF506982),
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12.5, height: 1.25),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Text(
                            timeLabel,
                            style: const TextStyle(
                              color: Color(0xFF7890A4),
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const Spacer(),
                          if (tag != null) ...[
                            _CommunicationTag(label: tag!, color: tagColor),
                            const SizedBox(width: 6),
                          ],
                          if (unreadCount > 1) ...[
                            _UnreadBadge(count: unreadCount),
                            const SizedBox(width: 4),
                          ],
                          Icon(
                            Icons.chevron_right_rounded,
                            color: tagColor,
                            size: 18,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _UnreadDot extends StatelessWidget {
  const _UnreadDot();

  @override
  Widget build(BuildContext context) => Container(
        width: 9,
        height: 9,
        decoration: const BoxDecoration(
          color: Color(0xFFE54B55),
          shape: BoxShape.circle,
        ),
      );
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

bool _teamChannelMatchesSearch(TeamChannel channel, String query) {
  return _matchesSearch(query, [
    channel.name,
    channel.description,
    channel.type.displayName,
    channel.type.description,
  ]);
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
