import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/formation_task.dart';
import '../../providers/auth_provider.dart';
import '../../services/formation_task_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

/// Native catch-all for actionable Formation reminders.
///
/// This deliberately lives in CalyMob: a member must never be sent to the
/// retired CalyCompta `/me/*` area to finish a personal action.
class FormationTaskDetailScreen extends StatefulWidget {
  final FormationTask task;
  final String? missingContextMessage;

  const FormationTaskDetailScreen({
    super.key,
    required this.task,
    this.missingContextMessage,
  });

  @override
  State<FormationTaskDetailScreen> createState() =>
      _FormationTaskDetailScreenState();
}

class _FormationTaskDetailScreenState extends State<FormationTaskDetailScreen> {
  final FormationTaskService _service = FormationTaskService();
  final TextEditingController _reaction = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _reaction.dispose();
    super.dispose();
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
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (widget.task.description?.trim().isNotEmpty ==
                              true)
                            Text(
                              widget.task.description!.trim(),
                              style: const TextStyle(
                                color: AppColors.donkerblauw,
                                height: 1.4,
                              ),
                            ),
                          if (widget.missingContextMessage != null) ...[
                            if (widget.task.description?.trim().isNotEmpty ==
                                true)
                              const SizedBox(height: 12),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Icon(Icons.info_outline,
                                    color: Color(0xFFE08A00)),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    widget.missingContextMessage!,
                                    style: const TextStyle(
                                      color: Color(0xFF7A4A00),
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                          if (widget.task.description?.trim().isNotEmpty !=
                                  true &&
                              widget.missingContextMessage == null)
                            const Text(
                              'Cette action ne contient pas de détail supplémentaire.',
                              style: TextStyle(color: AppColors.donkerblauw),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _reaction,
                      maxLines: 3,
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: Colors.white,
                        hintText: 'Ajouter une réponse (optionnel)',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    ElevatedButton.icon(
                      onPressed: _submitting ? null : _complete,
                      icon: const Icon(Icons.check_circle_outline),
                      label: const Text('Fait'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF16834B),
                        foregroundColor: Colors.white,
                        minimumSize: const Size.fromHeight(48),
                      ),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _submitting ? null : _snooze,
                      icon: const Icon(Icons.schedule),
                      label: const Text('Plus tard (24 h)'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.white70),
                        minimumSize: const Size.fromHeight(46),
                      ),
                    ),
                    TextButton(
                      onPressed: _submitting ? null : _dismiss,
                      child: const Text(
                        'Pas concerné',
                        style: TextStyle(color: Colors.white70),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header() => Padding(
        padding: const EdgeInsets.fromLTRB(8, 12, 16, 12),
        child: Row(
          children: [
            IconButton(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.arrow_back, color: Colors.white),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Action CalyMob',
                    style: TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                  Text(
                    widget.task.title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );

  Future<void> _complete() async {
    await _run((clubId, userId) => _service.markDone(
          clubId,
          widget.task.id,
          userId,
          completionData: {
            if (_reaction.text.trim().isNotEmpty)
              'reaction_text': _reaction.text.trim(),
          },
        ));
  }

  Future<void> _snooze() async {
    await _run((clubId, _) => _service.snooze(
          clubId,
          widget.task.id,
          DateTime.now().add(const Duration(hours: 24)),
        ));
  }

  Future<void> _dismiss() async {
    await _run(
        (clubId, userId) => _service.dismiss(clubId, widget.task.id, userId));
  }

  Future<void> _run(
    Future<void> Function(String clubId, String userId) action,
  ) async {
    final userId = context.read<AuthProvider>().currentUser?.uid;
    if (userId == null) return;
    setState(() => _submitting = true);
    try {
      await action(FirebaseConfig.defaultClubId, userId);
      if (!mounted) return;
      Navigator.of(context).pop();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Impossible d\'enregistrer : $error')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}
