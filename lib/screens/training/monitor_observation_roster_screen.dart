import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/formation_task_roster.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/formation_task_service.dart';
import '../../utils/member_name.dart';
import '../../utils/roster_activity_summary.dart';
import '../../screens/piscine/theme_edit_dialog.dart';
import '../../widgets/monitor_observation_roster_member_card.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class MonitorObservationRosterScreen extends StatefulWidget {
  final FormationTaskRoster roster;

  const MonitorObservationRosterScreen({
    super.key,
    required this.roster,
  });

  @override
  State<MonitorObservationRosterScreen> createState() =>
      _MonitorObservationRosterScreenState();
}

class _MonitorObservationRosterScreenState
    extends State<MonitorObservationRosterScreen> {
  final FormationTaskService _taskService = FormationTaskService();
  final Map<String, String?> _verdicts = {};
  final Map<String, bool?> _presence = {};
  final Map<String, TextEditingController> _comments = {};
  Map<String, _RosterMemberIdentity> _identities = const {};
  Map<String, RosterActivitySummary> _activities = const {};
  _RosterSessionContext? _session;
  bool _loadingContext = true;
  bool _saving = false;
  bool _savingTheme = false;
  bool _discardConfirmed = false;
  late String? _theme;

  @override
  void initState() {
    super.initState();
    _theme = widget.roster.theme;
    for (final member in widget.roster.members) {
      _verdicts[member.memberId] = null;
      _presence[member.memberId] = null;
      _comments[member.memberId] = TextEditingController();
    }
    _loadContext();
  }

  @override
  void dispose() {
    for (final controller in _comments.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _loadContext() async {
    const clubId = FirebaseConfig.defaultClubId;
    final db = FirebaseFirestore.instance;
    try {
      final sessionFuture = widget.roster.sessionId.isEmpty
          ? Future<DocumentSnapshot<Map<String, dynamic>>?>.value(null)
          : db
              .collection('clubs')
              .doc(clubId)
              .collection('piscine_sessions')
              .doc(widget.roster.sessionId)
              .get();
      final memberFutures = widget.roster.members
          .where((member) => member.memberId.isNotEmpty)
          .map(
            (member) => db
                .collection('clubs')
                .doc(clubId)
                .collection('members')
                .doc(member.memberId)
                .get(),
          )
          .toList();
      final attendeeFutures = widget.roster.sessionId.isEmpty
          ? <Future<DocumentSnapshot<Map<String, dynamic>>>>[]
          : widget.roster.members
              .where((member) => member.memberId.isNotEmpty)
              .map(
                (member) => db
                    .collection('clubs')
                    .doc(clubId)
                    .collection('piscine_sessions')
                    .doc(widget.roster.sessionId)
                    .collection('attendees')
                    .doc(member.memberId)
                    .get(),
              )
              .toList();
      final sessionDoc = await sessionFuture;
      final memberDocs = await Future.wait(memberFutures);
      final attendeeDocs = await Future.wait(attendeeFutures);
      if (!mounted) return;
      setState(() {
        if (sessionDoc?.exists == true) {
          _session = _RosterSessionContext.fromMap(
            widget.roster.sessionId,
            sessionDoc!.data() ?? const {},
          );
        }
        _identities = {
          for (final doc in memberDocs)
            if (doc.exists)
              doc.id: _RosterMemberIdentity.fromMap(
                doc.id,
                doc.data() ?? const {},
              ),
        };
        _activities = {
          for (final doc in attendeeDocs)
            if (doc.exists)
              doc.id: summarizeRosterActivity(
                (doc.data() ?? const {})['hoursReport'] ??
                    (doc.data() ?? const {})['hours_report'],
              ),
        };
        for (final member in widget.roster.members) {
          final declared = _activities[member.memberId]?.isPresent;
          if (_presence[member.memberId] == null && declared != null) {
            _presence[member.memberId] = declared;
          }
        }
        _loadingContext = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingContext = false);
    }
  }

  bool get _canSave =>
      !_saving &&
      widget.roster.members.isNotEmpty &&
      widget.roster.members.every(
        (member) => isRosterMemberComplete(
          _presence[member.memberId],
          _verdicts[member.memberId],
        ),
      );

  bool get _hasUnsavedChanges =>
      _verdicts.values.any((value) => value != null) ||
      _presence.entries.any((entry) {
        final declared = _activities[entry.key]?.isPresent;
        return entry.value != null && entry.value != declared;
      }) ||
      _comments.values.any((controller) => controller.text.trim().isNotEmpty);

  Future<bool> _confirmDiscard() async {
    if (!_hasUnsavedChanges || _saving) return true;
    return await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Quitter sans enregistrer ?'),
            content: const Text(
              'Les présences, évaluations et commentaires non enregistrés '
              'seront perdus.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Continuer l’évaluation'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Quitter'),
              ),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _save() async {
    if (!_canSave) return;
    final auth = context.read<AuthProvider>();
    final memberProvider = context.read<MemberProvider>();
    final userId = auth.currentUser?.uid;
    if (userId == null) return;
    setState(() => _saving = true);
    try {
      final observerName = memberProvider.displayName;
      final completions = <String, FormationTaskRosterCompletion>{};
      for (final member in widget.roster.members) {
        final isPresent = _presence[member.memberId]!;
        final verdict = isPresent ? _verdicts[member.memberId] : null;
        for (final task in member.tasks) {
          completions[task.id] = FormationTaskRosterCompletion(
            verdict: verdict,
            attendanceStatus: isPresent ? 'present' : 'absent',
            comment: _comments[member.memberId]?.text ?? '',
            poolSessionId: task.context.poolSessionId,
            groupKey: task.context.groupKey,
            themeSnapshot: _theme,
            memberId: task.memberId,
            logbookEntryId: task.context.logbookEntryId,
          );
        }
      }
      await _taskService.markObservationRosterDone(
        FirebaseConfig.defaultClubId,
        userId,
        observerName,
        completions,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${widget.roster.members.length} évaluation(s) enregistrée(s)',
          ),
        ),
      );
      Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur : $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _editTheme() async {
    final result = await showDialog<String>(
      context: context,
      builder: (_) => ThemeEditDialog(
        level: widget.roster.level ?? '',
        currentTheme: _theme ?? '',
      ),
    );
    final theme = result?.trim();
    if (theme == null || theme.isEmpty || theme == _theme) return;
    setState(() => _savingTheme = true);
    try {
      await _taskService.updateObservationRosterTheme(
        FirebaseConfig.defaultClubId,
        widget.roster.members
            .expand((member) => member.tasks)
            .map((task) => task.id),
        theme,
      );
      if (!mounted) return;
      setState(() => _theme = theme);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Thème de séance enregistré')),
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Impossible d’enregistrer le thème : $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _savingTheme = false);
    }
  }

  Future<void> _editComment(
    FormationTaskRosterMember member,
    String name,
  ) async {
    final controller = _comments[member.memberId]!;
    final original = controller.text;
    final saved = await showDialog<bool>(
      context: context,
      builder: (_) => RosterCommentDialog(
        memberName: name,
        controller: controller,
      ),
    );
    if (saved != true) controller.text = original;
    if (mounted) setState(() {});
  }

  void _applyBatchVerdict(String verdict) {
    final before = Map<String, String?>.from(_verdicts);
    final changed = applyVerdictToUnevaluated(
      _verdicts,
      verdict,
      presence: _presence,
    );
    if (changed == 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Tous les membres sont déjà évalués')),
      );
      return;
    }
    setState(() {});
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text('$changed membre(s) complété(s), sans écraser les choix'),
        action: SnackBarAction(
          label: 'Annuler',
          onPressed: () {
            if (mounted) setState(() => _verdicts.addAll(before));
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = _session;
    return PopScope(
      canPop: _discardConfirmed || (!_hasUnsavedChanges && !_saving),
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop || _saving) return;
        if (await _confirmDiscard() && mounted) {
          setState(() => _discardConfirmed = true);
          Navigator.pop(this.context);
        }
      },
      child: Scaffold(
        body: OceanGradientBackground(
          creatures: CreatureSet.jellyfishAndBubbles,
          child: SafeArea(
            child: Column(
              children: [
                _header(),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    children: [
                      _contextCard(session),
                      const SizedBox(height: 14),
                      if (_loadingContext)
                        const LinearProgressIndicator(
                          color: AppColors.middenblauw,
                        ),
                      const SizedBox(height: 12),
                      _batchControls(),
                      const SizedBox(height: 10),
                      Card(
                        margin: EdgeInsets.zero,
                        child: Column(
                          children: [
                            for (var index = 0;
                                index < widget.roster.members.length;
                                index++) ...[
                              if (index > 0) const Divider(height: 1),
                              _memberCard(widget.roster.members[index]),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        bottomNavigationBar: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: FilledButton.icon(
              key: const ValueKey('save-observation-roster'),
              onPressed: _canSave ? _save : null,
              icon: _saving
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.check_circle_outline),
              label: Text(
                _saving
                    ? 'Enregistrement…'
                    : 'Enregistrer le groupe (${widget.roster.members.length})',
              ),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.middenblauw,
                minimumSize: const Size.fromHeight(50),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _header() => Padding(
        padding: const EdgeInsets.fromLTRB(8, 10, 16, 12),
        child: Row(
          children: [
            IconButton(
              onPressed: () async {
                if (await _confirmDiscard() && mounted) {
                  setState(() => _discardConfirmed = true);
                  Navigator.pop(context);
                }
              },
              icon: const Icon(Icons.arrow_back, color: Colors.white),
            ),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Évaluer le groupe',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 21,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    'Observation post-piscine',
                    style: TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _contextCard(_RosterSessionContext? session) {
    final dateLabel = session?.dateLabel ??
        _RosterSessionContext.dateFromId(widget.roster.sessionId);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              session?.poolName ?? 'Piscine non renseignée',
              style: const TextStyle(
                color: AppColors.donkerblauw,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            _contextLine(Icons.calendar_today_outlined, 'Date', dateLabel),
            _contextLine(
              Icons.school_outlined,
              'Niveau',
              widget.roster.level ?? 'Non renseigné',
            ),
            _contextLine(
              Icons.groups_outlined,
              'Groupe',
              _readableGroup(widget.roster.groupKey),
            ),
            Semantics(
              button: true,
              label: 'Modifier le thème de la séance',
              child: InkWell(
                key: const ValueKey('edit-roster-theme'),
                onTap: _savingTheme ? null : _editTheme,
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        Icons.menu_book_outlined,
                        size: 17,
                        color: AppColors.middenblauw,
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        'Thème : ',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      Expanded(
                        child: Text(_theme ?? 'À renseigner'),
                      ),
                      const SizedBox(width: 8),
                      if (_savingTheme)
                        const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      else
                        const Tooltip(
                          message: 'Modifier le thème',
                          child: Icon(
                            Icons.edit_outlined,
                            size: 19,
                            color: AppColors.middenblauw,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _contextLine(IconData icon, String label, String value) => Padding(
        padding: const EdgeInsets.only(top: 5),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 17, color: AppColors.middenblauw),
            const SizedBox(width: 8),
            Text('$label : ',
                style: const TextStyle(fontWeight: FontWeight.w700)),
            Expanded(child: Text(value)),
          ],
        ),
      );

  Widget _memberCard(FormationTaskRosterMember member) {
    final identity = _identities[member.memberId];
    final name = identity?.name ?? member.displayName;
    final activity =
        _activities[member.memberId] ?? RosterActivitySummary.unknown;
    return MonitorObservationRosterMemberCard(
      memberId: member.memberId,
      name: name,
      level: identity?.level ?? 'Niveau membre non renseigné',
      photoUrl: identity?.photoUrl,
      taskCount: member.tasks.length,
      activityLabel: activity.activityLabel,
      attendanceLabel: activity.attendanceLabel,
      isPresent: activity.isPresent,
      selectedPresence: _presence[member.memberId],
      onPresenceChanged: (present) => setState(() {
        _presence[member.memberId] = present;
        if (!present) _verdicts[member.memberId] = null;
      }),
      selectedVerdict: _verdicts[member.memberId],
      onVerdictChanged: (value) => setState(() {
        _verdicts[member.memberId] = value;
      }),
      hasComment: _comments[member.memberId]!.text.trim().isNotEmpty,
      onComment: () => _editComment(member, name),
    );
  }

  Widget _batchControls() {
    Widget button(String verdict, String label, Color color) => Tooltip(
          message: 'Appliquer $label uniquement aux membres sans verdict',
          child: OutlinedButton(
            key: ValueKey('batch-$verdict'),
            onPressed: () => _applyBatchVerdict(verdict),
            style: OutlinedButton.styleFrom(
              foregroundColor: color,
              minimumSize: const Size(44, 44),
              padding: const EdgeInsets.symmetric(horizontal: 13),
            ),
            child: Text(label),
          ),
        );
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 11),
        child: Row(
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Appliquer aux non évalués',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  Text(
                    'Les choix individuels sont conservés',
                    style: TextStyle(fontSize: 11, color: Colors.grey),
                  ),
                ],
              ),
            ),
            button('acquis', 'A', const Color(0xFF16A34A)),
            const SizedBox(width: 5),
            button('en_progres', 'P', const Color(0xFFF59E0B)),
            const SizedBox(width: 5),
            button('a_revoir', 'R', const Color(0xFFE5484D)),
          ],
        ),
      ),
    );
  }

  String _readableGroup(String value) {
    if (value.isEmpty) return 'Non renseigné';
    return value
        .replaceAll('star', '★')
        .replaceAll('_groupe', ' · Groupe ')
        .replaceAll('_', ' ');
  }
}

class _RosterMemberIdentity {
  final String name;
  final String? photoUrl;
  final String? level;

  const _RosterMemberIdentity({
    required this.name,
    this.photoUrl,
    this.level,
  });

  factory _RosterMemberIdentity.fromMap(
    String memberId,
    Map<String, dynamic> data,
  ) {
    final photo = (data['photo_url'] ?? data['photoUrl'])?.toString().trim();
    final level =
        (data['plongeur_niveau'] ?? data['plongeur_code'])?.toString().trim();
    return _RosterMemberIdentity(
      name: memberDisplayName(
        data,
        fallback: 'Nom manquant · $memberId',
      ),
      photoUrl: photo?.isEmpty == true ? null : photo,
      level: level?.isEmpty == true ? null : level,
    );
  }
}

class _RosterSessionContext {
  final String poolName;
  final DateTime? date;

  const _RosterSessionContext({
    required this.poolName,
    this.date,
  });

  factory _RosterSessionContext.fromMap(
    String sessionId,
    Map<String, dynamic> data,
  ) {
    final dateValue = data['date'];
    return _RosterSessionContext(
      poolName: (data['pool_name'] ??
              data['lieu'] ??
              data['location_name'] ??
              'Piscine non renseignée')
          .toString(),
      date:
          dateValue is Timestamp ? dateValue.toDate() : _parseDateId(sessionId),
    );
  }

  String get dateLabel => date == null
      ? 'Date non renseignée'
      : '${date!.day.toString().padLeft(2, '0')}/'
          '${date!.month.toString().padLeft(2, '0')}/${date!.year}';

  static String dateFromId(String id) {
    final date = _parseDateId(id);
    if (date == null) return id.isEmpty ? 'Date non renseignée' : id;
    return '${date.day.toString().padLeft(2, '0')}/'
        '${date.month.toString().padLeft(2, '0')}/${date.year}';
  }

  static DateTime? _parseDateId(String id) {
    final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(id);
    if (match == null) return null;
    return DateTime(
      int.parse(match.group(1)!),
      int.parse(match.group(2)!),
      int.parse(match.group(3)!),
    );
  }
}
