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
  const PoolCheckinScreen({super.key, required this.task});

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

  @override
  void initState() {
    super.initState();
    _level = _parseLevelFromTarget(widget.task.context.targetGroupLevel);
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
    super.dispose();
  }

  String get _groupKey {
    final level = _level ?? '';
    return '${level.replaceAll('*', 'star')}_groupe$_groupNumber';
  }

  bool get _canSubmit {
    if (_submitting) return false;
    if (_outcome == null) return false;
    if (_outcome == _Outcome.training && (_level == null || _level!.isEmpty)) {
      return false;
    }
    return true;
  }

  Future<void> _submit() async {
    if (!_canSubmit) return;
    final userId = context.read<AuthProvider>().currentUser?.uid;
    if (userId == null) return;
    setState(() => _submitting = true);

    final outcome = switch (_outcome!) {
      _Outcome.training => 'training',
      _Outcome.serviceOnly => 'service_only',
      _Outcome.nageLibre => 'nage_libre',
    };

    final completionData = <String, dynamic>{
      'outcome': outcome,
      if (outcome == 'training') ...{
        'level': _level,
        'groupNumber': _groupNumber,
        'groupKey': _groupKey,
      },
      if (_notes.text.trim().isNotEmpty) 'personalNotes': _notes.text.trim(),
    };

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

  Future<void> _dismiss() async {
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
                        onGroupNumberChange: (n) =>
                            setState(() => _groupNumber = n),
                      ),
                    ],
                    if (_outcome != null) ...[
                      const SizedBox(height: 18),
                      _NotesSection(controller: _notes),
                    ],
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
            child: Row(
              children: [
                TextButton(
                  onPressed: _submitting ? null : _dismiss,
                  child: const Text(
                    'Pas concerné',
                    style: TextStyle(color: Colors.white70),
                  ),
                ),
                const Spacer(),
                ElevatedButton.icon(
                  onPressed: _canSubmit ? _submit : null,
                  icon: _submitting
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.send),
                  label: Text(_submitting ? 'Envoi…' : 'Confirmer ma piscine'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.middenblauw,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 18,
                      vertical: 12,
                    ),
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
  const _NotesSection({required this.controller});

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle('3. Notes perso (facultatif)'),
          const SizedBox(height: 8),
          Text(
            'Ressenti, exercices que tu veux signaler à ton encadrant, etc.',
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
              hintText: 'Ce que tu veux retenir de ce soir…',
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
