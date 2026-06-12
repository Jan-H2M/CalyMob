/// Carnet de Formation — Monitor validation screen.
///
/// Opened by a monitor from their inbox when a student declared an exercise
/// and picked them as validator. Shows the claim context, lets the monitor
/// confirm / correct / reject with one tap.
///
/// On accept : sets claim status to 'accepted' — the onClaimAccepted Cloud
/// Function then writes the official member_observation server-side.
///
/// Spec : `CARNET_DE_FORMATION_TECH.md` v2.1 §11 (mockup 04 monitor pane).

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

class MonitorValidationScreen extends StatefulWidget {
  final FormationTask task;
  const MonitorValidationScreen({super.key, required this.task});

  @override
  State<MonitorValidationScreen> createState() =>
      _MonitorValidationScreenState();
}

class _MonitorValidationScreenState extends State<MonitorValidationScreen> {
  final FormationTaskService _taskService = FormationTaskService();
  Map<String, dynamic>? _claim;
  bool _loading = true;
  bool _submitting = false;
  final TextEditingController _comment = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _comment.dispose();
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
                              'Claim non trouvée',
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
                        onPressed:
                            _submitting ? null : () => _decide('accepted'),
                        icon: const Icon(Icons.check_circle),
                        label: const Text('Confirmer comme acquis'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF4CAF50),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          minimumSize: const Size.fromHeight(48),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: _submitting
                                  ? null
                                  : () => _decide('corrected'),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: Colors.white,
                                side: const BorderSide(color: Colors.white),
                                padding:
                                    const EdgeInsets.symmetric(vertical: 14),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              child: const Text('En progrès'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton(
                              onPressed: _submitting
                                  ? null
                                  : () => _decide('rejected'),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: const Color(0xFFE5484D),
                                side:
                                    const BorderSide(color: Color(0xFFE5484D)),
                                padding:
                                    const EdgeInsets.symmetric(vertical: 14),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              child: const Text('Refuser'),
                            ),
                          ),
                        ],
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
                  'Validation à confirmer',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  'Tu es désigné·e comme validateur',
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
    final memberName = c['member_name'] ?? c['member_id'] ?? 'Élève';
    final exerciseCode = c['exercise_code'] ?? c['exercise_id'] ?? '';
    final exerciseLabel = c['exercise_label'] ?? '';
    final context = c['context_type'] == 'pool' ? 'Piscine' : 'Sortie';
    final notes = c['declaration_notes'] ?? '';

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        // Top context card
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFB8E2BC)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'DEMANDE DE $memberName'.toUpperCase(),
                style: const TextStyle(
                  color: Color(0xFF2E7D32),
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
              const SizedBox(height: 6),
              Text(
                '$context · ${_formatContextRef(c)}',
                style: TextStyle(
                  color: AppColors.donkerblauw.withValues(alpha: 0.65),
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
        if (notes.toString().isNotEmpty) ...[
          const SizedBox(height: 14),
          _sectionTitle('NOTE DE L\'ÉLÈVE'),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.96),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(
              '« $notes »',
              style: TextStyle(
                color: AppColors.donkerblauw.withValues(alpha: 0.85),
                fontSize: 13.5,
                fontStyle: FontStyle.italic,
              ),
            ),
          ),
        ],
        const SizedBox(height: 14),
        _sectionTitle('TON COMMENTAIRE (optionnel)'),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.96),
            borderRadius: BorderRadius.circular(14),
          ),
          child: TextField(
            controller: _comment,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText: 'Ex: « Excellent contrôle de la palanquée »',
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

  String _formatContextRef(Map<String, dynamic> c) {
    return c['operation_id'] ?? c['pool_session_id'] ?? '—';
  }

  Future<void> _decide(String newStatus) async {
    if (_claim == null) return;
    setState(() => _submitting = true);
    try {
      final auth = context.read<AuthProvider>();
      final memberProvider = context.read<MemberProvider>();
      final userId = auth.currentUser?.uid;
      if (userId == null) throw 'Session non identifiée';

      const clubId = FirebaseConfig.defaultClubId;
      final claimId = widget.task.context.exerciseClaimId!;

      final decidedByName =
          '${memberProvider.prenom ?? ''} ${memberProvider.nom ?? ''}'.trim();

      await FirebaseFirestore.instance
          .collection('clubs')
          .doc(clubId)
          .collection('exercise_claims')
          .doc(claimId)
          .update({
        'status': newStatus,
        'decision': {
          'decided_by': userId,
          'decided_by_name': decidedByName,
          'decided_at': FieldValue.serverTimestamp(),
          'comment': _comment.text.isEmpty ? null : _comment.text,
        },
        'updated_at': FieldValue.serverTimestamp(),
      });

      // The Cloud Function onClaimAccepted handles the rest if accepted.
      // We still want to resolve the validation task locally for non-accepted
      // outcomes (no CF picks them up).
      if (newStatus != 'accepted') {
        await _taskService.markCompleted(clubId, widget.task.id, userId);
      }

      if (mounted) {
        final label = newStatus == 'accepted'
            ? 'Acquis ✓'
            : newStatus == 'corrected'
                ? 'En progrès'
                : 'Refusé';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(label)),
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
