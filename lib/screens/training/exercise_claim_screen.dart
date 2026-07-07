/// Carnet de Formation — confirmation native des claims pré-planifiés (WP-04).
///
/// Ouvert depuis une tâche `exercise_claim`. Liste les claims `draft` du membre
/// pour l'opération du contexte (`context.operation_id`) : chaque ligne =
/// exercice + moniteur pressenti + interrupteur garder/écarter + note libre.
/// « Soumettre » ⇒ batch `draft → submitted` pour les gardés (la CF
/// onClaimSubmitted crée ensuite la tâche de validation).
///
/// Repli : si `context.operation_id` est absent (anciennes tâches), on retombe
/// sur le formulaire web via le routeur (voir communication_hub_screen).
///
/// Spec : CARNET_PLONGEE_SPEC.md v3.0 §WP-04.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/formation_task.dart';
import '../../providers/auth_provider.dart';
import '../../services/exercise_claim_service.dart';
import '../../services/formation_task_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class ExerciseClaimScreen extends StatefulWidget {
  final FormationTask task;
  const ExerciseClaimScreen({super.key, required this.task});

  @override
  State<ExerciseClaimScreen> createState() => _ExerciseClaimScreenState();
}

class _ExerciseClaimScreenState extends State<ExerciseClaimScreen> {
  final ExerciseClaimService _claimService = ExerciseClaimService();
  final FormationTaskService _taskService = FormationTaskService();

  List<ExerciseClaimDraft> _drafts = [];
  final Map<String, bool> _kept = {};
  final Map<String, TextEditingController> _notes = {};
  bool _loading = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in _notes.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final operationId = widget.task.context.operationId;
    final userId = context.read<AuthProvider>().currentUser?.uid;
    if (operationId == null || userId == null) {
      setState(() => _loading = false);
      return;
    }
    const clubId = FirebaseConfig.defaultClubId;
    final drafts =
        await _claimService.fetchDraftsForOperation(clubId, userId, operationId);
    if (!mounted) return;
    setState(() {
      _drafts = drafts;
      for (final d in drafts) {
        _kept[d.id] = true;
        _notes[d.id] = TextEditingController();
      }
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final keyboardInset = MediaQuery.viewInsetsOf(context).bottom;
    final keptCount = _kept.values.where((v) => v).length;

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
                        child: CircularProgressIndicator(color: Colors.white))
                    : _drafts.isEmpty
                        ? _empty()
                        : _body(),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: _loading || _drafts.isEmpty
          ? null
          : AnimatedPadding(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              padding: EdgeInsets.only(bottom: keyboardInset),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  child: ElevatedButton.icon(
                    onPressed:
                        _submitting || keptCount == 0 ? null : _submit,
                    icon: const Icon(Icons.send),
                    label: Text(
                      keptCount == 0
                          ? 'Sélectionne au moins un exercice'
                          : 'Soumettre ($keptCount)',
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF006DB6),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      minimumSize: const Size.fromHeight(48),
                    ),
                  ),
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
                  'Exercices à confirmer',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  'Garde ceux que tu as réellement faits',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _empty() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.inbox_outlined, color: Colors.white70, size: 48),
            const SizedBox(height: 12),
            const Text(
              'Aucun exercice pré-planifié',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            const Text(
              'Tu peux déclarer un exercice depuis ton carnet après la plongée.',
              style: TextStyle(color: Colors.white70, fontSize: 13),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: () => Navigator.pop(context),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: const BorderSide(color: Colors.white70),
              ),
              child: const Text('Retour'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      itemCount: _drafts.length,
      itemBuilder: (context, i) {
        final d = _drafts[i];
        final kept = _kept[d.id] ?? true;
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: kept ? 0.98 : 0.6),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: kept ? const Color(0xFFB8E2BC) : Colors.transparent,
            ),
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
                          d.exerciseCode,
                          style: const TextStyle(
                            color: AppColors.donkerblauw,
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        if (d.exerciseLabel != null &&
                            d.exerciseLabel!.isNotEmpty)
                          Text(
                            d.exerciseLabel!,
                            style: TextStyle(
                              color:
                                  AppColors.donkerblauw.withValues(alpha: 0.7),
                              fontSize: 13,
                            ),
                          ),
                        if (d.monitorName != null && d.monitorName!.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              'Moniteur : ${d.monitorName}',
                              style: TextStyle(
                                color: AppColors.donkerblauw
                                    .withValues(alpha: 0.6),
                                fontSize: 12,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  Switch(
                    value: kept,
                    activeThumbColor: const Color(0xFF4CAF50),
                    onChanged: (v) => setState(() => _kept[d.id] = v),
                  ),
                ],
              ),
              if (kept)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: TextField(
                    controller: _notes[d.id],
                    maxLines: 2,
                    style: const TextStyle(fontSize: 13),
                    decoration: InputDecoration(
                      isDense: true,
                      hintText: 'Note pour le moniteur (optionnel)',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _submit() async {
    final userId = context.read<AuthProvider>().currentUser?.uid;
    if (userId == null) return;
    setState(() => _submitting = true);
    try {
      const clubId = FirebaseConfig.defaultClubId;
      final keptIds =
          _drafts.map((d) => d.id).where((id) => _kept[id] ?? false).toList();
      final notes = <String, String>{};
      for (final id in keptIds) {
        final t = _notes[id]?.text ?? '';
        if (t.trim().isNotEmpty) notes[id] = t.trim();
      }

      await _claimService.submitClaims(clubId, keptIds, notes: notes);
      await _taskService.markDone(
        clubId,
        widget.task.id,
        userId,
        completionData: {'claim_ids': keptIds},
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              keptIds.isEmpty
                  ? 'Aucun exercice soumis'
                  : '${keptIds.length} exercice(s) soumis ✓',
            ),
          ),
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
      if (mounted) setState(() => _submitting = false);
    }
  }
}
