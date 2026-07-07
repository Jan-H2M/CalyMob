/// Pool check-in screen — v4 (2026-07-07), per-hour redesign.
///
/// UNIFORM fiche for every attendee (student AND encadrant). The evening is
/// split into the two pool hours (1ère heure / 2ème heure, mirroring the
/// CalyCompta planning board). Per hour the member picks :
///
///   Formation | Service | Nage libre | Absent
///
///   - Formation, role=='encadrant' → sub-choice « J'ai encadré » /
///     « J'ai suivi le cours » (recyclage). Encadré shows the groups
///     pre-filled from the planning for THAT hour, plus « Ajouter un
///     groupe » : another planned course (one tap, keeps course_id) or a
///     free level+group pick (hors planning, course_id null — matched
///     server-side on level+group_number+heure, see onPoolCheckinCompleted).
///   - Formation, student (or encadrant « suivi ») → level + group number.
///   - Service → single-select detail : accueil | baptemes | gonflage |
///     securite | autre (+ required free text for autre).
///
/// A « Réinitialiser » button restores the initial state (incl. planning
/// pre-fill) without confirmation.
///
/// completion_data (v4) :
///   {
///     outcome: 'encadrant'|'training'|'service_only'|'nage_libre', // derived
///     hours: {
///       '1ere_heure': { activity, role?, groups?|group?, service?,
///                       service_other? },
///       '2eme_heure': { ... },
///     },
///     workedOn?, personalNotes?,
///     // legacy mirrors for outcome=='training' (level/groupNumber/groupKey)
///   }
///
/// Derivation : ≥1 hour encadré → 'encadrant' ; else ≥1 formation →
/// 'training' ; else ≥1 service → 'service_only' ; else 'nage_libre'.
///
/// previewMode never touches Firestore : submit shows the completion_data
/// that would be written, then pops.
///
/// Spec: design-partner sessie 2026-07-07 (v4 vergrendeld) — supersedes the
/// v2.2 single-outcome flow of `_carnet_plan.md` §3.1.3.

import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/formation_task.dart';
import '../../providers/auth_provider.dart';
import '../../services/formation_task_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class PoolCheckinScreen extends StatefulWidget {
  final FormationTask task;

  /// Dev preview: when true the screen never touches Firestore. Submit shows
  /// the `completion_data` that *would* be written, then pops.
  final bool previewMode;

  const PoolCheckinScreen({
    super.key,
    required this.task,
    this.previewMode = false,
  });

  @override
  State<PoolCheckinScreen> createState() => _PoolCheckinScreenState();
}

enum _HourActivity { formation, service, nageLibre, absent }

enum _FormationMode { encadre, suivi }

const List<String> _kLevels = ['1*', '2*', '3*', '4*', 'AM'];

const List<(String, String)> _kServices = [
  ('Accueil', 'accueil'),
  ('Baptêmes', 'baptemes'),
  ('Gonflage', 'gonflage'),
  ('Sécurité', 'securite'),
  ('Autre', 'autre'),
];

String _activityKey(_HourActivity a) => switch (a) {
      _HourActivity.formation => 'formation',
      _HourActivity.service => 'service',
      _HourActivity.nageLibre => 'nage_libre',
      _HourActivity.absent => 'absent',
    };

/// One group line in the encadré section — seeded from the planning,
/// re-added from another planned course, or entered manually.
class _EncGroup {
  final String? level;
  final int? groupNumber;
  final String? theme;
  final String? courseId; // null ⇒ hors planning
  final String source; // 'planning' | 'planning_other' | 'manual'
  bool confirmed;

  _EncGroup({
    required this.level,
    required this.groupNumber,
    required this.theme,
    required this.courseId,
    required this.source,
    this.confirmed = true,
  });

  _EncGroup clone() => _EncGroup(
        level: level,
        groupNumber: groupNumber,
        theme: theme,
        courseId: courseId,
        source: source,
        confirmed: confirmed,
      );

  Map<String, dynamic> toMap() => {
        if (level != null) 'level': level,
        if (groupNumber != null) 'group_number': groupNumber,
        if (theme != null) 'theme': theme,
        'course_id': courseId,
        'source': source,
      };

  String get displayLabel {
    final lvl = level != null ? 'Formation $level' : 'Groupe';
    final grp = groupNumber != null ? ' — Groupe $groupNumber' : '';
    final th = (theme != null && theme!.trim().isNotEmpty)
        ? ' · ${theme!.trim()}'
        : '';
    return '$lvl$grp$th';
  }
}

/// Mutable UI state for one pool hour.
class _HourState {
  final String key; // '1ere_heure' | '2eme_heure'
  final String label;

  _HourActivity? activity;
  _FormationMode? mode; // encadrant only
  String? service;
  final TextEditingController serviceOther = TextEditingController();

  /// Encadré groups for this hour (pre-filled from the planning snapshot).
  final List<_EncGroup> groups = [];

  bool pickerOpen = false;
  String? pickLevel;
  int pickGroupNumber = 1;

  /// Élève / suivi path.
  String? elLevel;
  int elGroupNumber = 1;

  _HourState({required this.key, required this.label});

  void dispose() => serviceOther.dispose();
}

class _PoolCheckinScreenState extends State<PoolCheckinScreen> {
  final FormationTaskService _taskService = FormationTaskService();

  bool get _isEncadrant => widget.task.context.isEncadrant;

  late List<_HourState> _hours;

  /// Planned Formation courses per hour (from the session doc) so an
  /// encadrant can re-assign himself with one tap.
  Map<String, List<_EncGroup>> _plannedByHour = {};

  final TextEditingController _notes = TextEditingController();
  final TextEditingController _workedOn = TextEditingController();
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _hours = _freshHours();
    if (_isEncadrant) _loadPlannedCourses();
  }

  List<_HourState> _freshHours() {
    final hours = [
      _HourState(key: '1ere_heure', label: '1ère heure'),
      _HourState(key: '2eme_heure', label: '2ème heure'),
    ];
    // Student / suivi pre-fill: suggested level from the task.
    final suggested =
        _parseLevelFromTarget(widget.task.context.targetGroupLevel);
    for (final h in hours) {
      h.elLevel = suggested;
    }
    // Encadrant pre-fill: distribute the planning snapshot over the hours
    // (legacy entries without heure land in the first hour).
    if (_isEncadrant) {
      for (final g in widget.task.context.encadrantGroups) {
        final target = hours.firstWhere(
          (h) => h.key == (g.heure ?? '1ere_heure'),
          orElse: () => hours.first,
        );
        target.groups.add(_EncGroup(
          level: g.level,
          groupNumber: g.groupNumber,
          theme: g.theme,
          courseId: g.courseId,
          source: 'planning',
        ));
      }
    }
    return hours;
  }

  void _resetAll() {
    setState(() {
      for (final h in _hours) {
        h.dispose();
      }
      _hours = _freshHours();
      _notes.clear();
      _workedOn.clear();
    });
  }

  String? _parseLevelFromTarget(String? raw) {
    if (raw == null) return null;
    final m = RegExp(r'(\d\*|AM)').firstMatch(raw);
    return m?.group(1);
  }

  /// Load the Formation courses planned tonight, grouped by hour. In
  /// previewMode a synthetic list is used.
  Future<void> _loadPlannedCourses() async {
    if (widget.previewMode) {
      setState(() {
        _plannedByHour = {
          '1ere_heure': [
            _EncGroup(
              level: '1*',
              groupNumber: 1,
              theme: 'Vidage de masque',
              courseId: '1star_1ere_heure_0',
              source: 'planning_other',
            ),
          ],
          '2eme_heure': [
            _EncGroup(
              level: '3*',
              groupNumber: 1,
              theme: null,
              courseId: '3star_2eme_heure_0',
              source: 'planning_other',
            ),
          ],
        };
      });
      return;
    }
    final sessionId = widget.task.context.poolSessionId;
    if (sessionId == null) return;
    try {
      final snap = await FirebaseFirestore.instance
          .collection('clubs')
          .doc(FirebaseConfig.defaultClubId)
          .collection('piscine_sessions')
          .doc(sessionId)
          .get();
      final data = snap.data();
      if (data == null) return;
      final byHour = <String, List<_EncGroup>>{};
      final niveaux = (data['niveaux'] as Map<String, dynamic>?) ?? const {};
      niveaux.forEach((level, rawAssignment) {
        if (rawAssignment is! Map<String, dynamic>) return;
        final cbh = (rawAssignment['courses_by_hour'] ??
            rawAssignment['coursesByHour']) as Map<String, dynamic>?;
        if (cbh == null) return;
        cbh.forEach((heure, rawCourses) {
          if (rawCourses is! List) return;
          for (var i = 0; i < rawCourses.length; i++) {
            final course = rawCourses[i];
            if (course is! Map<String, dynamic>) continue;
            final order = course['order'];
            byHour.putIfAbsent(heure, () => []).add(_EncGroup(
                  level: level,
                  groupNumber:
                      order is num ? order.toInt() + 1 : i + 1,
                  theme: course['theme'] as String?,
                  courseId:
                      (course['id'] as String?) ?? '${level}_${heure}_$i',
                  source: 'planning_other',
                ));
          }
        });
      });
      if (!mounted) return;
      setState(() => _plannedByHour = byHour);
    } catch (_) {
      // Non-blocking: the free picker still covers every case.
    }
  }

  @override
  void dispose() {
    for (final h in _hours) {
      h.dispose();
    }
    _notes.dispose();
    _workedOn.dispose();
    super.dispose();
  }

  bool get _anyEncadre => _hours.any((h) =>
      h.activity == _HourActivity.formation &&
      _isEncadrant &&
      h.mode == _FormationMode.encadre);

  bool _hourComplete(_HourState h) {
    switch (h.activity) {
      case null:
        return false;
      case _HourActivity.service:
        if (h.service == null) return false;
        if (h.service == 'autre' && h.serviceOther.text.trim().isEmpty) {
          return false;
        }
        return true;
      case _HourActivity.formation:
        if (_isEncadrant) {
          if (h.mode == null) return false;
          return h.mode == _FormationMode.encadre
              ? h.groups.any((g) => g.confirmed)
              : h.elLevel != null;
        }
        return h.elLevel != null;
      case _HourActivity.nageLibre:
      case _HourActivity.absent:
        return true;
    }
  }

  bool get _canSubmit => !_submitting && _hours.every(_hourComplete);

  String _groupKeyFor(String level, int groupNumber) =>
      '${level.replaceAll('*', 'star')}_groupe$groupNumber';

  Map<String, dynamic> _buildCompletionData() {
    var anyEnc = false;
    var anyTrain = false;
    var anyService = false;
    Map<String, dynamic>? firstTrainingGroup;

    final hoursOut = <String, dynamic>{};
    for (final h in _hours) {
      final activity = h.activity!;
      final e = <String, dynamic>{'activity': _activityKey(activity)};
      switch (activity) {
        case _HourActivity.service:
          anyService = true;
          e['service'] = h.service;
          if (h.service == 'autre' && h.serviceOther.text.trim().isNotEmpty) {
            e['service_other'] = h.serviceOther.text.trim();
          }
        case _HourActivity.formation:
          if (_isEncadrant && h.mode == _FormationMode.encadre) {
            anyEnc = true;
            e['role'] = 'encadrant';
            e['groups'] = [
              for (final g in h.groups)
                if (g.confirmed) g.toMap(),
            ];
          } else {
            anyTrain = true;
            e['role'] = 'eleve';
            final group = <String, dynamic>{
              'level': h.elLevel,
              'groupNumber': h.elGroupNumber,
              'groupKey': _groupKeyFor(h.elLevel!, h.elGroupNumber),
            };
            e['group'] = group;
            firstTrainingGroup ??= group;
          }
        case _HourActivity.nageLibre:
        case _HourActivity.absent:
          break;
      }
      hoursOut[h.key] = e;
    }

    final outcome = anyEnc
        ? 'encadrant'
        : anyTrain
            ? 'training'
            : anyService
                ? 'service_only'
                : 'nage_libre';

    return <String, dynamic>{
      'outcome': outcome,
      'hours': hoursOut,
      // Legacy mirrors so an older onPoolCheckinCompleted deploy keeps
      // resolving the student's group. Harmless once the v4 CF is live.
      if (outcome == 'training' && firstTrainingGroup != null) ...{
        'level': firstTrainingGroup['level'],
        'groupNumber': firstTrainingGroup['groupNumber'],
        'groupKey': firstTrainingGroup['groupKey'],
      },
      if (_anyEncadre && _workedOn.text.trim().isNotEmpty)
        'workedOn': _workedOn.text.trim(),
      if (_notes.text.trim().isNotEmpty) 'personalNotes': _notes.text.trim(),
    };
  }

  Future<void> _submit() async {
    if (!_canSubmit) return;

    final completionData = _buildCompletionData();

    // Dev preview: show what would be saved, don't touch Firestore.
    if (widget.previewMode) {
      await _showPreviewResult(completionData);
      if (mounted) Navigator.pop(context);
      return;
    }

    final userId = context.read<AuthProvider>().currentUser?.uid;
    if (userId == null) return;
    setState(() => _submitting = true);

    try {
      await _taskService.markDone(
        FirebaseConfig.defaultClubId,
        widget.task.id,
        userId,
        completionData: completionData,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text(
            'Piscine confirmée — merci !',
            style: TextStyle(color: Colors.white),
          ),
          backgroundColor: Colors.green.shade700,
          behavior: SnackBarBehavior.floating,
        ),
      );
      Navigator.pop(context);
    } catch (err) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "L'enregistrement a échoué : $err",
            style: const TextStyle(color: Colors.white),
          ),
          backgroundColor: Colors.red.shade700,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 6),
        ),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// Dev preview: render the completion_data that would be persisted.
  Future<void> _showPreviewResult(Map<String, dynamic> data) async {
    const encoder = JsonEncoder.withIndent('  ');
    String pretty;
    try {
      pretty = encoder.convert(data);
    } catch (_) {
      pretty = data.toString();
    }
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Aperçu — completion_data'),
        content: SingleChildScrollView(
          child: Text(
            pretty,
            style: const TextStyle(fontFamily: 'monospace', fontSize: 12.5),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  Future<void> _dismiss() async {
    if (widget.previewMode) {
      Navigator.pop(context);
      return;
    }
    final userId = context.read<AuthProvider>().currentUser?.uid;
    if (userId == null) return;
    setState(() => _submitting = true);
    try {
      await _taskService.dismiss(
        FirebaseConfig.defaultClubId,
        widget.task.id,
        userId,
      );
      if (!mounted) return;
      Navigator.pop(context);
    } catch (_) {
      // toast handled in service or above
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final keyboardInset = MediaQuery.viewInsetsOf(context).bottom;

    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _Header(task: widget.task),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                  children: [
                    _ContextCard(task: widget.task, onReset: _resetAll),
                    const SizedBox(height: 14),
                    for (final h in _hours) ...[
                      _buildHourCard(h),
                      const SizedBox(height: 14),
                    ],
                    if (_anyEncadre) ...[
                      _WorkedOnSection(controller: _workedOn),
                      const SizedBox(height: 14),
                    ],
                    _NotesSection(controller: _notes),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: AnimatedPadding(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        padding: EdgeInsets.only(bottom: keyboardInset),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _canSubmit ? _submit : null,
                    icon: _submitting
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.donkerblauw,
                            ),
                          )
                        : const Icon(Icons.send),
                    label: Text(
                      _submitting ? 'Envoi…' : 'Confirmer ma piscine',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.lichtblauw,
                      foregroundColor: AppColors.donkerblauw,
                      disabledBackgroundColor:
                          AppColors.lichtblauw.withValues(alpha: 0.40),
                      disabledForegroundColor:
                          AppColors.donkerblauw.withValues(alpha: 0.45),
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(vertical: 15),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                TextButton(
                  onPressed: _submitting ? null : _dismiss,
                  child: const Text(
                    'Pas concerné',
                    style: TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ---- Hour card -----------------------------------------------------------

  Widget _buildHourCard(_HourState h) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionTitle(h.label),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _SegChoice(
                  icon: Icons.school,
                  label: 'Formation',
                  active: h.activity == _HourActivity.formation,
                  onTap: () => _setActivity(h, _HourActivity.formation),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _SegChoice(
                  icon: Icons.handshake_outlined,
                  label: 'Service',
                  active: h.activity == _HourActivity.service,
                  onTap: () => _setActivity(h, _HourActivity.service),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _SegChoice(
                  icon: Icons.waves,
                  label: 'Nage libre',
                  active: h.activity == _HourActivity.nageLibre,
                  onTap: () => _setActivity(h, _HourActivity.nageLibre),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _SegChoice(
                  icon: Icons.remove,
                  label: 'Absent',
                  active: h.activity == _HourActivity.absent,
                  onTap: () => _setActivity(h, _HourActivity.absent),
                ),
              ),
            ],
          ),
          if (h.activity == _HourActivity.service) ...[
            const _SectionDivider(),
            Text(
              'Qu\'as-tu fait exactement ?',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.75),
                fontSize: 12.5,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final (label, key) in _kServices)
                  _ChipChoice(
                    label: label,
                    active: h.service == key,
                    onTap: () => setState(() {
                      h.service = key;
                      if (key != 'autre') h.serviceOther.clear();
                    }),
                  ),
              ],
            ),
            if (h.service == 'autre') ...[
              const SizedBox(height: 10),
              _InlineTextField(
                controller: h.serviceOther,
                hint: 'Précise : matériel, bar, secrétariat…',
                onChanged: (_) => setState(() {}),
              ),
            ],
          ],
          if (h.activity == _HourActivity.formation) ...[
            const _SectionDivider(),
            if (_isEncadrant) ...[
              Row(
                children: [
                  Expanded(
                    child: _SegChoice(
                      icon: Icons.record_voice_over_outlined,
                      label: 'J\'ai encadré',
                      active: h.mode == _FormationMode.encadre,
                      onTap: () =>
                          setState(() => h.mode = _FormationMode.encadre),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _SegChoice(
                      icon: Icons.hearing,
                      label: 'J\'ai suivi le cours',
                      active: h.mode == _FormationMode.suivi,
                      onTap: () =>
                          setState(() => h.mode = _FormationMode.suivi),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
            ],
            if (_isEncadrant && h.mode == _FormationMode.encadre)
              _buildEncadreSection(h)
            else if (!_isEncadrant || h.mode == _FormationMode.suivi)
              _buildEleveSection(h),
          ],
        ],
      ),
    );
  }

  void _setActivity(_HourState h, _HourActivity a) {
    setState(() {
      h.activity = a;
      if (a != _HourActivity.formation) h.mode = null;
      if (a != _HourActivity.service) {
        h.service = null;
        h.serviceOther.clear();
      }
      if (a != _HourActivity.formation) h.pickerOpen = false;
    });
  }

  // ---- Encadré section -------------------------------------------------------

  Widget _buildEncadreSection(_HourState h) {
    final others = [
      for (final c in _plannedByHour[h.key] ?? const <_EncGroup>[])
        if (!h.groups.any(
            (g) => g.courseId != null && g.courseId == c.courseId))
          c,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          h.groups.any((g) => g.source == 'planning')
              ? 'Pré-rempli depuis le planning :'
              : 'Ton groupe cette heure :',
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.75),
            fontSize: 12.5,
          ),
        ),
        const SizedBox(height: 8),
        for (final g in h.groups) ...[
          _GroupConfirmTile(
            label: g.displayLabel,
            badge: g.source == 'manual' ? 'hors planning' : null,
            active: g.confirmed,
            onTap: () => setState(() => g.confirmed = !g.confirmed),
          ),
          const SizedBox(height: 8),
        ],
        _AddGroupButton(
          open: h.pickerOpen,
          onTap: () => setState(() => h.pickerOpen = !h.pickerOpen),
        ),
        if (h.pickerOpen) ...[
          const SizedBox(height: 12),
          if (others.isNotEmpty) ...[
            Text(
              'Autres cours planifiés cette heure :',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.75),
                fontSize: 12.5,
              ),
            ),
            const SizedBox(height: 8),
            for (final c in others) ...[
              _GroupConfirmTile(
                label: c.displayLabel,
                active: false,
                leadingIcon: Icons.add,
                onTap: () => setState(() {
                  h.groups.add(c.clone()..confirmed = true);
                  h.pickerOpen = false;
                }),
              ),
              const SizedBox(height: 8),
            ],
          ],
          Text(
            others.isEmpty ? 'Hors planning :' : 'Ou hors planning :',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.75),
              fontSize: 12.5,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final l in _kLevels)
                _ChipChoice(
                  label: l,
                  active: h.pickLevel == l,
                  onTap: () => setState(() => h.pickLevel = l),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              for (final n in const [1, 2])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: _ChipChoice(
                    label: 'Groupe $n',
                    active: h.pickGroupNumber == n,
                    onTap: () => setState(() => h.pickGroupNumber = n),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: h.pickLevel == null
                  ? null
                  : () => setState(() {
                        h.groups.add(_EncGroup(
                          level: h.pickLevel,
                          groupNumber: h.pickGroupNumber,
                          theme: null,
                          courseId: null,
                          source: 'manual',
                        ));
                        h.pickLevel = null;
                        h.pickGroupNumber = 1;
                        h.pickerOpen = false;
                      }),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white.withValues(alpha: 0.9),
                foregroundColor: AppColors.donkerblauw,
                disabledBackgroundColor: Colors.white.withValues(alpha: 0.30),
                disabledForegroundColor:
                    AppColors.donkerblauw.withValues(alpha: 0.45),
                elevation: 0,
                padding: const EdgeInsets.symmetric(vertical: 10),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: const Text(
                'Ajouter ce groupe',
                style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ],
    );
  }

  // ---- Élève / suivi section -------------------------------------------------

  Widget _buildEleveSection(_HourState h) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Dans quel groupe étais-tu ?',
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.75),
            fontSize: 12.5,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final l in _kLevels)
              _ChipChoice(
                label: l,
                active: h.elLevel == l,
                onTap: () => setState(() => h.elLevel = l),
              ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            for (final n in const [1, 2])
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: _ChipChoice(
                  label: 'Groupe $n',
                  active: h.elGroupNumber == n,
                  onTap: () => setState(() => h.elGroupNumber = n),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Header + context card
// ---------------------------------------------------------------------------

class _Header extends StatelessWidget {
  final FormationTask task;
  const _Header({required this.task});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 16, 6),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Piscine à compléter',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 11.5,
                    letterSpacing: 1.4,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                SizedBox(height: 2),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ContextCard extends StatelessWidget {
  final FormationTask task;
  final VoidCallback onReset;
  const _ContextCard({required this.task, required this.onReset});

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.pool, color: Colors.white, size: 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Ta soirée piscine',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Indique ce que tu as fait pendant chaque heure.',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.8),
                    fontSize: 12.5,
                  ),
                ),
                if (task.context.targetGroupLevel != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Groupe suggéré : ${task.context.targetGroupLevel}',
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onReset,
              borderRadius: BorderRadius.circular(10),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.30),
                  ),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.refresh, color: Colors.white, size: 15),
                    SizedBox(width: 4),
                    Text(
                      'Réinitialiser',
                      style: TextStyle(color: Colors.white, fontSize: 11.5),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

class _SegChoice extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  const _SegChoice({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
          decoration: BoxDecoration(
            color: active
                ? AppColors.middenblauw.withValues(alpha: 0.55)
                : Colors.white.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color:
                  active ? Colors.white : Colors.white.withValues(alpha: 0.25),
              width: active ? 1.5 : 1,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: Colors.white, size: 16),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionDivider extends StatelessWidget {
  const _SectionDivider();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Container(
        height: 0.5,
        color: Colors.white.withValues(alpha: 0.25),
      ),
    );
  }
}

class _InlineTextField extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final ValueChanged<String>? onChanged;

  const _InlineTextField({
    required this.controller,
    required this.hint,
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      style: const TextStyle(color: Colors.white, fontSize: 13),
      cursorColor: Colors.white,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(
          color: Colors.white.withValues(alpha: 0.55),
          fontSize: 12.5,
        ),
        isDense: true,
        filled: true,
        fillColor: Colors.white.withValues(alpha: 0.10),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.25)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.25)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Colors.white, width: 1.5),
        ),
      ),
    );
  }
}

class _ChipChoice extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;

  const _ChipChoice({
    required this.label,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: active ? Colors.white : Colors.white.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: Colors.white.withValues(alpha: active ? 1 : 0.30),
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: active ? AppColors.donkerblauw : Colors.white,
              fontSize: 13.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }
}

class _GroupConfirmTile extends StatelessWidget {
  final String label;
  final String? badge;
  final IconData? leadingIcon;
  final bool active;
  final VoidCallback onTap;

  const _GroupConfirmTile({
    required this.label,
    this.badge,
    this.leadingIcon,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: active
                ? AppColors.middenblauw.withValues(alpha: 0.55)
                : Colors.white.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color:
                  active ? Colors.white : Colors.white.withValues(alpha: 0.20),
              width: active ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Icon(
                leadingIcon ??
                    (active
                        ? Icons.check_circle
                        : Icons.radio_button_unchecked),
                color: Colors.white,
                size: 22,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (badge != null)
                Container(
                  margin: const EdgeInsets.only(left: 8),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.25),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    badge!,
                    style: const TextStyle(color: Colors.white, fontSize: 10),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddGroupButton extends StatelessWidget {
  final bool open;
  final VoidCallback onTap;
  const _AddGroupButton({required this.open, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.45),
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(open ? Icons.expand_less : Icons.add,
                  color: Colors.white, size: 18),
              const SizedBox(width: 6),
              const Text(
                'Ajouter un groupe',
                style: TextStyle(color: Colors.white, fontSize: 13.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Notes / worked-on sections
// ---------------------------------------------------------------------------

class _NotesSection extends StatelessWidget {
  final TextEditingController controller;
  const _NotesSection({required this.controller});

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle('Notes perso (facultatif)'),
          const SizedBox(height: 8),
          Text(
            'Ressenti, points à revoir, ce que tu veux retenir de ce soir…',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.8),
              fontSize: 12.5,
            ),
          ),
          const SizedBox(height: 10),
          _MultilineField(
            controller: controller,
            hint: 'Ce que tu veux retenir de ce soir…',
          ),
        ],
      ),
    );
  }
}

class _WorkedOnSection extends StatelessWidget {
  final TextEditingController controller;
  const _WorkedOnSection({required this.controller});

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle('Qu\'avez-vous travaillé ?'),
          const SizedBox(height: 8),
          Text(
            'Exercices, thème abordé, déroulé de la séance…',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.8),
              fontSize: 12.5,
            ),
          ),
          const SizedBox(height: 10),
          _MultilineField(
            controller: controller,
            hint:
                'Ex. répétition brevet 2★ : remontée assistée, vidage de masque…',
          ),
        ],
      ),
    );
  }
}

class _MultilineField extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  const _MultilineField({required this.controller, required this.hint});

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      minLines: 2,
      maxLines: 5,
      style: const TextStyle(color: Colors.white),
      cursorColor: Colors.white,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(
          color: Colors.white.withValues(alpha: 0.55),
          fontSize: 13,
        ),
        filled: true,
        fillColor: Colors.white.withValues(alpha: 0.10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.25)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.25)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Colors.white, width: 1.5),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Shared atoms
// ---------------------------------------------------------------------------

class _Card extends StatelessWidget {
  final Widget child;
  const _Card({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.20)),
      ),
      child: child,
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 15.5,
        fontWeight: FontWeight.bold,
      ),
    );
  }
}
