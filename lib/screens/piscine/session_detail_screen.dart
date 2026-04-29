import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/piscine_session.dart';
import '../../models/piscine_attendee.dart';
import '../../models/session_message.dart';
import '../../services/piscine_session_service.dart';
import '../../services/member_service.dart';
import '../../services/session_message_service.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../utils/permission_helper.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../config/piscine_slots.dart';
import '../../widgets/scanner_modal_sheet.dart';
import 'theme_edit_dialog.dart';
import 'session_chat_screen.dart';
import 'session_evaluation_screen.dart';
import '../../services/feature_flag_service.dart';

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
  final MemberService _memberService = MemberService();
  final SessionMessageService _messageService = SessionMessageService();
  late Stream<PiscineSession?> _sessionStream;
  List<SessionChatGroup> _chatGroups = [];

  @override
  void initState() {
    super.initState();
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final clubId = FirebaseConfig.defaultClubId;
    final userId = authProvider.currentUser?.uid;

    _sessionStream =
        _sessionService.getSessionStream(clubId, widget.session.id);

    // Get available chat groups for this user
    if (userId != null) {
      _chatGroups = _messageService.getAvailableGroups(
        session: widget.session,
        userId: userId,
      );
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
      eventEndDate: widget.session.date,
    );

    // Refresh after closing scanner
    if (mounted) {
      setState(() {});
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
          // Scanner button - add participant is now inside the scanner modal
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
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfish,
        opacity: 0.7,
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
                      title: 'Équipe Accueil 20h00',
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
                      title: 'Baptêmes 20h15',
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

                    const SizedBox(height: 16),

                    // Gonflage section (per slot)
                    _buildGonflageSection(session, userId),

                    // Théorie section (if applicable)
                    if (session.theorie != null &&
                        session.theorie!.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      _buildTheorieSection(session, userId, clubId),
                    ],

                    const SizedBox(height: 24),

                    // Niveaux section (only for piscine sessions)
                    if (session.type != 'theorie')
                      _buildNiveauxSection(session, userId, clubId),

                    // Attendees section - visible for all logged-in users
                    const SizedBox(height: 24),
                    _buildAttendeesSection(clubId, session),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildGonflageSection(PiscineSession session, String userId) {
    final gonflage = session.gonflage;
    final totalCount =
        gonflage.values.fold<int>(0, (sum, list) => sum + list.length);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 12),
          child: Row(
            children: [
              Text(
                'Gonflage',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white.withOpacity(0.9),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '$totalCount membre(s)',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
        ),
        // One card per slot
        ...GonflageSlots.all.map((slot) {
          final members = gonflage[slot] ?? [];
          return Container(
            margin: const EdgeInsets.only(bottom: 10),
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
                // Slot header
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.deepPurple.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.air,
                            color: Colors.deepPurple, size: 18),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        'Gonflage $slot',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: members.isEmpty
                              ? Colors.grey.shade200
                              : Colors.deepPurple.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          '${members.length}',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                            color: members.isEmpty
                                ? Colors.grey
                                : Colors.deepPurple,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                if (members.isNotEmpty) ...[
                  const Divider(height: 1),
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      children: members
                          .map((m) => _MemberTile(
                                name: m.fullName,
                                isCurrentUser: m.membreId == userId,
                              ))
                          .toList(),
                    ),
                  ),
                ] else
                  Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    child: Text(
                      'Aucun membre assigné',
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey.shade500,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _buildTheorieSection(
      PiscineSession session, String userId, String clubId) {
    final theorie = session.theorie!;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 12),
          child: Row(
            children: [
              Text(
                'Théorie',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white.withOpacity(0.9),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.orange.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Text(
                  '📖',
                  style: TextStyle(fontSize: 12),
                ),
              ),
            ],
          ),
        ),
        ...TheorieSlots.all.map((slot) {
          final slotData = theorie[slot];
          if (slotData == null) return const SizedBox.shrink();
          final members = slotData.encadrants;

          return Container(
            margin: const EdgeInsets.only(bottom: 10),
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
                // Slot header
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.orange.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.menu_book,
                            color: Colors.orange, size: 18),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        TheorieSlots.displayName(slot),
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
                // Theme if set
                if (slotData.theme != null && slotData.theme!.isNotEmpty) ...[
                  const Divider(height: 1),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 10),
                    child: Row(
                      children: [
                        Icon(Icons.topic,
                            size: 16, color: Colors.grey.shade500),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            slotData.theme!,
                            style: const TextStyle(
                              fontSize: 13,
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                // Encadrants
                if (members.isNotEmpty) ...[
                  const Divider(height: 1),
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Encadrants',
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.grey.shade500,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 6),
                        ...members.map((m) => _MemberTile(
                              name: m.fullName,
                              isCurrentUser: m.membreId == userId,
                            )),
                      ],
                    ),
                  ),
                ] else
                  Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    child: Text(
                      'Aucun encadrant assigné',
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey.shade500,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
              ],
            ),
          );
        }),
      ],
    );
  }

  /// True als de huidige gebruiker pedagogische beslissingen mag nemen op
  /// piscine-attendees (niveau-toewijzing, observaties, "Évaluer la session").
  /// Vereist Encadrant-functie ÉN Moniteur-niveau (MC/MF/MN), of admin —
  /// gespiegeld op `canValidateLifras(clubId)` in firestore.rules.
  bool get _canManageAttendeeAssignments {
    final memberProvider = Provider.of<MemberProvider>(context, listen: false);
    final statuten = memberProvider.clubStatuten;
    final plongeurCode = memberProvider.plongeurCode;
    return PermissionHelper.canValidateLifras(
      clubStatuten: statuten,
      plongeurCode: plongeurCode,
    );
  }

  String _slotHeureForLevel(String level) {
    return level == PiscineLevel.niveau1
        ? EncadrantSlots.premiereHeure
        : EncadrantSlots.deuxiemeHeure;
  }

  String _levelLabel(String level) {
    return 'Formation ${PiscineLevel.displayName(level)}';
  }

  String? _getNiveauEnFormation(String? plongeurCode) {
    if (plongeurCode == null || plongeurCode.trim().isEmpty) return null;

    switch (plongeurCode.trim().toUpperCase()) {
      case 'NB':
        return PiscineLevel.niveau1;
      case '1':
        return PiscineLevel.niveau2;
      case '2':
        return PiscineLevel.niveau3;
      case '3':
        return PiscineLevel.niveau4;
      case '4':
        return PiscineLevel.am;
      case 'AM':
      case 'MC':
        return PiscineLevel.mc;
      default:
        return null;
    }
  }

  bool _levelHasSessionContent(PiscineSession session, String level) {
    final assignment = session.niveaux[level];
    if (assignment == null) return false;

    final courses = assignment.getCoursesForHeure(_slotHeureForLevel(level));
    return assignment.encadrants.isNotEmpty ||
        courses.isNotEmpty ||
        (assignment.theme?.isNotEmpty ?? false) ||
        (assignment.theme1ereHeure?.isNotEmpty ?? false) ||
        (assignment.theme2emeHeure?.isNotEmpty ?? false);
  }

  List<String> _assignmentLevelsForSession(
    PiscineSession session, {
    String? naturalLevel,
    String? assignedLevel,
  }) {
    final levels = <String>[];

    for (final level in PiscineLevel.all) {
      if (_levelHasSessionContent(session, level) ||
          level == naturalLevel ||
          level == assignedLevel) {
        levels.add(level);
      }
    }

    return levels.isNotEmpty ? levels : List<String>.from(PiscineLevel.all);
  }

  _ResolvedCourseOption? _findCourseInLevel(
    PiscineSession session,
    String level,
    String courseId,
  ) {
    final assignment = session.niveaux[level];
    if (assignment == null) return null;

    final courses = assignment.getCoursesForHeure(_slotHeureForLevel(level));
    for (var i = 0; i < courses.length; i++) {
      final course = courses[i];
      if (course.id == courseId) {
        return _ResolvedCourseOption(
          level: level,
          courseId: course.id,
          label: 'Groupe ${i + 1}',
          theme: course.theme,
        );
      }
    }

    return null;
  }

  _ResolvedCourseOption? _resolveAssignedCourse(
    PiscineSession session,
    PiscineAttendee attendee,
  ) {
    final courseId = attendee.assignedCourseId;
    if (courseId == null || courseId.isEmpty) return null;

    final assignedLevel = attendee.assignedLevel;
    if (assignedLevel != null && assignedLevel.isNotEmpty) {
      final match = _findCourseInLevel(session, assignedLevel, courseId);
      if (match != null) return match;
    }

    for (final level in PiscineLevel.all) {
      final match = _findCourseInLevel(session, level, courseId);
      if (match != null) return match;
    }

    return null;
  }

  _AttendeeAssignmentSummary? _resolveAttendeeAssignmentSummary(
    PiscineSession session,
    PiscineAttendee attendee,
  ) {
    final hasLevel =
        attendee.assignedLevel != null && attendee.assignedLevel!.isNotEmpty;
    final hasCourse = attendee.assignedCourseId != null &&
        attendee.assignedCourseId!.isNotEmpty;
    if (!hasLevel && !hasCourse) return null;

    final resolvedCourse = _resolveAssignedCourse(session, attendee);
    final level = attendee.assignedLevel ?? resolvedCourse?.level;
    if (level == null || level.isEmpty) return null;

    return _AttendeeAssignmentSummary(
      label: resolvedCourse != null
          ? '${_levelLabel(level)} · ${resolvedCourse.label}'
          : _levelLabel(level),
      theme: resolvedCourse?.theme,
    );
  }

  Widget _buildAttendeeSubtitle(
    PiscineSession session,
    PiscineAttendee attendee,
  ) {
    final summary = _resolveAttendeeAssignmentSummary(session, attendee);

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _formatTime(attendee.scannedAt),
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey.shade500,
          ),
        ),
        if (summary != null) ...[
          const SizedBox(height: 4),
          Text(
            summary.label,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: Color(0xFF4338CA),
            ),
          ),
          if (summary.theme != null && summary.theme!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                summary.theme!,
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey.shade600,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
        ],
      ],
    );
  }

  Widget _buildGuestBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
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
    );
  }

  Widget? _buildAttendeeTrailing(
    PiscineAttendee attendee,
    bool canManageAssignments,
  ) {
    if (!attendee.isGuest && !canManageAssignments) return null;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (attendee.isGuest) _buildGuestBadge(),
        if (canManageAssignments) ...[
          if (attendee.isGuest) const SizedBox(width: 8),
          Icon(
            Icons.chevron_right,
            color: Colors.grey.shade400,
          ),
        ],
      ],
    );
  }

  Future<void> _showAttendeeAssignmentSheet({
    required String clubId,
    required PiscineSession session,
    required PiscineAttendee attendee,
  }) async {
    final memberFuture = attendee.isGuest
        ? Future<Map<String, dynamic>?>.value(null)
        : _memberService.getMemberData(clubId, attendee.memberId);

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) {
        return SafeArea(
          child: FutureBuilder<Map<String, dynamic>?>(
            future: memberFuture,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const SizedBox(
                  height: 240,
                  child: Center(
                    child: CircularProgressIndicator(
                      color: AppColors.middenblauw,
                    ),
                  ),
                );
              }

              final memberData = snapshot.data;
              final naturalLevel = _getNiveauEnFormation(
                memberData?['plongeur_code']?.toString(),
              );
              final currentSummary =
                  _resolveAttendeeAssignmentSummary(session, attendee);
              final availableLevels = _assignmentLevelsForSession(
                session,
                naturalLevel: naturalLevel,
                assignedLevel: attendee.assignedLevel,
              );

              Future<void> applyAssignment({
                String? assignedLevel,
                String? assignedCourseId,
              }) async {
                final sheetNavigator = Navigator.of(sheetContext);
                final sameLevel =
                    (attendee.assignedLevel ?? '') == (assignedLevel ?? '');
                final sameCourse = (attendee.assignedCourseId ?? '') ==
                    (assignedCourseId ?? '');
                if (sameLevel && sameCourse) {
                  sheetNavigator.pop();
                  return;
                }

                try {
                  await _sessionService.updateAttendeeAssignment(
                    clubId: clubId,
                    sessionId: session.id,
                    attendeeId: attendee.id,
                    assignedLevel: assignedLevel,
                    assignedCourseId: assignedCourseId,
                  );

                  if (sheetNavigator.canPop()) {
                    sheetNavigator.pop();
                  }
                  if (!mounted) return;

                  final message = assignedLevel == null
                      ? 'Affectation réinitialisée pour ${attendee.memberName}'
                      : 'Affectation mise à jour pour ${attendee.memberName}';

                  ScaffoldMessenger.of(this.context).showSnackBar(
                    SnackBar(
                      content: Text(message),
                      backgroundColor: Colors.green,
                    ),
                  );
                } catch (e) {
                  if (!mounted) return;
                  ScaffoldMessenger.of(this.context).showSnackBar(
                    SnackBar(
                      content: Text('Erreur: $e'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              }

              return Padding(
                padding: EdgeInsets.fromLTRB(
                  16,
                  8,
                  16,
                  16 + MediaQuery.of(context).viewInsets.bottom,
                ),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.of(context).size.height * 0.82,
                  ),
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Affectation formation',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          attendee.memberName,
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey.shade700,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF8FAFC),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFE2E8F0)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (currentSummary != null) ...[
                                const Text(
                                  'Affectation actuelle',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: Color(0xFF475569),
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  currentSummary.label,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF4338CA),
                                  ),
                                ),
                                if (currentSummary.theme != null &&
                                    currentSummary.theme!.isNotEmpty)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 2),
                                    child: Text(
                                      currentSummary.theme!,
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.grey.shade600,
                                      ),
                                    ),
                                  ),
                              ],
                              if (naturalLevel != null) ...[
                                if (currentSummary != null)
                                  const SizedBox(height: 10),
                                const Text(
                                  'Niveau détecté',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: Color(0xFF475569),
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  _levelLabel(naturalLevel),
                                  style: const TextStyle(fontSize: 13),
                                ),
                              ],
                              if (attendee.isGuest) ...[
                                if (currentSummary != null ||
                                    naturalLevel != null)
                                  const SizedBox(height: 10),
                                Text(
                                  'Participant invité: choisissez un groupe manuellement si nécessaire.',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey.shade600,
                                  ),
                                ),
                              ],
                              if (snapshot.hasError) ...[
                                if (currentSummary != null ||
                                    naturalLevel != null ||
                                    attendee.isGuest)
                                  const SizedBox(height: 10),
                                Text(
                                  'Impossible de relire le profil membre, les affectations manuelles restent disponibles.',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.orange.shade700,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        ListTile(
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 2,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                            side: const BorderSide(color: Color(0xFFE2E8F0)),
                          ),
                          leading: const Icon(Icons.undo,
                              color: AppColors.middenblauw),
                          title:
                              const Text('Revenir à l’affectation par défaut'),
                          subtitle: Text(
                            naturalLevel != null
                                ? 'Utiliser le niveau détecté: ${_levelLabel(naturalLevel)}'
                                : 'Supprimer toute affectation forcée pour ce participant.',
                          ),
                          trailing: attendee.assignedLevel == null &&
                                  attendee.assignedCourseId == null
                              ? const Icon(
                                  Icons.check_circle,
                                  color: AppColors.success,
                                )
                              : null,
                          onTap: () => applyAssignment(),
                        ),
                        const SizedBox(height: 16),
                        ...availableLevels.map((level) {
                          final assignment = session.niveaux[level];
                          final courses = assignment?.getCoursesForHeure(
                                _slotHeureForLevel(level),
                              ) ??
                              const <LevelCourse>[];
                          final hasParallelCourses = courses.length > 1;
                          final singleTheme = courses.length == 1
                              ? courses.first.theme
                              : assignment?.getEffectiveTheme(
                                  heure: _slotHeureForLevel(level),
                                );
                          final levelSelected =
                              attendee.assignedLevel == level &&
                                  (attendee.assignedCourseId == null ||
                                      attendee.assignedCourseId!.isEmpty);

                          return Container(
                            margin: const EdgeInsets.only(bottom: 12),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(14),
                              border:
                                  Border.all(color: const Color(0xFFE2E8F0)),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Padding(
                                  padding:
                                      const EdgeInsets.fromLTRB(12, 12, 12, 6),
                                  child: Row(
                                    children: [
                                      Text(
                                        PiscineLevel.stars(level),
                                        style: const TextStyle(fontSize: 18),
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              _levelLabel(level),
                                              style: const TextStyle(
                                                fontSize: 14,
                                                fontWeight: FontWeight.bold,
                                              ),
                                            ),
                                            Text(
                                              'Créneau ${EncadrantSlots.timeForLevel(level)}',
                                              style: TextStyle(
                                                fontSize: 11,
                                                color: Colors.grey.shade600,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                ListTile(
                                  dense: true,
                                  contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 2,
                                  ),
                                  leading: const Icon(
                                    Icons.school_outlined,
                                    color: AppColors.middenblauw,
                                  ),
                                  title: Text(_levelLabel(level)),
                                  subtitle: Text(
                                    hasParallelCourses
                                        ? 'Sans groupe précis, à répartir ensuite'
                                        : (singleTheme != null &&
                                                singleTheme.isNotEmpty)
                                            ? singleTheme
                                            : 'Aucun thème défini',
                                  ),
                                  trailing: levelSelected
                                      ? const Icon(
                                          Icons.check_circle,
                                          color: AppColors.success,
                                        )
                                      : null,
                                  onTap: () => applyAssignment(
                                    assignedLevel: level,
                                  ),
                                ),
                                if (hasParallelCourses)
                                  const Divider(height: 1),
                                if (hasParallelCourses)
                                  ...courses.asMap().entries.map((entry) {
                                    final index = entry.key;
                                    final course = entry.value;
                                    final courseSelected =
                                        attendee.assignedLevel == level &&
                                            attendee.assignedCourseId ==
                                                course.id;

                                    return ListTile(
                                      dense: true,
                                      contentPadding:
                                          const EdgeInsets.symmetric(
                                        horizontal: 20,
                                        vertical: 2,
                                      ),
                                      leading: Container(
                                        width: 30,
                                        height: 30,
                                        alignment: Alignment.center,
                                        decoration: BoxDecoration(
                                          color: const Color(0xFFEDE9FE),
                                          borderRadius:
                                              BorderRadius.circular(999),
                                        ),
                                        child: Text(
                                          '${index + 1}',
                                          style: const TextStyle(
                                            fontWeight: FontWeight.bold,
                                            color: Color(0xFF5B21B6),
                                          ),
                                        ),
                                      ),
                                      title: Text('Groupe ${index + 1}'),
                                      subtitle: Text(
                                        (course.theme != null &&
                                                course.theme!.isNotEmpty)
                                            ? course.theme!
                                            : 'Thème à définir',
                                      ),
                                      trailing: courseSelected
                                          ? const Icon(
                                              Icons.check_circle,
                                              color: AppColors.success,
                                            )
                                          : null,
                                      onTap: () => applyAssignment(
                                        assignedLevel: level,
                                        assignedCourseId: course.id,
                                      ),
                                    );
                                  }),
                              ],
                            ),
                          );
                        }),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }

  Widget _buildAttendeesSection(String clubId, PiscineSession session) {
    final canManageAssignments = _canManageAttendeeAssignments;

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
            stream:
                _sessionService.getAttendeesStream(clubId, widget.session.id),
            builder: (context, snapshot) {
              final attendees = snapshot.data ?? [];

              if (snapshot.connectionState == ConnectionState.waiting &&
                  attendees.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(
                    child: CircularProgressIndicator(
                      color: AppColors.middenblauw,
                    ),
                  ),
                );
              }

              return Column(
                children: [
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
                        const Text(
                          'Présents',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 4,
                          ),
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
                  if (canManageAssignments && attendees.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF8FAFC),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFFE2E8F0)),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.swap_horiz,
                              size: 18,
                              color: AppColors.middenblauw,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Touchez un participant pour choisir son niveau ou son groupe parallèle.',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey.shade700,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  if (attendees.isNotEmpty)
                    StreamBuilder<bool>(
                      stream: FeatureFlagService().isCarnetFormationEnabled(
                        FirebaseConfig.defaultClubId,
                      ),
                      builder: (context, flagSnap) {
                        if (flagSnap.data != true) {
                          return const SizedBox.shrink();
                        }
                        if (!canManageAssignments) {
                          return const SizedBox.shrink();
                        }
                        return Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          child: SizedBox(
                            width: double.infinity,
                            child: OutlinedButton.icon(
                              onPressed: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => SessionEvaluationScreen(
                                      session: widget.session,
                                    ),
                                  ),
                                );
                              },
                              icon: const Icon(Icons.grading, size: 18),
                              label: const Text('Évaluer la session'),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: AppColors.primary,
                                side: BorderSide(
                                  color: AppColors.primary.withOpacity(0.5),
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  const Divider(height: 1),
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
                        final summary = _resolveAttendeeAssignmentSummary(
                            session, attendee);

                        return Dismissible(
                          key: Key(attendee.id),
                          direction: DismissDirection.endToStart,
                          background: Container(
                            color: Colors.red,
                            alignment: Alignment.centerRight,
                            padding: const EdgeInsets.only(right: 16),
                            child:
                                const Icon(Icons.delete, color: Colors.white),
                          ),
                          confirmDismiss: (direction) async {
                            return await showDialog<bool>(
                                  context: context,
                                  builder: (context) => AlertDialog(
                                    title: const Text('Supprimer?'),
                                    content: Text(
                                      'Supprimer ${attendee.memberName} de la liste?',
                                    ),
                                    actions: [
                                      TextButton(
                                        onPressed: () =>
                                            Navigator.of(context).pop(false),
                                        child: const Text('Annuler'),
                                      ),
                                      TextButton(
                                        onPressed: () =>
                                            Navigator.of(context).pop(true),
                                        style: TextButton.styleFrom(
                                          foregroundColor: Colors.red,
                                        ),
                                        child: const Text('Supprimer'),
                                      ),
                                    ],
                                  ),
                                ) ??
                                false;
                          },
                          onDismissed: (direction) async {
                            await _sessionService.removeAttendee(
                              clubId: clubId,
                              sessionId: widget.session.id,
                              attendeeId: attendee.id,
                            );
                            if (!mounted) return;
                            ScaffoldMessenger.of(this.context).showSnackBar(
                              SnackBar(
                                content:
                                    Text('${attendee.memberName} supprimé'),
                                backgroundColor: Colors.orange,
                              ),
                            );
                          },
                          child: ListTile(
                            onTap: canManageAssignments
                                ? () => _showAttendeeAssignmentSheet(
                                      clubId: clubId,
                                      session: session,
                                      attendee: attendee,
                                    )
                                : null,
                            isThreeLine: summary?.theme != null &&
                                summary!.theme!.isNotEmpty,
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
                            subtitle: _buildAttendeeSubtitle(session, attendee),
                            trailing: _buildAttendeeTrailing(
                              attendee,
                              canManageAssignments,
                            ),
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
          child: Column(
            children: _chatGroups.asMap().entries.map((entry) {
              final index = entry.key;
              final group = entry.value;

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
                    trailing: Icon(
                      Icons.chevron_right,
                      color: Colors.grey.shade400,
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

          // Cacher les niveaux vides (pas d'encadrants et pas de thème)
          final hasNoContent = levelAssignment.encadrants.isEmpty &&
              (levelAssignment.theme == null ||
                  levelAssignment.theme!.isEmpty) &&
              (levelAssignment.theme1ereHeure == null ||
                  levelAssignment.theme1ereHeure!.isEmpty) &&
              (levelAssignment.theme2emeHeure == null ||
                  levelAssignment.theme2emeHeure!.isEmpty);
          if (hasNoContent) return const SizedBox.shrink();

          final isUserLevel = userEncadrantLevel == level;
          final canEditTheme =
              isUserLevel && !levelAssignment.hasParallelCourses;

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

class _ResolvedCourseOption {
  final String level;
  final String courseId;
  final String label;
  final String? theme;

  const _ResolvedCourseOption({
    required this.level,
    required this.courseId,
    required this.label,
    this.theme,
  });
}

class _AttendeeAssignmentSummary {
  final String label;
  final String? theme;

  const _AttendeeAssignmentSummary({
    required this.label,
    this.theme,
  });
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
                  session.type == 'theorie' ? Icons.menu_book : Icons.pool,
                  color: session.type == 'theorie'
                      ? Colors.orange
                      : AppColors.donkerblauw,
                  size: 28,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          session.type == 'theorie'
                              ? 'Séance Théorie'
                              : 'Séance Piscine',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: AppColors.donkerblauw,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: session.type == 'theorie'
                                ? Colors.orange.withOpacity(0.15)
                                : AppColors.lichtblauw.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: session.type == 'theorie'
                                  ? Colors.orange.withOpacity(0.4)
                                  : AppColors.lichtblauw.withOpacity(0.4),
                            ),
                          ),
                          child: Text(
                            session.type == 'theorie'
                                ? '📖 Théorie'
                                : '🏊 Piscine',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: session.type == 'theorie'
                                  ? Colors.orange.shade700
                                  : AppColors.middenblauw,
                            ),
                          ),
                        ),
                      ],
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
            backgroundColor:
                isCurrentUser ? AppColors.middenblauw : Colors.grey.shade300,
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

  String get _slotHeure => level == '1*'
      ? EncadrantSlots.premiereHeure
      : EncadrantSlots.deuxiemeHeure;

  List<LevelCourse> get _courses => assignment.getCoursesForHeure(_slotHeure);

  /// Effectief thema: combineert per-uur thema's of valt terug op globaal thema
  String? get _effectiveTheme {
    if (_courses.length > 1) return null;
    if (_courses.length == 1)
      return _courses.first.theme ??
          assignment.getEffectiveTheme(heure: _slotHeure);
    final t1 = assignment.theme1ereHeure;
    final t2 = assignment.theme2emeHeure;
    final hasT1 = t1 != null && t1.isNotEmpty;
    final hasT2 = t2 != null && t2.isNotEmpty;
    if (hasT1 && hasT2) return '20h15: $t1\n21h15: $t2';
    if (hasT1) return '20h15: $t1';
    if (hasT2) return '21h15: $t2';
    return assignment.theme;
  }

  @override
  Widget build(BuildContext context) {
    final hasEncadrants = assignment.encadrants.isNotEmpty;
    final hasParallelCourses = _courses.length > 1;

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
                        '${PiscineLevel.displayName(level)} ${EncadrantSlots.timeForLevel(level)}',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        hasParallelCourses
                            ? '${_courses.length} cours parallèles · ${assignment.encadrants.length} encadrant(s)'
                            : '${assignment.encadrants.length} encadrant(s)',
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
                      hasParallelCourses ? 'Cours parallèles' : 'Thème du jour',
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
                if (hasParallelCourses)
                  Column(
                    children: _courses
                        .asMap()
                        .entries
                        .map((entry) => Padding(
                              padding: EdgeInsets.only(
                                  bottom: entry.key == _courses.length - 1
                                      ? 0
                                      : 10),
                              child: _ParallelCourseTile(
                                title: 'Groupe ${entry.key + 1}',
                                theme: entry.value.theme,
                                encadrants: entry.value.encadrants,
                                currentUserId: currentUserId,
                              ),
                            ))
                        .toList(),
                  )
                else
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color:
                          _effectiveTheme != null && _effectiveTheme!.isNotEmpty
                              ? AppColors.lichtblauw.withOpacity(0.1)
                              : Colors.grey.shade100,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: _effectiveTheme != null &&
                                _effectiveTheme!.isNotEmpty
                            ? AppColors.lichtblauw.withOpacity(0.3)
                            : Colors.grey.shade200,
                      ),
                    ),
                    child: Text(
                      _effectiveTheme?.isNotEmpty == true
                          ? _effectiveTheme!
                          : 'Pas encore défini',
                      style: TextStyle(
                        fontSize: 14,
                        color: _effectiveTheme?.isNotEmpty == true
                            ? Colors.black87
                            : Colors.grey.shade500,
                        fontStyle: _effectiveTheme?.isNotEmpty == true
                            ? FontStyle.normal
                            : FontStyle.italic,
                      ),
                    ),
                  ),
                if (!hasParallelCourses && assignment.themeUpdatedBy != null)
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
          if (hasEncadrants && !hasParallelCourses) ...[
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

class _ParallelCourseTile extends StatelessWidget {
  final String title;
  final String? theme;
  final List<SessionAssignment> encadrants;
  final String currentUserId;

  const _ParallelCourseTile({
    required this.title,
    required this.theme,
    required this.encadrants,
    required this.currentUserId,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF5F3FF),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFC4B5FD)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFFDDD6FE),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.6,
                color: Color(0xFF4338CA),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            (theme != null && theme!.isNotEmpty) ? theme! : 'Thème à définir',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: (theme != null && theme!.isNotEmpty)
                  ? Colors.black87
                  : Colors.grey.shade500,
              fontStyle: (theme != null && theme!.isNotEmpty)
                  ? FontStyle.normal
                  : FontStyle.italic,
            ),
          ),
          const SizedBox(height: 10),
          ...encadrants.map((member) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: _MemberTile(
                  name: member.fullName,
                  isCurrentUser: member.membreId == currentUserId,
                ),
              )),
          if (encadrants.isEmpty)
            Text(
              'Aucun encadrant',
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey.shade500,
                fontStyle: FontStyle.italic,
              ),
            ),
        ],
      ),
    );
  }
}
