import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/formation_task.dart';
import '../../models/formation_task_roster.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/formation_task_navigation_service.dart';
import '../../services/formation_task_service.dart';
import '../../utils/permission_helper.dart';
import '../../utils/roster_session_label.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'historical_qr_scan_screen.dart';
import 'logbook_dive_confirmation_screen.dart';
import 'monitor_observation_roster_screen.dart';

/// Durable action data shown in [ActionsEvaluationsScreen].
///
/// The screen deliberately reads the domain collections directly. Push delivery
/// and notification history are only signals; neither is the source of truth.
class PendingLogbookConfirmation {
  final String id;
  final String sourceMemberName;
  final String locationName;
  final String matchType;
  final DateTime? createdAt;

  const PendingLogbookConfirmation({
    required this.id,
    required this.sourceMemberName,
    required this.locationName,
    required this.matchType,
    this.createdAt,
  });

  factory PendingLogbookConfirmation.fromFirestore(
    QueryDocumentSnapshot<Map<String, dynamic>> document,
  ) {
    final data = document.data();
    final dive = Map<String, dynamic>.from(
      (data['dive_snapshot'] as Map?) ?? const {},
    );
    final createdAt = data['created_at'];
    return PendingLogbookConfirmation(
      id: document.id,
      sourceMemberName:
          (data['source_member_name'] as String?)?.trim().isNotEmpty == true
              ? (data['source_member_name'] as String).trim()
              : 'Un membre',
      locationName:
          (dive['location_name'] as String?)?.trim().isNotEmpty == true
              ? (dive['location_name'] as String).trim()
              : 'Plongée',
      matchType: data['match_type'] as String? ?? 'none',
      createdAt: createdAt is Timestamp ? createdAt.toDate() : null,
    );
  }

  bool matches(String query) => _matchesSearch(query, [
        sourceMemberName,
        locationName,
        'Carnet',
        'plongée',
        'confirmer',
        'importer',
        'ignorer',
      ]);
}

class ActionsEvaluationsScreen extends StatefulWidget {
  final bool previewMode;
  final List<PendingLogbookConfirmation> previewConfirmations;
  final List<FormationTask> previewTasks;
  final List<String> previewClubStatuten;
  final String? previewPlongeurCode;
  final ValueChanged<PendingLogbookConfirmation>? onOpenConfirmation;
  final ValueChanged<FormationTask>? onOpenTask;
  final VoidCallback? onOpenHistoricalQr;

  const ActionsEvaluationsScreen({
    super.key,
    this.previewMode = false,
    this.previewConfirmations = const [],
    this.previewTasks = const [],
    this.previewClubStatuten = const [],
    this.previewPlongeurCode,
    this.onOpenConfirmation,
    this.onOpenTask,
    this.onOpenHistoricalQr,
  });

  @override
  State<ActionsEvaluationsScreen> createState() =>
      _ActionsEvaluationsScreenState();
}

class _ActionsEvaluationsScreenState extends State<ActionsEvaluationsScreen> {
  FormationTaskService? _taskService;
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: OceanGradientBackground(
        creatures: CreatureSet.fishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _Header(
                controller: _searchController,
                onSearchChanged: (value) =>
                    setState(() => _searchQuery = value),
              ),
              Expanded(child: _buildBody(context)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (widget.previewMode) {
      return _buildContent(
        context,
        confirmations: widget.previewConfirmations,
        tasks: widget.previewTasks,
        canScanHistoricalQr: PermissionHelper.canValidateLifras(
          clubStatuten: widget.previewClubStatuten,
          plongeurCode: widget.previewPlongeurCode,
        ),
      );
    }

    final userId = context.watch<AuthProvider>().currentUser?.uid;
    if (userId == null) {
      return const _StateMessage(
        icon: Icons.lock_outline,
        title: 'Connexion requise',
        body: 'Reconnectez-vous pour retrouver vos actions.',
      );
    }

    final member = context.watch<MemberProvider>();
    final canScanHistoricalQr = PermissionHelper.canValidateLifras(
      clubStatuten: member.clubStatuten,
      plongeurCode: member.plongeurCode,
    );

    final confirmations = FirebaseFirestore.instance
        .collection('clubs')
        .doc(FirebaseConfig.defaultClubId)
        .collection('logbook_dive_confirmations')
        .where('target_member_id', isEqualTo: userId)
        .where('status', isEqualTo: 'pending')
        .snapshots();

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: confirmations,
      builder: (context, confirmationSnapshot) {
        if (confirmationSnapshot.hasError) {
          return const _StateMessage(
            icon: Icons.sync_problem,
            title: 'Actions temporairement indisponibles',
            body: 'Les confirmations n’ont pas pu être synchronisées.',
          );
        }
        return StreamBuilder<List<FormationTask>>(
          stream: (_taskService ??= FormationTaskService()).streamUserInbox(
            FirebaseConfig.defaultClubId,
            userId,
          ),
          builder: (context, taskSnapshot) {
            if (taskSnapshot.hasError) {
              return const _StateMessage(
                icon: Icons.sync_problem,
                title: 'Actions temporairement indisponibles',
                body: 'Les évaluations n’ont pas pu être synchronisées.',
              );
            }
            if (!confirmationSnapshot.hasData || !taskSnapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final pending = confirmationSnapshot.data!.docs
                .map(PendingLogbookConfirmation.fromFirestore)
                .toList(growable: false);
            return _buildContent(
              context,
              confirmations: pending,
              tasks: taskSnapshot.data!,
              canScanHistoricalQr: canScanHistoricalQr,
            );
          },
        );
      },
    );
  }

  Widget _buildContent(
    BuildContext context, {
    required List<PendingLogbookConfirmation> confirmations,
    required List<FormationTask> tasks,
    required bool canScanHistoricalQr,
  }) {
    final visibleConfirmations = confirmations
        .where((confirmation) => confirmation.matches(_searchQuery))
        .toList()
      ..sort((a, b) => _compareNewest(a.createdAt, b.createdAt));
    final relevantTasks = tasks
        .where((task) => task.belongsInActionsEvaluations && !task.isClosed)
        .toList(growable: false);
    final standaloneTasks = relevantTasks
        .where(
          (task) =>
              task.type != FormationTaskType.monitorObservation &&
              _taskMatchesSearch(task, _searchQuery),
        )
        .toList(growable: false);
    final rosters = FormationTaskRoster.aggregate(relevantTasks)
        .where((roster) => _rosterMatchesSearch(roster, _searchQuery))
        .toList(growable: false);
    final showHistoricalQr = canScanHistoricalQr &&
        _matchesSearch(_searchQuery, const [
          'Scanner une carte papier',
          'Validation',
          'Contrôler une ancienne carte d’élève',
          'QR',
        ]);

    if (visibleConfirmations.isEmpty &&
        standaloneTasks.isEmpty &&
        rosters.isEmpty &&
        !showHistoricalQr) {
      return _StateMessage(
        icon: _searchQuery.trim().isEmpty
            ? Icons.task_alt
            : Icons.search_off_rounded,
        title:
            _searchQuery.trim().isEmpty ? 'Tout est à jour' : 'Aucun résultat',
        body: _searchQuery.trim().isEmpty
            ? 'Aucune action ou évaluation n’attend votre intervention.'
            : 'Essayez un autre terme de recherche.',
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        if (visibleConfirmations.isNotEmpty) ...[
          const _SectionTitle(
            icon: Icons.scuba_diving_outlined,
            title: 'Plongées à confirmer',
          ),
          const SizedBox(height: 8),
          for (final confirmation in visibleConfirmations)
            _ConfirmationCard(
              confirmation: confirmation,
              onTap: () => _openConfirmation(context, confirmation),
            ),
          const SizedBox(height: 14),
        ],
        if (showHistoricalQr) ...[
          const _SectionTitle(
            icon: Icons.qr_code_scanner,
            title: 'Outils de validation',
          ),
          const SizedBox(height: 8),
          _HistoricalQrScanCard(
            onTap: () => _openHistoricalQr(context),
          ),
          if (standaloneTasks.isNotEmpty || rosters.isNotEmpty)
            const SizedBox(height: 14),
        ],
        if (standaloneTasks.isNotEmpty || rosters.isNotEmpty) ...[
          const _SectionTitle(
            icon: Icons.fact_check_outlined,
            title: 'Carnet, piscine & évaluations',
          ),
          const SizedBox(height: 8),
          for (final task in standaloneTasks)
            _TaskCard(task: task, onTap: () => _openTask(context, task)),
          for (final roster in rosters)
            roster.key.startsWith('legacy::')
                ? _TaskCard(
                    task: roster.members.single.primaryTask,
                    onTap: () =>
                        _openTask(context, roster.members.single.primaryTask),
                  )
                : _RosterCard(roster: roster),
        ],
      ],
    );
  }

  void _openConfirmation(
    BuildContext context,
    PendingLogbookConfirmation confirmation,
  ) {
    final callback = widget.onOpenConfirmation;
    if (callback != null) return callback(confirmation);
    if (widget.previewMode) return;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            LogbookDiveConfirmationScreen(confirmationId: confirmation.id),
      ),
    );
  }

  void _openTask(BuildContext context, FormationTask task) {
    final callback = widget.onOpenTask;
    if (callback != null) return callback(task);
    if (widget.previewMode) return;
    openFormationTask(context, task);
  }

  void _openHistoricalQr(BuildContext context) {
    final callback = widget.onOpenHistoricalQr;
    if (callback != null) return callback();
    if (widget.previewMode) return;
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const HistoricalQrScanScreen()),
    );
  }
}

class _Header extends StatelessWidget {
  final TextEditingController controller;
  final ValueChanged<String> onSearchChanged;

  const _Header({required this.controller, required this.onSearchChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 14),
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
                tooltip: 'Retour',
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.arrow_back, color: Colors.white),
              ),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Actions & évaluations',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 23,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Vos tâches actives, conservées dans le carnet',
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
          TextField(
            controller: controller,
            onChanged: onSearchChanged,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.95),
              prefixIcon: const Icon(Icons.search, size: 20),
              hintText: 'Rechercher une action ou une personne',
              isDense: true,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(999),
                borderSide: BorderSide.none,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final IconData icon;
  final String title;

  const _SectionTitle({required this.icon, required this.title});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: Colors.white, size: 20),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }
}

class _ConfirmationCard extends StatelessWidget {
  final PendingLogbookConfirmation confirmation;
  final VoidCallback onTap;

  const _ConfirmationCard({required this.confirmation, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final icon = switch (confirmation.matchType) {
      'identical' => Icons.verified_outlined,
      'similar' => Icons.compare_arrows,
      _ => Icons.scuba_diving_outlined,
    };
    return _ActionCard(
      icon: icon,
      iconColor: const Color(0xFF7C3AED),
      title: 'Plongée avec ${confirmation.sourceMemberName}',
      subtitle: '${confirmation.locationName} · confirmer, importer ou ignorer',
      label: 'Carnet',
      date: confirmation.createdAt,
      onTap: onTap,
    );
  }
}

class _TaskCard extends StatelessWidget {
  final FormationTask task;
  final VoidCallback onTap;

  const _TaskCard({required this.task, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final detail = <String>[
      if (task.context.targetGroupLevel?.trim().isNotEmpty == true)
        task.context.targetGroupLevel!.trim(),
      if (task.context.operationTitle?.trim().isNotEmpty == true)
        task.context.operationTitle!.trim(),
      if (task.description?.trim().isNotEmpty == true) task.description!.trim(),
      _statusLabel(task.status),
    ].join(' · ');
    return _ActionCard(
      text: task.glyph,
      iconColor: _taskColor(task),
      title: task.title,
      subtitle: detail,
      label: task.typeLabel,
      date: task.updatedAt ?? task.createdAt,
      onTap: onTap,
    );
  }
}

class _HistoricalQrScanCard extends StatelessWidget {
  final VoidCallback onTap;

  const _HistoricalQrScanCard({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return _ActionCard(
      icon: Icons.qr_code_scanner,
      iconColor: const Color(0xFF7C3AED),
      title: 'Scanner une carte papier',
      subtitle: 'Contrôler une ancienne carte d’élève',
      label: 'Validation',
      date: null,
      onTap: onTap,
    );
  }
}

class _RosterCard extends StatefulWidget {
  final FormationTaskRoster roster;

  const _RosterCard({required this.roster});

  @override
  State<_RosterCard> createState() => _RosterCardState();
}

class _RosterCardState extends State<_RosterCard> {
  String _sessionLabel = unknownRosterSessionDateLabel;

  @override
  void initState() {
    super.initState();
    _loadSessionLabel();
  }

  Future<void> _loadSessionLabel() async {
    final sessionId = widget.roster.sessionId.trim();
    if (sessionId.isEmpty) return;
    try {
      final session = await FirebaseFirestore.instance
          .collection('clubs')
          .doc(FirebaseConfig.defaultClubId)
          .collection('piscine_sessions')
          .doc(sessionId)
          .get();
      if (!mounted || !session.exists) return;
      final rawDate = session.data()?['date'];
      setState(() {
        _sessionLabel = formatRosterSessionLabel(
          rawDate is Timestamp ? rawDate.toDate() : null,
        );
      });
    } catch (_) {
      // Keep a neutral label; never expose a technical document id.
    }
  }

  @override
  Widget build(BuildContext context) {
    final roster = widget.roster;
    final level = roster.level?.trim();
    final title = level == null || level.isEmpty
        ? 'Évaluer le groupe'
        : 'Évaluer le groupe $level';
    final details = <String>[
      _sessionLabel,
      if (level != null && level.isNotEmpty) 'Niveau $level',
      '${roster.members.length} élève(s)',
    ].join(' · ');
    return _ActionCard(
      icon: Icons.groups_2_outlined,
      iconColor: const Color(0xFF047857),
      title: title,
      subtitle: details,
      label: 'Évaluation groupée',
      date: _latestRosterDate(roster),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => MonitorObservationRosterScreen(roster: roster),
        ),
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  final IconData? icon;
  final String? text;
  final Color iconColor;
  final String title;
  final String subtitle;
  final String label;
  final DateTime? date;
  final VoidCallback onTap;

  const _ActionCard({
    this.icon,
    this.text,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.label,
    required this.date,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: iconColor.withValues(alpha: 0.14),
                  child: icon != null
                      ? Icon(icon, color: iconColor)
                      : Text(
                          text ?? '',
                          style: TextStyle(
                            color: iconColor,
                            fontWeight: FontWeight.w900,
                            fontSize: 17,
                          ),
                        ),
                ),
                const SizedBox(width: 13),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: AppColors.donkerblauw,
                                fontWeight: FontWeight.w800,
                                fontSize: 15.5,
                              ),
                            ),
                          ),
                          if (date != null)
                            Text(
                              _shortDate(date!),
                              style: const TextStyle(
                                color: Color(0xFF64748B),
                                fontSize: 11.5,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(
                        subtitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFF5F6B7A),
                          fontSize: 13,
                          height: 1.25,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: iconColor.withValues(alpha: 0.10),
                          borderRadius: BorderRadius.circular(99),
                        ),
                        child: Text(
                          label,
                          style: TextStyle(
                            color: iconColor,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                const Icon(Icons.chevron_right, color: Color(0xFF64748B)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StateMessage extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;

  const _StateMessage({
    required this.icon,
    required this.title,
    required this.body,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: Colors.white),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              body,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Color(0xD9FFFFFF), height: 1.35),
            ),
          ],
        ),
      ),
    );
  }
}

int _compareNewest(DateTime? a, DateTime? b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b.compareTo(a);
}

DateTime? _latestRosterDate(FormationTaskRoster roster) {
  DateTime? latest;
  for (final task in roster.members.expand((member) => member.tasks)) {
    final value = task.updatedAt ?? task.createdAt;
    if (value != null && (latest == null || value.isAfter(latest))) {
      latest = value;
    }
  }
  return latest;
}

String _shortDate(DateTime value) {
  final now = DateTime.now();
  if (now.year == value.year &&
      now.month == value.month &&
      now.day == value.day) {
    return '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
  }
  return '${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}';
}

String _statusLabel(FormationTaskStatus status) => switch (status) {
      FormationTaskStatus.snoozed => 'Reportée',
      FormationTaskStatus.waitingForOther => 'En attente',
      FormationTaskStatus.blocked => 'Bloquée',
      _ => 'À traiter',
    };

Color _taskColor(FormationTask task) => switch (task.type) {
      FormationTaskType.poolCheckin ||
      FormationTaskType.logbookCompletion =>
        AppColors.middenblauw,
      FormationTaskType.historicalValidation => const Color(0xFF7C3AED),
      FormationTaskType.claimRejected => const Color(0xFFC2410C),
      _ => const Color(0xFF047857),
    };

bool _taskMatchesSearch(FormationTask task, String query) =>
    _matchesSearch(query, [
      task.title,
      task.description,
      task.typeLabel,
      task.memberName,
      task.currentAssigneeName,
      task.context.operationTitle,
      task.context.targetGroupLevel,
    ]);

bool _rosterMatchesSearch(FormationTaskRoster roster, String query) =>
    _matchesSearch(query, [
      'Évaluer le groupe',
      'Évaluation groupée',
      roster.level,
      roster.theme,
      ...roster.members.map((member) => member.displayName),
    ]);

bool _matchesSearch(String query, Iterable<String?> values) {
  final needle = _normalize(query);
  if (needle.isEmpty) return true;
  return values
      .where((value) => value?.trim().isNotEmpty == true)
      .map((value) => _normalize(value!))
      .any((value) => value.contains(needle));
}

String _normalize(String value) => value
    .trim()
    .toLowerCase()
    .replaceAll(RegExp(r'[àáâãäå]'), 'a')
    .replaceAll('ç', 'c')
    .replaceAll(RegExp(r'[èéêë]'), 'e')
    .replaceAll(RegExp(r'[ìíîï]'), 'i')
    .replaceAll(RegExp(r'[òóôõö]'), 'o')
    .replaceAll(RegExp(r'[ùúûü]'), 'u')
    .replaceAll(RegExp(r'\s+'), ' ');
