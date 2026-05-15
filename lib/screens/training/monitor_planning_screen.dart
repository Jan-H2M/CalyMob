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
/// Saves to `clubs/{clubId}/operations/{operationId}/palanquees/{palanqueeId}`.
/// The `onOperationPalanqueeSaved` Cloud Function then pre-creates draft
/// exercise_claims.
///
/// Spec : `CARNET_DE_FORMATION_TECH.md` v2.1 §11 (mockup 06).

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../services/formation_snapshot_service.dart';
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
  bool _showAllParticipants = false;
  Map<String, dynamic>? _operation;
  List<Map<String, dynamic>> _participants = [];
  Map<String, FormationSnapshot> _snapshots = {};
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
    final userId = context.read<AuthProvider>().currentUser?.uid;

    final op = await fs
        .collection('clubs')
        .doc(clubId)
        .collection('operations')
        .doc(widget.operationId)
        .get();

    final participants = <Map<String, dynamic>>[];
    final rawParticipants = <Map<String, dynamic>>[];

    final inscriptionsSnap = await fs
        .collection('clubs')
        .doc(clubId)
        .collection('operations')
        .doc(widget.operationId)
        .collection('inscriptions')
        .get();

    if (inscriptionsSnap.docs.isNotEmpty) {
      rawParticipants.addAll(inscriptionsSnap.docs.map((doc) => doc.data()));
    } else {
      final participantsSnap = await fs
          .collection('clubs')
          .doc(clubId)
          .collection('participant_operation')
          .where('operation_id', isEqualTo: widget.operationId)
          .get();
      rawParticipants.addAll(participantsSnap.docs.map((doc) => doc.data()));
    }

    for (final p in rawParticipants) {
      final memberId = (p['membre_id'] ?? p['member_id'])?.toString();
      if (memberId == null || memberId.isEmpty) continue;
      try {
        final m = await fs
            .collection('clubs')
            .doc(clubId)
            .collection('members')
            .doc(memberId)
            .get();
        if (!m.exists) continue;
        final member = m.data() ?? {};
        participants.add({
          'member_id': memberId,
          'prenom': member['prenom'] ?? p['membre_prenom'] ?? '',
          'nom': member['nom'] ?? p['membre_nom'] ?? '',
          'plongeur_code': member['plongeur_code'] ?? '',
          'target_formation_level': member['target_formation_level'],
          'formation_active': member['formation_active'] == true,
          'requested_exercises':
              (p['requested_exercises'] as List?)?.cast<String>() ??
                  (p['exercices'] as List?)?.cast<String>() ??
                  const <String>[],
        });
      } catch (_) {/* skip */}
    }

    final snapshots = <String, FormationSnapshot>{};
    try {
      final service = FormationSnapshotService();
      snapshots.addAll(await service.getFormationSnapshots(
        clubId,
        participants
            .map((p) => FormationMemberInput(
                  memberId: p['member_id']?.toString() ?? '',
                  currentCode: p['plongeur_code']?.toString(),
                  targetFormationLevel: p['target_formation_level']?.toString(),
                ))
            .toList(),
      ));
    } catch (e) {
      debugPrint('⚠️ Snapshots formation indisponibles: $e');
    }

    final existingPalanqueeId = widget.palanqueeId ??
        (userId == null ? null : 'monitor_planning_$userId');
    if (existingPalanqueeId != null) {
      final pSnap = await fs
          .collection('clubs')
          .doc(clubId)
          .collection('operations')
          .doc(widget.operationId)
          .collection('palanquees')
          .doc(existingPalanqueeId)
          .get();
      final data = pSnap.data();
      if (pSnap.exists && data != null) {
        // Pre-fill assignments from existing palanquée
        final plannedRole =
            (data['planned_role'] as Map?)?.cast<String, dynamic>() ?? {};
        final plannedExercises =
            (data['planned_exercises'] as Map?)?.cast<String, dynamic>() ?? {};
        for (final p in participants) {
          final mid = p['member_id'] as String;
          _assignments[mid] = {
            'role': plannedRole[mid] ?? '',
            'exercises':
                (plannedExercises[mid] as List?)?.cast<String>() ?? <String>[],
            'note': '',
          };
        }
      }
    }

    setState(() {
      _operation = op.data();
      _participants = participants;
      _snapshots = snapshots;
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
                          const SizedBox(height: 10),
                          _filterCard(),
                          const SizedBox(height: 14),
                          if (_visibleParticipants.isEmpty)
                            Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.96),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: const Text(
                                'Aucun participant avec statut formation. Affiche tous les participants pour les voir.',
                                style: TextStyle(
                                  color: AppColors.donkerblauw,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ..._visibleParticipants.map((p) => Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: _ParticipantTile(
                                  participant: p,
                                  snapshot: _snapshots[p['member_id']],
                                  assignment: _assignments[p['member_id']] ??
                                      {
                                        'role': '',
                                        'exercises': <String>[],
                                        'note': ''
                                      },
                                  onChange: (a) => setState(
                                      () => _assignments[p['member_id']] = a),
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
                    child: CircularProgressIndicator(
                        color: Colors.white, strokeWidth: 2.4),
                  )
                : const Text('Sauvegarder le plan'),
          ),
        ),
      ),
    );
  }

  List<Map<String, dynamic>> get _formationParticipants => _participants
      .where((p) => p['formation_active'] == true)
      .toList(growable: false);

  List<Map<String, dynamic>> get _visibleParticipants =>
      _showAllParticipants ? _participants : _formationParticipants;

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
    final title =
        _operation?['titre'] ?? _operation?['title'] ?? widget.operationId;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
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
            '${_visibleParticipants.length}/${_participants.length} participants · ${_formationParticipants.length} en formation',
            style: TextStyle(
              color: AppColors.donkerblauw.withValues(alpha: 0.65),
              fontSize: 12.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _filterCard() {
    if (_participants.isEmpty) return const SizedBox.shrink();
    final allCount = _participants.length;
    final formationCount = _formationParticipants.length;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.school_outlined,
            color: AppColors.middenblauw,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$formationCount membre${formationCount > 1 ? 's' : ''} en formation',
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  'Par défaut, les autres participants sont masqués.',
                  style: TextStyle(
                    color: AppColors.donkerblauw.withValues(alpha: 0.62),
                    fontSize: 11.5,
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: () =>
                setState(() => _showAllParticipants = !_showAllParticipants),
            child: Text(
              _showAllParticipants ? 'Masquer' : 'Tous ($allCount)',
              style: const TextStyle(fontWeight: FontWeight.w800),
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
      final visibleMemberIds = _visibleParticipants
          .where((p) => p['formation_active'] == true)
          .map((p) => p['member_id']?.toString())
          .whereType<String>()
          .toSet();
      for (final entry in _assignments.entries) {
        if (!visibleMemberIds.contains(entry.key)) continue;
        if ((entry.value['role'] ?? '').isNotEmpty) {
          plannedRole[entry.key] = entry.value['role'];
        }
        final exs = entry.value['exercises'] as List<String>;
        if (exs.isNotEmpty) plannedExercises[entry.key] = exs;
        if ((entry.value['note'] ?? '').isNotEmpty) {
          note = '${note ?? ''}\n${entry.value['note']}'.trim();
        }
      }

      final fs = FirebaseFirestore.instance;
      final palCol = fs
          .collection('clubs')
          .doc(clubId)
          .collection('operations')
          .doc(widget.operationId)
          .collection('palanquees');

      final palanqueeId = widget.palanqueeId ?? 'monitor_planning_$userId';
      await palCol.doc(palanqueeId).set({
        'operation_id': widget.operationId,
        'planned_role': plannedRole,
        'planned_exercises': plannedExercises,
        'monitor_validator_id': userId,
        if (note != null && note.isNotEmpty) 'pedagogical_note': note,
        'updated_at': FieldValue.serverTimestamp(),
        if (widget.palanqueeId == null)
          'created_at': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Plan sauvegardé ✓')),
        );
        Navigator.of(context).pop(true);
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
  final FormationSnapshot? snapshot;
  final Map<String, dynamic> assignment;
  final ValueChanged<Map<String, dynamic>> onChange;

  const _ParticipantTile({
    required this.participant,
    required this.snapshot,
    required this.assignment,
    required this.onChange,
  });

  static const _roles = ['dp', 'sf'];
  static const _exerciseCodes = <String>[
    'P1.PB',
    'P1.VM',
    'P1.CA',
    'P2.DP',
    'P2.RA',
    'P2.ST',
    'P2.PB',
    'P3.OR',
    'P3.NX',
    'P3.PR',
  ];

  String _roleLabel(String key) {
    switch (key) {
      case 'dp':
        return 'DP';
      case 'sf':
        return 'SF';
      default:
        return key;
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = '${participant['prenom']} ${participant['nom']}'.trim();
    final level = participant['plongeur_code']?.toString() ?? '';
    final formationActive = participant['formation_active'] == true;
    final wishlist =
        (participant['requested_exercises'] as List?)?.cast<String>() ?? [];

    final selectedRole = (assignment['role'] ?? '') as String;
    final selectedExs = (assignment['exercises'] as List).cast<String>();
    final exerciseOptions = _exerciseOptions(
      snapshot: snapshot,
      requested: wishlist,
      selected: selectedExs,
    );

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
                child: InkWell(
                  onTap: snapshot == null
                      ? null
                      : () => _showSnapshotSheet(
                            context,
                            name.isEmpty
                                ? participant['member_id'].toString()
                                : name,
                            snapshot!,
                          ),
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                name.isEmpty ? participant['member_id'] : name,
                                style: const TextStyle(
                                  color: AppColors.donkerblauw,
                                  fontSize: 14.5,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                            if (snapshot != null) ...[
                              const SizedBox(width: 6),
                              const Icon(
                                Icons.info_outline,
                                size: 15,
                                color: AppColors.middenblauw,
                              ),
                            ],
                          ],
                        ),
                        if (level.isNotEmpty ||
                            snapshot?.targetLabel.isNotEmpty == true)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              [
                                if (level.isNotEmpty) level,
                                if (snapshot?.targetLabel.isNotEmpty == true)
                                  'objectif ${snapshot!.targetLabel}',
                              ].join(' · '),
                              style: TextStyle(
                                color: AppColors.donkerblauw
                                    .withValues(alpha: 0.65),
                                fontSize: 12,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              if (formationActive)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
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

          if (snapshot != null) ...[
            const SizedBox(height: 10),
            _SnapshotStrip(
              snapshot: snapshot!,
              experienceOnly: !formationActive,
              level: level,
            ),
          ],

          if (formationActive) ...[
          // Wishlist from inscription
          if (wishlist.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: wishlist
                  .map((c) => Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
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
            children: exerciseOptions.map((option) {
              final on = selectedExs.contains(option.code);
              return ChoiceChip(
                label: Text(
                  option.badge.isEmpty
                      ? option.code
                      : '${option.code} ${option.badge}',
                ),
                selected: on,
                onSelected: (sel) {
                  final next = Map<String, dynamic>.from(assignment);
                  final exs = List<String>.from(selectedExs);
                  if (sel) {
                    if (!exs.contains(option.code)) exs.add(option.code);
                  } else {
                    exs.remove(option.code);
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
        ],
      ),
    );
  }

  List<_ExerciseChoice> _exerciseOptions({
    required FormationSnapshot? snapshot,
    required List<String> requested,
    required List<String> selected,
  }) {
    final byCode = <String, _ExerciseChoice>{};

    void add(String code, {String label = '', String badge = ''}) {
      if (code.isEmpty || byCode.containsKey(code)) return;
      byCode[code] = _ExerciseChoice(code: code, label: label, badge: badge);
    }

    for (final ex in snapshot?.remainingExercises ?? const []) {
      add(ex.code, label: ex.description, badge: 'à faire');
    }
    for (final claim in snapshot?.pendingClaims ?? const []) {
      add(claim.exerciseCode,
          label: claim.exerciseLabel ?? '', badge: 'en attente');
    }
    for (final code in requested) {
      add(code, badge: 'souhait');
    }
    for (final code in selected) {
      add(code, badge: 'prévu');
    }
    if (byCode.isEmpty) {
      for (final code in _exerciseCodes) {
        add(code);
      }
    }
    return byCode.values.toList();
  }

  void _showSnapshotSheet(
    BuildContext context,
    String name,
    FormationSnapshot snapshot,
  ) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.72,
          minChildSize: 0.45,
          maxChildSize: 0.92,
          builder: (context, controller) {
            return ListView(
              controller: controller,
              padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
              children: [
                Center(
                  child: Container(
                    width: 42,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.black12,
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  name,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (snapshot.targetLabel.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(
                      'Objectif ${snapshot.targetLabel}',
                      style: TextStyle(
                        color: AppColors.donkerblauw.withValues(alpha: 0.65),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                const SizedBox(height: 14),
                _SnapshotStrip(snapshot: snapshot),
                const SizedBox(height: 16),
                _SheetSection(
                  title: 'Exercices restants',
                  emptyText: 'Aucun exercice restant connu pour cet objectif.',
                  children: snapshot.remainingExercises
                      .map((ex) => _SheetRow(
                            title: ex.code,
                            subtitle: ex.description,
                          ))
                      .toList(),
                ),
                _SheetSection(
                  title: 'En attente de validation',
                  emptyText: 'Rien en attente.',
                  children: [
                    ...snapshot.pendingExercises.map((ex) => _SheetRow(
                          title: ex.exerciceCode,
                          subtitle: ex.exerciceDescription,
                        )),
                    ...snapshot.pendingClaims.map((claim) => _SheetRow(
                          title: claim.exerciseCode,
                          subtitle: claim.exerciseLabel ?? claim.status,
                        )),
                  ],
                ),
                _SheetSection(
                  title: 'Dernières plongées',
                  emptyText: 'Aucune plongée hors piscine connue.',
                  children: snapshot.recentDives
                      .map((dive) => _SheetRow(
                            title: dive.locationName,
                            subtitle: [
                              if (dive.date != null)
                                _formatShortDate(dive.date!),
                              if (dive.depthMaxMeters != null)
                                '${dive.depthMaxMeters!.toStringAsFixed(0)} m',
                              if (dive.durationMinutes != null)
                                '${dive.durationMinutes} min',
                            ].join(' · '),
                          ))
                      .toList(),
                ),
                _SheetSection(
                  title: 'Validés récemment',
                  emptyText: 'Aucun exercice validé connu.',
                  children: snapshot.validatedExercises
                      .take(8)
                      .map((ex) => _SheetRow(
                            title: ex.exerciceCode,
                            subtitle: ex.exerciceDescription,
                          ))
                      .toList(),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

class _ExerciseChoice {
  final String code;
  final String label;
  final String badge;

  const _ExerciseChoice({
    required this.code,
    this.label = '',
    this.badge = '',
  });
}

class _SnapshotStrip extends StatelessWidget {
  final FormationSnapshot snapshot;
  final bool experienceOnly;
  final String level;

  const _SnapshotStrip({
    required this.snapshot,
    this.experienceOnly = false,
    this.level = '',
  });

  @override
  Widget build(BuildContext context) {
    final total = snapshot.counts.totalRequired;
    final progress = total == 0
        ? '—'
        : '${snapshot.counts.validated}/$total · ${((snapshot.counts.validated / total) * 100).round()}%';

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFEAF7FD),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFCDEDFB)),
      ),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          _MetricPill(
            icon: Icons.check_circle_outline,
            label: experienceOnly ? 'Niveau' : 'Progression',
            value: experienceOnly
                ? (level.isNotEmpty ? level : snapshot.currentCode)
                : progress,
          ),
          _MetricPill(
              icon: Icons.waves,
              label: 'Plongées',
              value: '${snapshot.diveStats.totalDives}'),
          _MetricPill(
              icon: Icons.water,
              label: 'Mer',
              value: '${snapshot.diveStats.seaDives}'),
          _MetricPill(
            icon: Icons.schedule,
            label: experienceOnly ? 'Prof. max' : 'En attente',
            value: experienceOnly
                ? (snapshot.diveStats.maxDepthMeters == null
                    ? '—'
                    : '${snapshot.diveStats.maxDepthMeters} m')
                : '${snapshot.counts.pending + snapshot.counts.pendingClaims}',
          ),
        ],
      ),
    );
  }
}

class _MetricPill extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _MetricPill({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 112),
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.82),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: AppColors.middenblauw),
          const SizedBox(width: 5),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  color: AppColors.donkerblauw.withValues(alpha: 0.62),
                  fontSize: 10.5,
                ),
              ),
              Text(
                value,
                style: const TextStyle(
                  color: AppColors.donkerblauw,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SheetSection extends StatelessWidget {
  final String title;
  final String emptyText;
  final List<Widget> children;

  const _SheetSection({
    required this.title,
    required this.emptyText,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: TextStyle(
              color: AppColors.donkerblauw.withValues(alpha: 0.62),
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.7,
            ),
          ),
          const SizedBox(height: 7),
          if (children.isEmpty)
            Text(
              emptyText,
              style: TextStyle(
                color: AppColors.donkerblauw.withValues(alpha: 0.55),
                fontStyle: FontStyle.italic,
              ),
            )
          else
            ...children,
        ],
      ),
    );
  }
}

class _SheetRow extends StatelessWidget {
  final String title;
  final String subtitle;

  const _SheetRow({
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF4F8FB),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: AppColors.middenblauw,
              fontWeight: FontWeight.w800,
            ),
          ),
          if (subtitle.isNotEmpty) ...[
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                subtitle,
                style: TextStyle(
                  color: AppColors.donkerblauw.withValues(alpha: 0.75),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

String _formatShortDate(DateTime date) {
  const months = [
    'janv.',
    'févr.',
    'mars',
    'avr.',
    'mai',
    'juin',
    'juil.',
    'août',
    'sept.',
    'oct.',
    'nov.',
    'déc.',
  ];
  return '${date.day} ${months[date.month - 1]}';
}
