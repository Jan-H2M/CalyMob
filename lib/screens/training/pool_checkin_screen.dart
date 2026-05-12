/// Carnet de Formation — Post-pool check-in screen.
///
/// Opened from the Communication inbox when the user taps a `pool_checkin`
/// task. Walks the student through three confirmations in a single scroll :
///
///   1. Group   — confirm the auto-suggested Formation group (e.g. "Formation 2★")
///                or correct it manually.
///   2. Monitor — pick one or more validators from the candidate_validator_ids[]
///                that the Cloud Function populated.
///   3. Exercises — chip-select which LIFRAS exercises were practised tonight.
///                  These spawn one exercise_claim per chip on submit.
///
/// On submit :
///   - Update the task : `status='done'`, completed_at/by stamps.
///   - For each picked exercise, create an exercise_claim with
///     status='submitted', validation_mode='calypso_monitor', monitor_id
///     pointing to the chosen validator(s).
///
/// Spec : `CARNET_DE_FORMATION_TECH.md` v2.1 §11.1 (mockup 02 flow).

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/formation_task.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/formation_task_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

// LIFRAS exercise catalog hint — sourced from clubs/{clubId}/exercices_lifras
// in a real fetch. For phase 1 we offer a small static set of frequent codes
// the student can pick from. A future enhancement reads the full catalog
// filtered by the target_group_level.
const _commonExerciseCodes = <String>[
  'P2.DP', 'P2.RA', 'P2.ST', 'P2.PB',
  'P1.PB', 'P1.VM', 'P1.CA',
  'P3.OR', 'P3.NX',
];

class PoolCheckinScreen extends StatefulWidget {
  final FormationTask task;
  const PoolCheckinScreen({super.key, required this.task});

  @override
  State<PoolCheckinScreen> createState() => _PoolCheckinScreenState();
}

class _PoolCheckinScreenState extends State<PoolCheckinScreen> {
  final FormationTaskService _taskService = FormationTaskService();

  String? _selectedGroup; // 'Formation 1★' / '2★' / '3★' / '4★' / 'libre'
  final Set<String> _selectedMonitorIds = <String>{};
  final Set<String> _selectedExercises = <String>{};
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _selectedGroup = widget.task.context.targetGroupLevel; // pre-confirm
  }

  @override
  Widget build(BuildContext context) {
    final memberProvider = context.watch<MemberProvider>();

    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _Header(task: widget.task),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 110),
                  children: [
                    _ContextCard(task: widget.task),
                    const SizedBox(height: 18),
                    _GroupSection(
                      suggested: widget.task.context.targetGroupLevel,
                      selected: _selectedGroup,
                      onSelect: (g) => setState(() => _selectedGroup = g),
                    ),
                    const SizedBox(height: 18),
                    if (_selectedGroup != null && _selectedGroup != 'libre')
                      _MonitorSection(
                        candidateIds: widget.task.context.candidateValidatorIds,
                        selected: _selectedMonitorIds,
                        onToggle: (id) => setState(() {
                          if (_selectedMonitorIds.contains(id)) {
                            _selectedMonitorIds.remove(id);
                          } else {
                            _selectedMonitorIds.add(id);
                          }
                        }),
                      ),
                    if (_selectedGroup != null && _selectedGroup != 'libre') ...[
                      const SizedBox(height: 18),
                      _ExerciseSection(
                        selected: _selectedExercises,
                        onToggle: (code) => setState(() {
                          if (_selectedExercises.contains(code)) {
                            _selectedExercises.remove(code);
                          } else {
                            _selectedExercises.add(code);
                          }
                        }),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ElevatedButton(
                onPressed: _submitting ? null : () => _submit(memberProvider),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.middenblauw,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  textStyle: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                  minimumSize: const Size.fromHeight(48),
                ),
                child: _submitting
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2.4,
                        ),
                      )
                    : Text(
                        _selectedGroup == 'libre'
                            ? 'Marquer comme libre'
                            : 'Confirmer',
                      ),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _submitting ? null : _dismiss,
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: const BorderSide(color: Colors.white),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  minimumSize: const Size.fromHeight(48),
                ),
                child: const Text(
                  'Pas concerné',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submit(MemberProvider memberProvider) async {
    setState(() => _submitting = true);

    final auth = context.read<AuthProvider>();
    final userId = auth.currentUser?.uid;
    if (userId == null) {
      _err('Session non identifiée');
      return;
    }

    try {
      const clubId = FirebaseConfig.defaultClubId;

      // 1. If exercises were declared, create one exercise_claim per code.
      //    Use the first selected monitor (or null if none chosen).
      final monitorId = _selectedMonitorIds.isNotEmpty
          ? _selectedMonitorIds.first
          : null;

      if (_selectedGroup != 'libre' && _selectedExercises.isNotEmpty) {
        await _createExerciseClaims(
          clubId: clubId,
          userId: userId,
          monitorId: monitorId,
        );
      }

      // 2. Mark the task as done.
      await _taskService.markCompleted(clubId, widget.task.id, userId);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Piscine confirmée — merci !')),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      _err('Erreur : $e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _dismiss() async {
    setState(() => _submitting = true);
    try {
      final userId = context.read<AuthProvider>().currentUser?.uid;
      if (userId == null) throw 'Session non identifiée';
      const clubId = FirebaseConfig.defaultClubId;
      await _taskService.dismiss(clubId, widget.task.id, userId);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      _err('Erreur : $e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _createExerciseClaims({
    required String clubId,
    required String userId,
    String? monitorId,
  }) async {
    final db = FirebaseFirestore.instance;
    final claimsCol = db.collection('clubs').doc(clubId).collection('exercise_claims');

    final member = context.read<MemberProvider>();
    final memberName =
        '${member.prenom ?? ''} ${member.nom ?? ''}'.trim();

    for (final code in _selectedExercises) {
      await claimsCol.add({
        'member_id': userId,
        'member_name': memberName,
        'exercise_id': code,
        'exercise_code': code,
        'context_type': 'pool',
        'pool_session_id': widget.task.context.poolSessionId,
        'declared_by': userId,
        'declared_at': FieldValue.serverTimestamp(),
        'validation_mode': 'calypso_monitor',
        'monitor_id': monitorId,
        'evidence': <Map<String, dynamic>>[],
        'status': 'submitted',
        'created_at': FieldValue.serverTimestamp(),
        'updated_at': FieldValue.serverTimestamp(),
      });
    }
  }

  void _err(String msg) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg)),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Header + sections
// ---------------------------------------------------------------------------

class _Header extends StatelessWidget {
  final FormationTask task;
  const _Header({required this.task});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 8, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white, size: 26),
            onPressed: () => Navigator.pop(context),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text(
                  'Check-in post-piscine',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  'Confirme ou corrige en 30 secondes',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
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
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Colors.white.withValues(alpha: 0.96),
            Colors.white.withValues(alpha: 0.88),
          ],
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'DÉTECTÉ AUTOMATIQUEMENT',
            style: TextStyle(
              color: AppColors.middenblauw,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Piscine de Watermael-Boitsfort',
            style: TextStyle(
              color: AppColors.donkerblauw,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            task.context.targetGroupLevel != null
                ? task.context.targetGroupLevel!
                : 'Niveau à déterminer',
            style: TextStyle(
              color: AppColors.donkerblauw.withValues(alpha: 0.7),
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class _GroupSection extends StatelessWidget {
  final String? suggested;
  final String? selected;
  final ValueChanged<String> onSelect;

  const _GroupSection({
    required this.suggested,
    required this.selected,
    required this.onSelect,
  });

  static const _options = ['Formation 1★', 'Formation 2★', 'Formation 3★', 'Formation 4★'];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'TU AS FAIT QUEL GROUPE ?',
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.85),
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 8),
        ..._options.map((label) {
          final isSuggested = label == suggested;
          final isSelected = label == selected;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _OptionTile(
              label: label,
              subtitle: isSuggested ? 'suggéré' : null,
              selected: isSelected,
              onTap: () => onSelect(label),
            ),
          );
        }),
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: _OptionTile(
            label: 'Plongée libre (pas en formation)',
            subtitle: null,
            selected: selected == 'libre',
            onTap: () => onSelect('libre'),
          ),
        ),
      ],
    );
  }
}

class _MonitorSection extends StatelessWidget {
  final List<String> candidateIds;
  final Set<String> selected;
  final ValueChanged<String> onToggle;

  const _MonitorSection({
    required this.candidateIds,
    required this.selected,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    if (candidateIds.isEmpty) {
      return _InfoCard(
        message:
            'Aucun moniteur planifié pour ce groupe ce soir. Le responsable formation s\'en occupe.',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'QUI T\'A ENCADRÉ CE SOIR ?',
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.85),
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 8),
        // Live-fetch each candidate's display name from the members collection.
        ...candidateIds.map((id) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _MonitorTile(
                memberId: id,
                selected: selected.contains(id),
                onTap: () => onToggle(id),
              ),
            )),
      ],
    );
  }
}

class _MonitorTile extends StatelessWidget {
  final String memberId;
  final bool selected;
  final VoidCallback onTap;

  const _MonitorTile({
    required this.memberId,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    const clubId = FirebaseConfig.defaultClubId;
    return FutureBuilder<DocumentSnapshot>(
      future: FirebaseFirestore.instance
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .doc(memberId)
          .get(),
      builder: (context, snapshot) {
        String displayName = memberId;
        String level = '';
        if (snapshot.hasData && snapshot.data!.exists) {
          final data = snapshot.data!.data() as Map<String, dynamic>;
          final prenom = data['prenom'] ?? '';
          final nom = data['nom'] ?? '';
          displayName = '$prenom $nom'.trim();
          if (displayName.isEmpty) displayName = data['email'] ?? memberId;
          level = data['plongeur_code'] ?? data['plongeur_niveau'] ?? '';
        }
        return _OptionTile(
          label: displayName,
          subtitle: level.isEmpty ? null : level,
          selected: selected,
          onTap: onTap,
        );
      },
    );
  }
}

class _ExerciseSection extends StatelessWidget {
  final Set<String> selected;
  final ValueChanged<String> onToggle;

  const _ExerciseSection({required this.selected, required this.onToggle});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'TU AS TRAVAILLÉ QUOI ?',
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.85),
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _commonExerciseCodes.map((code) {
            final on = selected.contains(code);
            return ChoiceChip(
              label: Text(code),
              selected: on,
              onSelected: (_) => onToggle(code),
              labelStyle: TextStyle(
                color: on ? Colors.white : AppColors.donkerblauw,
                fontWeight: FontWeight.w700,
                fontSize: 12,
              ),
              selectedColor: AppColors.middenblauw,
              backgroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
                side: BorderSide(
                  color: on ? AppColors.middenblauw : Colors.white,
                ),
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 6),
        Text(
          'Le moniteur validera officiellement après.',
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.75),
            fontSize: 11,
          ),
        ),
      ],
    );
  }
}

class _OptionTile extends StatelessWidget {
  final String label;
  final String? subtitle;
  final bool selected;
  final VoidCallback onTap;

  const _OptionTile({
    required this.label,
    this.subtitle,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Ink(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: selected ? 0.98 : 0.88),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? AppColors.middenblauw : Colors.transparent,
            width: 2,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      color: AppColors.donkerblauw,
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (subtitle != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        subtitle!,
                        style: TextStyle(
                          color: AppColors.donkerblauw.withValues(alpha: 0.65),
                          fontSize: 11.5,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Icon(
              selected
                  ? Icons.check_circle
                  : Icons.radio_button_unchecked,
              color: selected
                  ? AppColors.middenblauw
                  : AppColors.donkerblauw.withValues(alpha: 0.3),
              size: 22,
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final String message;
  const _InfoCard({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF8EE),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFFFD8A0)),
      ),
      child: Text(
        message,
        style: const TextStyle(
          color: Color(0xFFC2620E),
          fontSize: 12.5,
        ),
      ),
    );
  }
}
