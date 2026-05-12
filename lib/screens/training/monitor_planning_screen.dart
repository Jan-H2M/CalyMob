/// Carnet de Formation — Monitor field-prep screen.
///
/// Opened from the instructor's profile menu when they are encadrant for
/// a sortie. Lists the participating members, their formation needs (level,
/// requested exercises), and lets the instructor assign:
///   - planned_role (DP / SF / élève exercice / observateur / ...)
///   - planned_exercises[] (LIFRAS codes)
///   - monitor_validator_id (themselves by default)
///   - pedagogical_note
///
/// Saves to `clubs/{clubId}/palanquees/{palanqueeId}` — the `onPalanqueeSaved`
/// Cloud Function then pre-creates draft exercise_claims.
///
/// Spec : `CARNET_DE_FORMATION_TECH.md` v2.1 §11 (mockup 06).

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class MonitorPlanningScreen extends StatefulWidget {
  final String operationId;
  final String? palanqueeId; // if editing an existing palanquée

  const MonitorPlanningScreen({
    super.key,
    required this.operationId,
    this.palanqueeId,
  });

  @override
  State<MonitorPlanningScreen> createState() => _MonitorPlanningScreenState();
}

class _MonitorPlanningScreenState extends State<MonitorPlanningScreen> {
  bool _loading = true;
  bool _saving = false;
  Map<String, dynamic>? _operation;
  List<Map<String, dynamic>> _participants = [];
  // memberId -> { role: 'dp' | 'sf' | ..., exercises: ['P2.DP', ...], note: '...' }
  final Map<String, Map<String, dynamic>> _assignments = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    const clubId = FirebaseConfig.defaultClubId;
    final fs = FirebaseFirestore.instance;

    final op = await fs
        .collection('clubs')
        .doc(clubId)
        .collection('operations')
        .doc(widget.operationId)
        .get();

    final participantsSnap = await fs
        .collection('clubs')
        .doc(clubId)
        .collection('participant_operation')
        .where('operation_id', isEqualTo: widget.operationId)
        .get();

    final participants = <Map<String, dynamic>>[];
    for (final pDoc in participantsSnap.docs) {
      final p = pDoc.data();
      final memberId = p['membre_id'] ?? p['member_id'];
      if (memberId == null) continue;
      try {
        final m = await fs
            .collection('clubs')
            .doc(clubId)
            .collection('members')
            .doc(memberId)
            .get();
        if (m.exists) {
          participants.add({
            'member_id': memberId,
            'prenom': m.data()?['prenom'] ?? '',
            'nom': m.data()?['nom'] ?? '',
            'plongeur_code': m.data()?['plongeur_code'] ?? '',
            'formation_active': m.data()?['formation_active'] == true,
            'requested_exercises':
                (p['requested_exercises'] as List?)?.cast<String>() ??
                    (p['exercices'] as List?)?.cast<String>() ??
                    const <String>[],
          });
        }
      } catch (_) {/* skip */}
    }

    if (widget.palanqueeId != null) {
      final pSnap = await fs
          .collection('clubs')
          .doc(clubId)
          .collection('palanquees')
          .doc(widget.palanqueeId!)
          .get();
      final data = pSnap.data();
      if (pSnap.exists && data != null) {
        // Pre-fill assignments from existing palanquée
        final plannedRole = (data['planned_role'] as Map?)?.cast<String, dynamic>() ?? {};
        final plannedExercises =
            (data['planned_exercises'] as Map?)?.cast<String, dynamic>() ?? {};
        for (final p in participants) {
          final mid = p['member_id'] as String;
          _assignments[mid] = {
            'role': plannedRole[mid] ?? '',
            'exercises': (plannedExercises[mid] as List?)?.cast<String>() ?? <String>[],
            'note': '',
          };
        }
      }
    }

    setState(() {
      _operation = op.data();
      _participants = participants;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _header(),
              Expanded(
                child: _loading
                    ? const Center(
                        child: CircularProgressIndicator(color: Colors.white),
                      )
                    : ListView(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                        children: [
                          _operationCard(),
                          const SizedBox(height: 14),
                          ..._participants.map((p) => Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: _ParticipantTile(
                                  participant: p,
                                  assignment: _assignments[p['member_id']] ??
                                      {'role': '', 'exercises': <String>[], 'note': ''},
                                  onChange: (a) =>
                                      setState(() => _assignments[p['member_id']] = a),
                                ),
                              )),
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
          child: ElevatedButton(
            onPressed: _saving || _loading ? null : _save,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.middenblauw,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              minimumSize: const Size.fromHeight(48),
            ),
            child: _saving
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.4),
                  )
                : const Text('Sauvegarder le plan'),
          ),
        ),
      ),
    );
  }

  Widget _header() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 8, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white, size: 26),
            onPressed: () => Navigator.pop(context),
          ),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Préparation sortie',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  'Composer les exercices et rôles',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _operationCard() {
    final title = _operation?['titre'] ?? _operation?['title'] ?? widget.operationId;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'SORTIE',
            style: TextStyle(
              color: AppColors.middenblauw,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            title,
            style: const TextStyle(
              color: AppColors.donkerblauw,
              fontSize: 17,
              fontWeight: FontWeight.w800,
            ),
          ),
          Text(
            '${_participants.length} participants',
            style: TextStyle(
              color: AppColors.donkerblauw.withValues(alpha: 0.65),
              fontSize: 12.5,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      const clubId = FirebaseConfig.defaultClubId;
      final userId = context.read<AuthProvider>().currentUser?.uid;
      if (userId == null) throw 'Session non identifiée';

      final plannedRole = <String, dynamic>{};
      final plannedExercises = <String, dynamic>{};
      String? note;
      for (final entry in _assignments.entries) {
        if ((entry.value['role'] ?? '').isNotEmpty) plannedRole[entry.key] = entry.value['role'];
        final exs = entry.value['exercises'] as List<String>;
        if (exs.isNotEmpty) plannedExercises[entry.key] = exs;
        if ((entry.value['note'] ?? '').isNotEmpty) {
          note = ((note ?? '') + '\n' + entry.value['note']).trim();
        }
      }

      final fs = FirebaseFirestore.instance;
      final palCol = fs.collection('clubs').doc(clubId).collection('palanquees');

      final palanqueeId = widget.palanqueeId ?? palCol.doc().id;
      await palCol.doc(palanqueeId).set({
        'operation_id': widget.operationId,
        'planned_role': plannedRole,
        'planned_exercises': plannedExercises,
        'monitor_validator_id': userId,
        if (note != null && note.isNotEmpty) 'pedagogical_note': note,
        'updated_at': FieldValue.serverTimestamp(),
        if (widget.palanqueeId == null) 'created_at': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Plan sauvegardé ✓')),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur : $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

// ---------------------------------------------------------------------------
// Per-participant tile
// ---------------------------------------------------------------------------

class _ParticipantTile extends StatelessWidget {
  final Map<String, dynamic> participant;
  final Map<String, dynamic> assignment;
  final ValueChanged<Map<String, dynamic>> onChange;

  const _ParticipantTile({
    required this.participant,
    required this.assignment,
    required this.onChange,
  });

  static const _roles = ['dp', 'sf', 'student_exercise', 'observer', 'assistant', 'victim'];
  static const _exerciseCodes = <String>[
    'P1.PB', 'P1.VM', 'P1.CA',
    'P2.DP', 'P2.RA', 'P2.ST', 'P2.PB',
    'P3.OR', 'P3.NX', 'P3.PR',
  ];

  String _roleLabel(String key) {
    switch (key) {
      case 'dp': return 'DP';
      case 'sf': return 'SF';
      case 'student_exercise': return 'Élève exo';
      case 'observer': return 'Observ.';
      case 'assistant': return 'Assist.';
      case 'victim': return 'Victime';
      default: return key;
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = '${participant['prenom']} ${participant['nom']}'.trim();
    final level = participant['plongeur_code']?.toString() ?? '';
    final formationActive = participant['formation_active'] == true;
    final wishlist = (participant['requested_exercises'] as List?)?.cast<String>() ?? [];

    final selectedRole = (assignment['role'] ?? '') as String;
    final selectedExs = (assignment['exercises'] as List).cast<String>();

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name.isEmpty ? participant['member_id'] : name,
                      style: const TextStyle(
                        color: AppColors.donkerblauw,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (level.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          level,
                          style: TextStyle(
                            color: AppColors.donkerblauw.withValues(alpha: 0.65),
                            fontSize: 12,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (formationActive)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.oranje.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    'en formation',
                    style: TextStyle(
                      color: Color(0xFFC2620E),
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),

          // Wishlist from inscription
          if (wishlist.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: wishlist
                  .map((c) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEEF4F9),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          'souhait $c',
                          style: const TextStyle(
                            color: Color(0xFF006DB6),
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ))
                  .toList(),
            ),
          ],

          const SizedBox(height: 10),
          // Role chips
          Text(
            'RÔLE PRÉVU',
            style: TextStyle(
              color: AppColors.donkerblauw.withValues(alpha: 0.6),
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.0,
            ),
          ),
          const SizedBox(height: 4),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: _roles.map((r) {
              final on = selectedRole == r;
              return ChoiceChip(
                label: Text(_roleLabel(r)),
                selected: on,
                onSelected: (sel) {
                  final next = Map<String, dynamic>.from(assignment);
                  next['role'] = sel ? r : '';
                  onChange(next);
                },
                labelStyle: TextStyle(
                  color: on ? Colors.white : AppColors.donkerblauw,
                  fontWeight: FontWeight.w700,
                  fontSize: 11.5,
                ),
                selectedColor: AppColors.middenblauw,
                backgroundColor: const Color(0xFFEEF4F9),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                  side: BorderSide(
                    color: on ? AppColors.middenblauw : Colors.transparent,
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 10),

          // Exercise chips
          Text(
            'EXERCICES PRÉVUS',
            style: TextStyle(
              color: AppColors.donkerblauw.withValues(alpha: 0.6),
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.0,
            ),
          ),
          const SizedBox(height: 4),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: _exerciseCodes.map((code) {
              final on = selectedExs.contains(code);
              return ChoiceChip(
                label: Text(code),
                selected: on,
                onSelected: (sel) {
                  final next = Map<String, dynamic>.from(assignment);
                  final exs = List<String>.from(selectedExs);
                  if (sel) {
                    if (!exs.contains(code)) exs.add(code);
                  } else {
                    exs.remove(code);
                  }
                  next['exercises'] = exs;
                  onChange(next);
                },
                labelStyle: TextStyle(
                  color: on ? Colors.white : AppColors.donkerblauw,
                  fontWeight: FontWeight.w700,
                  fontSize: 11,
                ),
                selectedColor: const Color(0xFF4CAF50),
                backgroundColor: const Color(0xFFEEF4F9),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                  side: BorderSide(
                    color: on ? const Color(0xFF4CAF50) : Colors.transparent,
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}
