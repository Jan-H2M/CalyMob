/// Phase C (v2.2, 2026-05-13) — Post-pool check-in screen, rewritten.
///
/// Per `_carnet_plan.md` §3.1.3 + §13 C.9 the v2.2 flow is:
///
///   1. Outcome chooser : Training / Service / Nage libre.
///      Only `training` triggers downstream side-effects (logbook entry +
///      monitor_observation task at session close).
///   2. If training, pick the formation level (suggested from
///      task.context.target_group_level) and group number.
///   3. Optional personal notes.
///
/// NO more LIFRAS chip picker, NO more monitor multi-select — validators
/// are derived from the group at session close (`onPoolCheckinCompleted`
/// + `onPoolSessionClosed`).
///
/// Submit writes `completion_data` on the task so the
/// `onPoolCheckinCompleted` Cloud Function can propagate the chosen group
/// onto the attendee doc.

import 'dart:convert';

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
  /// the `completion_data` that *would* be written, then pops. Used by the
  /// scenario gallery to validate every fiche without a real event.
  final bool previewMode;

  const PoolCheckinScreen({
    super.key,
    required this.task,
    this.previewMode = false,
  });

  @override
  State<PoolCheckinScreen> createState() => _PoolCheckinScreenState();
}

enum _Outcome { training, serviceOnly, nageLibre }

class _PoolCheckinScreenState extends State<PoolCheckinScreen> {
  final FormationTaskService _taskService = FormationTaskService();

  _Outcome? _outcome;
  String? _level; // 1*/2*/3*/4*/AM
  int _groupNumber = 1; // 1 or 2
  final TextEditingController _notes = TextEditingController();
  bool _submitting = false;

  // ---- Encadrant variant state ----
  /// True when this check-in is the formateur fiche (context.role=='encadrant').
  bool get _isEncadrant => widget.task.context.isEncadrant;

  /// Groups pre-filled from the planning; an encadrant confirms which he
  /// actually supervised (he might have been reassigned on the spot).
  late final List<FormationTaskEncadrantGroup> _encadrantGroups;
  late final List<bool> _groupConfirmed;
  final TextEditingController _workedOn = TextEditingController();

  @override
  void initState() {
    super.initState();
    _level = _parseLevelFromTarget(widget.task.context.targetGroupLevel);
    _encadrantGroups = widget.task.context.encadrantGroups;
    _groupConfirmed = List<bool>.filled(_encadrantGroups.length, true);
  }

  String? _parseLevelFromTarget(String? raw) {
    if (raw == null) return null;
    // raw might be "Formation 2*" — extract "2*"
    final m = RegExp(r'(\d\*|AM)').firstMatch(raw);
    return m?.group(1);
  }

  @override
  void dispose() {
    _notes.dispose();
    _workedOn.dispose();
    super.dispose();
  }

  String get _groupKey {
    final level = _level ?? '';
    return '${level.replaceAll('*', 'star')}_groupe$_groupNumber';
  }

  bool get _canSubmit {
    if (_submitting) return false;
    if (_isEncadrant) {
      // At least one supervised group must remain confirmed.
      return _groupConfirmed.contains(true);
    }
    if (_outcome == null) return false;
    if (_outcome == _Outcome.training && (_level == null || _level!.isEmpty)) {
      return false;
    }
    return true;
  }

  Map<String, dynamic> _buildStudentCompletionData() {
    final outcome = switch (_outcome!) {
      _Outcome.training => 'training',
      _Outcome.serviceOnly => 'service_only',
      _Outcome.nageLibre => 'nage_libre',
    };
    return <String, dynamic>{
      'outcome': outcome,
      if (outcome == 'training') ...{
        'level': _level,
        'groupNumber': _groupNumber,
        'groupKey': _groupKey,
      },
      if (_notes.text.trim().isNotEmpty) 'personalNotes': _notes.text.trim(),
    };
  }

  Map<String, dynamic> _buildCompletionData() {
    return _isEncadrant
        ? <String, dynamic>{
            'outcome': 'encadrant',
            'groups': [
              for (var i = 0; i < _encadrantGroups.length; i++)
                if (_groupConfirmed[i]) _encadrantGroups[i].toMap(),
            ],
            if (_workedOn.text.trim().isNotEmpty)
              'workedOn': _workedOn.text.trim(),
            if (_notes.text.trim().isNotEmpty)
              'personalNotes': _notes.text.trim(),
          }
        : _buildStudentCompletionData();
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

  List<Widget> _buildStudentBody() {
    return [
      _ContextCard(task: widget.task),
      const SizedBox(height: 18),
      _OutcomeSection(
        selected: _outcome,
        onSelect: (o) => setState(() => _outcome = o),
      ),
      if (_outcome == _Outcome.training) ...[
        const SizedBox(height: 18),
        _GroupSection(
          selectedLevel: _level,
          selectedGroupNumber: _groupNumber,
          suggested: widget.task.context.targetGroupLevel,
          onLevelChange: (l) => setState(() => _level = l),
          onGroupNumberChange: (n) => setState(() => _groupNumber = n),
        ),
      ],
      if (_outcome != null) ...[
        const SizedBox(height: 18),
        _NotesSection(controller: _notes),
      ],
    ];
  }

  List<Widget> _buildEncadrantBody() {
    return [
      const _EncadrantHeaderCard(),
      const SizedBox(height: 18),
      _EncadrantGroupsSection(
        groups: _encadrantGroups,
        confirmed: _groupConfirmed,
        onToggle: (i, v) => setState(() => _groupConfirmed[i] = v),
      ),
      const SizedBox(height: 18),
      _WorkedOnSection(controller: _workedOn),
      const SizedBox(height: 18),
      _NotesSection(
        controller: _notes,
        title: '3. Remarques (facultatif)',
        helper:
            'Remarques sur les plongeurs de ton groupe, points à revoir, etc.',
        hint: 'Ce que tu veux retenir pour la prochaine fois…',
      ),
    ];
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
                  children: _isEncadrant
                      ? _buildEncadrantBody()
                      : _buildStudentBody(),
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
}

// ---------------------------------------------------------------------------
// Header
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
  const _ContextCard({required this.task});

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Row(
        children: [
          const Icon(Icons.pool, color: Colors.white, size: 36),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  task.title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (task.context.targetGroupLevel != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Groupe suggéré : ${task.context.targetGroupLevel}',
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 12.5,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Outcome chooser
// ---------------------------------------------------------------------------

class _OutcomeSection extends StatelessWidget {
  final _Outcome? selected;
  final ValueChanged<_Outcome> onSelect;
  const _OutcomeSection({required this.selected, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle('1. Comment as-tu passé ta soirée piscine ?'),
          const SizedBox(height: 12),
          _OutcomeTile(
            icon: Icons.school,
            title: 'Formation',
            subtitle: 'J\'ai plongé dans un groupe de formation',
            active: selected == _Outcome.training,
            onTap: () => onSelect(_Outcome.training),
          ),
          const SizedBox(height: 8),
          _OutcomeTile(
            icon: Icons.handshake_outlined,
            title: 'Service',
            subtitle:
                'Accueil, baptêmes ou gonflage — pas de formation ce soir',
            active: selected == _Outcome.serviceOnly,
            onTap: () => onSelect(_Outcome.serviceOnly),
          ),
          const SizedBox(height: 8),
          _OutcomeTile(
            icon: Icons.waves,
            title: 'Nage libre',
            subtitle: 'Couloir libre, pas de cours',
            active: selected == _Outcome.nageLibre,
            onTap: () => onSelect(_Outcome.nageLibre),
          ),
        ],
      ),
    );
  }
}

class _OutcomeTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool active;
  final VoidCallback onTap;

  const _OutcomeTile({
    required this.icon,
    required this.title,
    required this.subtitle,
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
              Icon(icon, color: Colors.white, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.85),
                        fontSize: 12.5,
                      ),
                    ),
                  ],
                ),
              ),
              if (active)
                const Icon(Icons.check_circle, color: Colors.white, size: 22),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Group section (only when outcome == training)
// ---------------------------------------------------------------------------

class _GroupSection extends StatelessWidget {
  final String? selectedLevel;
  final int selectedGroupNumber;
  final String? suggested;
  final ValueChanged<String> onLevelChange;
  final ValueChanged<int> onGroupNumberChange;

  const _GroupSection({
    required this.selectedLevel,
    required this.selectedGroupNumber,
    required this.suggested,
    required this.onLevelChange,
    required this.onGroupNumberChange,
  });

  static const _levels = ['1*', '2*', '3*', '4*', 'AM'];

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle('2. Dans quel groupe étais-tu ?'),
          if (suggested != null) ...[
            const SizedBox(height: 4),
            Text(
              'Suggestion : $suggested',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.75),
                fontSize: 12.5,
              ),
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final l in _levels)
                _ChipChoice(
                  label: l,
                  active: selectedLevel == l,
                  onTap: () => onLevelChange(l),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Groupe n°',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.85),
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              for (final n in [1, 2])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: _ChipChoice(
                    label: 'Groupe $n',
                    active: selectedGroupNumber == n,
                    onTap: () => onGroupNumberChange(n),
                  ),
                ),
            ],
          ),
        ],
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

// ---------------------------------------------------------------------------
// Notes section
// ---------------------------------------------------------------------------

class _NotesSection extends StatelessWidget {
  final TextEditingController controller;
  final String title;
  final String helper;
  final String hint;
  const _NotesSection({
    required this.controller,
    this.title = '3. Notes perso (facultatif)',
    this.helper = 'Ressenti, exercices que tu veux signaler à ton encadrant, etc.',
    this.hint = 'Ce que tu veux retenir de ce soir…',
  });

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionTitle(title),
          const SizedBox(height: 8),
          Text(
            helper,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.8),
              fontSize: 12.5,
            ),
          ),
          const SizedBox(height: 10),
          TextField(
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
                borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.25),
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.25),
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Colors.white, width: 1.5),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Encadrant variant sections
// ---------------------------------------------------------------------------

class _EncadrantHeaderCard extends StatelessWidget {
  const _EncadrantHeaderCard();

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Row(
        children: [
          const Icon(Icons.school, color: Colors.white, size: 36),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Tu étais encadrant ce soir',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Confirme ton groupe et note ce que vous avez travaillé.',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.8),
                    fontSize: 12.5,
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

class _EncadrantGroupsSection extends StatelessWidget {
  final List<FormationTaskEncadrantGroup> groups;
  final List<bool> confirmed;
  final void Function(int index, bool value) onToggle;

  const _EncadrantGroupsSection({
    required this.groups,
    required this.confirmed,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle('1. Ton groupe ce soir'),
          const SizedBox(height: 4),
          Text(
            groups.length > 1
                ? 'Décoche un groupe si tu ne l\'as finalement pas encadré.'
                : 'Pré-rempli depuis le planning.',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.75),
              fontSize: 12.5,
            ),
          ),
          const SizedBox(height: 12),
          if (groups.isEmpty)
            Text(
              'Aucun groupe trouvé dans le planning. Ajoute une remarque ci-dessous.',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.85),
                fontSize: 13,
              ),
            )
          else
            for (var i = 0; i < groups.length; i++) ...[
              if (i > 0) const SizedBox(height: 8),
              _GroupConfirmTile(
                label: groups[i].displayLabel,
                active: confirmed[i],
                onTap: () => onToggle(i, !confirmed[i]),
              ),
            ],
        ],
      ),
    );
  }
}

class _GroupConfirmTile extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;

  const _GroupConfirmTile({
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
              color: active ? Colors.white : Colors.white.withValues(alpha: 0.20),
              width: active ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Icon(
                active ? Icons.check_circle : Icons.radio_button_unchecked,
                color: Colors.white,
                size: 22,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
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

class _WorkedOnSection extends StatelessWidget {
  final TextEditingController controller;
  const _WorkedOnSection({required this.controller});

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle('2. Qu\'avez-vous travaillé ce soir ?'),
          const SizedBox(height: 8),
          Text(
            'Exercices, thème abordé, déroulé de la séance…',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.8),
              fontSize: 12.5,
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: controller,
            minLines: 2,
            maxLines: 5,
            style: const TextStyle(color: Colors.white),
            cursorColor: Colors.white,
            decoration: InputDecoration(
              hintText: 'Ex. répétition brevet 2★ : remontée assistée, vidage de masque…',
              hintStyle: TextStyle(
                color: Colors.white.withValues(alpha: 0.55),
                fontSize: 13,
              ),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.10),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.25),
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.25),
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Colors.white, width: 1.5),
              ),
            ),
          ),
        ],
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
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
        boxShadow: [
          BoxShadow(
            color: AppColors.donkerblauw.withValues(alpha: 0.18),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
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
        fontSize: 15,
        fontWeight: FontWeight.bold,
      ),
    );
  }
}
