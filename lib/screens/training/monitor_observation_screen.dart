/// Carnet de Formation — post-pool monitor observation.
///
/// Opens from the Communication action inbox for `monitor_observation` tasks.
/// Saving marks the task as done with `completion_data`; the
/// `onMonitorObservationCompleted` Cloud Function materialises the permanent
/// member_observations record.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/formation_task.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/formation_task_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class MonitorObservationScreen extends StatefulWidget {
  final FormationTask task;

  const MonitorObservationScreen({super.key, required this.task});

  @override
  State<MonitorObservationScreen> createState() =>
      _MonitorObservationScreenState();
}

class _MonitorObservationScreenState extends State<MonitorObservationScreen> {
  final FormationTaskService _taskService = FormationTaskService();
  final TextEditingController _comment = TextEditingController();
  String? _verdict;
  bool _submitting = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = widget.task.context.themeSnapshot ??
        widget.task.context.groupKey ??
        widget.task.context.targetGroupLevel ??
        widget.task.context.poolSessionId ??
        'Séance piscine';

    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _header(),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  children: [
                    _contextCard(theme),
                    const SizedBox(height: 14),
                    _sectionTitle('TON VERDICT'),
                    _verdictGrid(),
                    const SizedBox(height: 14),
                    _sectionTitle('COMMENTAIRE PEDAGOGIQUE'),
                    _commentBox(),
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
              ElevatedButton.icon(
                onPressed:
                    _submitting || _verdict == null ? null : _saveObservation,
                icon: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.check_circle),
                label: Text(_submitting
                    ? 'Enregistrement...'
                    : 'Enregistrer l\'évaluation'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0EA5E9),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  minimumSize: const Size.fromHeight(48),
                ),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: _submitting ? null : () => Navigator.pop(context),
                child: const Text(
                  'Plus tard',
                  style: TextStyle(color: Colors.white),
                ),
              ),
            ],
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
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Évaluer ${widget.task.memberName ?? 'un élève'}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const Text(
                  'Observation post-piscine',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _contextCard(String theme) {
    final c = widget.task.context;
    return Container(
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
            (widget.task.memberName ?? 'Élève').toUpperCase(),
            style: const TextStyle(
              color: Color(0xFF2E7D32),
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            theme,
            style: const TextStyle(
              color: AppColors.donkerblauw,
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            [
              if (c.poolSessionId != null) 'Piscine ${c.poolSessionId}',
              if (c.operationTitle != null) c.operationTitle,
            ].whereType<String>().join(' · ').isEmpty
                ? 'Séance de formation'
                : [
                    if (c.poolSessionId != null) 'Piscine ${c.poolSessionId}',
                    if (c.operationTitle != null) c.operationTitle,
                  ].whereType<String>().join(' · '),
            style: TextStyle(
              color: AppColors.donkerblauw.withValues(alpha: 0.65),
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }

  Widget _verdictGrid() {
    return Column(
      children: [
        _verdictButton(
          value: 'acquis',
          label: 'Acquis',
          icon: Icons.check_circle,
          color: const Color(0xFF16A34A),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _verdictButton(
                value: 'en_progres',
                label: 'En progrès',
                icon: Icons.trending_up,
                color: const Color(0xFFF59E0B),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _verdictButton(
                value: 'a_revoir',
                label: 'À revoir',
                icon: Icons.refresh,
                color: const Color(0xFFE5484D),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _verdictButton({
    required String value,
    required String label,
    required IconData icon,
    required Color color,
  }) {
    final selected = _verdict == value;
    return OutlinedButton.icon(
      onPressed: _submitting ? null : () => setState(() => _verdict = value),
      icon: Icon(icon),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        backgroundColor: selected ? color : Colors.white.withValues(alpha: 0.96),
        foregroundColor: selected ? Colors.white : color,
        side: BorderSide(color: color, width: selected ? 2 : 1),
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  Widget _commentBox() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
      ),
      child: TextField(
        controller: _comment,
        maxLines: 4,
        decoration: const InputDecoration(
          hintText: 'Points forts, conseils, axe de progression...',
          border: InputBorder.none,
        ),
      ),
    );
  }

  Widget _sectionTitle(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6, left: 2),
        child: Text(
          text,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.85),
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.2,
          ),
        ),
      );

  Future<void> _saveObservation() async {
    final verdict = _verdict;
    if (verdict == null) return;
    setState(() => _submitting = true);
    try {
      final auth = context.read<AuthProvider>();
      final memberProvider = context.read<MemberProvider>();
      final userId = auth.currentUser?.uid;
      if (userId == null) throw 'Session non identifiée';

      final observerName =
          '${memberProvider.prenom ?? ''} ${memberProvider.nom ?? ''}'.trim();

      await _taskService.markDone(
        FirebaseConfig.defaultClubId,
        widget.task.id,
        userId,
        completionData: {
          'verdict': verdict,
          'pool_session_id': widget.task.context.poolSessionId,
          'group_key':
              widget.task.context.groupKey ?? widget.task.context.targetGroupLevel,
          'theme_snapshot': widget.task.context.themeSnapshot,
          'member_id': widget.task.memberId,
          'observer_id': userId,
          'observer_name': observerName,
          if (_comment.text.trim().isNotEmpty) 'comment': _comment.text.trim(),
        },
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Évaluation enregistrée')),
      );
      Navigator.of(context).pop();
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
