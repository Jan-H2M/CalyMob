/// Carnet de Formation — écran de re-soumission d'un exercice refusé (WP-02).
///
/// Ouvert depuis une tâche `claim_rejected`. Affiche le contexte du claim + la
/// raison du refus, puis laisse l'élève :
///   - « Re-soumettre » : status='submitted', retry_count+1 → la CF
///     onClaimResubmitted recrée une tâche de validation chez le moniteur.
///   - « Abandonner » : status='abandoned', la tâche se ferme.
///
/// Re-soumission illimitée (décision D2).
///
/// Spec : CARNET_PLONGEE_SPEC.md v3.0 §WP-02.

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/formation_task.dart';
import '../../providers/auth_provider.dart';
import '../../services/exercise_claim_service.dart';
import '../../services/formation_task_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class ExerciseClaimRetryScreen extends StatefulWidget {
  final FormationTask task;
  const ExerciseClaimRetryScreen({super.key, required this.task});

  @override
  State<ExerciseClaimRetryScreen> createState() =>
      _ExerciseClaimRetryScreenState();
}

class _ExerciseClaimRetryScreenState extends State<ExerciseClaimRetryScreen> {
  final FormationTaskService _taskService = FormationTaskService();
  final ExerciseClaimService _claimService = ExerciseClaimService();
  Map<String, dynamic>? _claim;
  bool _loading = true;
  bool _submitting = false;
  final TextEditingController _note = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final claimId = widget.task.context.exerciseClaimId;
    if (claimId == null) {
      setState(() => _loading = false);
      return;
    }
    const clubId = FirebaseConfig.defaultClubId;
    final snap = await FirebaseFirestore.instance
        .collection('clubs')
        .doc(clubId)
        .collection('exercise_claims')
        .doc(claimId)
        .get();
    setState(() {
      _claim = snap.data();
      _loading = false;
    });
  }

  String get _rejectedReason {
    final fromClaim = _claim?['decision']?['rejected_reason'] ??
        _claim?['decision']?['comment'];
    final reason = fromClaim ?? widget.task.context.rejectedReason ?? '';
    return reason.toString();
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
              _header(),
              Expanded(
                child: _loading
                    ? const Center(
                        child: CircularProgressIndicator(color: Colors.white))
                    : _claim == null
                        ? const Center(
                            child: Text(
                              'Exercice introuvable',
                              style: TextStyle(color: Colors.white),
                            ),
                          )
                        : _body(),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: _loading || _claim == null
          ? null
          : AnimatedPadding(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              padding: EdgeInsets.only(bottom: keyboardInset),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ElevatedButton.icon(
                        onPressed: _submitting ? null : _resubmit,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Re-soumettre'),
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
                      const SizedBox(height: 8),
                      OutlinedButton(
                        onPressed: _submitting ? null : _confirmAbandon,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: Colors.white70),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          minimumSize: const Size.fromHeight(48),
                        ),
                        child: const Text('Abandonner cet exercice'),
                      ),
                    ],
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
                  'Exercice à corriger',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  'Corrige puis re-soumets à ton moniteur',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _body() {
    final c = _claim!;
    final exerciseCode = c['exercise_code'] ?? c['exercise_id'] ?? '';
    final exerciseLabel = c['exercise_label'] ?? '';
    final reason = _rejectedReason;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        // Exercise card
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFFAB7B9)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'EXERCICE REFUSÉ',
                style: TextStyle(
                  color: Color(0xFFE5484D),
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.1,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                exerciseCode,
                style: const TextStyle(
                  color: AppColors.donkerblauw,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (exerciseLabel.toString().isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    exerciseLabel,
                    style: TextStyle(
                      color: AppColors.donkerblauw.withValues(alpha: 0.7),
                      fontSize: 13,
                    ),
                  ),
                ),
            ],
          ),
        ),
        if (reason.isNotEmpty) ...[
          const SizedBox(height: 14),
          _sectionTitle('RAISON DU REFUS'),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFFFDECEC),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFFAB7B9)),
            ),
            child: Text(
              '« $reason »',
              style: const TextStyle(
                color: Color(0xFF8A2A2D),
                fontSize: 13.5,
                fontStyle: FontStyle.italic,
              ),
            ),
          ),
        ],
        const SizedBox(height: 14),
        _sectionTitle('UN MOT POUR TON MONITEUR (optionnel)'),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.96),
            borderRadius: BorderRadius.circular(14),
          ),
          child: TextField(
            controller: _note,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText: 'Ex: « J\'ai retravaillé le contrôle de vitesse »',
              border: InputBorder.none,
            ),
          ),
        ),
      ],
    );
  }

  Widget _sectionTitle(String s) => Padding(
        padding: const EdgeInsets.only(bottom: 6, left: 2),
        child: Text(
          s,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.85),
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.2,
          ),
        ),
      );

  Future<void> _resubmit() async {
    if (_claim == null) return;
    setState(() => _submitting = true);
    try {
      final userId = context.read<AuthProvider>().currentUser?.uid;
      if (userId == null) throw 'Session non identifiée';

      const clubId = FirebaseConfig.defaultClubId;
      final claimId = widget.task.context.exerciseClaimId!;
      final currentRetry = (_claim!['retry_count'] as num?)?.toInt() ?? 0;

      await _claimService.resubmitRejectedClaim(
        clubId,
        claimId,
        currentRetry: currentRetry,
        note: _note.text,
      );

      // Close the claim_rejected task (the CF also does this as a safety net).
      await _taskService.markDone(clubId, widget.task.id, userId);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Re-soumis à ton moniteur ✓')),
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

  Future<void> _confirmAbandon() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Abandonner cet exercice ?'),
        content: const Text(
          'Il ne sera plus soumis à validation. Tu pourras toujours le '
          'redéclarer plus tard.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFE5484D),
              foregroundColor: Colors.white,
            ),
            child: const Text('Abandonner'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await _abandon();
  }

  Future<void> _abandon() async {
    if (_claim == null) return;
    setState(() => _submitting = true);
    try {
      final userId = context.read<AuthProvider>().currentUser?.uid;
      if (userId == null) throw 'Session non identifiée';

      const clubId = FirebaseConfig.defaultClubId;
      final claimId = widget.task.context.exerciseClaimId!;

      await FirebaseFirestore.instance
          .collection('clubs')
          .doc(clubId)
          .collection('exercise_claims')
          .doc(claimId)
          .update({
        'status': 'abandoned',
        'updated_at': FieldValue.serverTimestamp(),
      });

      await _taskService.markDone(clubId, widget.task.id, userId);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Exercice abandonné')),
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
