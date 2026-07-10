import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/firebase_config.dart';
import '../../models/formation_task.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/exercise_claim_service.dart';
import '../../services/formation_task_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

/// Native fallback for legacy `exercise_claim` tasks without operation_id.
class ManualExerciseClaimScreen extends StatefulWidget {
  final FormationTask task;

  const ManualExerciseClaimScreen({super.key, required this.task});

  @override
  State<ManualExerciseClaimScreen> createState() =>
      _ManualExerciseClaimScreenState();
}

class _ManualExerciseClaimScreenState extends State<ManualExerciseClaimScreen> {
  static const _exercises = <(String, String, String)>[
    ('P1.PB', 'Palmage en surface', '1*'),
    ('P1.VM', 'Vidage de masque', '1*'),
    ('P1.CA', 'Capelé / décapelé en surface', '1*'),
    ('P2.DP', 'Démasquage profond', '2*'),
    ('P2.RA', 'Remontée assistée', '2*'),
    ('P2.ST', 'Stabilisation à mi-eau', '2*'),
    ('P2.PB', 'Palmage de sauvetage', '2*'),
    ('P3.OR', 'Orientation sans instrument', '3*'),
    ('P3.NX', 'Plongée nitrox', '3*'),
  ];

  final TextEditingController _notes = TextEditingController();
  String? _selectedCode;
  bool _submitting = false;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final target = widget.task.context.targetGroupLevel
        ?.replaceFirst(RegExp(r'^Formation\s*', caseSensitive: false), '')
        .trim();
    final choices = target == null || target.isEmpty
        ? _exercises
        : _exercises.where((exercise) => exercise.$3 == target).toList();

    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              Padding(
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
                          const Text('Déclaration manuelle',
                              style: TextStyle(
                                  color: Colors.white70, fontSize: 12)),
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
              ),
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
                          const Text(
                            'Quel exercice as-tu réalisé ?',
                            style: TextStyle(
                                fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 12),
                          RadioGroup<String>(
                            groupValue: _selectedCode,
                            onChanged: _submitting
                                ? (_) {}
                                : (value) =>
                                    setState(() => _selectedCode = value),
                            child: Column(
                              children: choices
                                  .map((exercise) => RadioListTile<String>(
                                        value: exercise.$1,
                                        dense: true,
                                        contentPadding: EdgeInsets.zero,
                                        title: Text(exercise.$1,
                                            style: const TextStyle(
                                                fontWeight: FontWeight.w700)),
                                        subtitle: Text(exercise.$2),
                                      ))
                                  .toList(),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _notes,
                      maxLines: 3,
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: Colors.white,
                        hintText:
                            'Contexte ou note pour le moniteur (optionnel)',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    ElevatedButton.icon(
                      onPressed:
                          _selectedCode == null || _submitting ? null : _submit,
                      icon: const Icon(Icons.send),
                      label: Text(
                          _submitting ? 'Envoi…' : 'Envoyer pour validation'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF006DB6),
                        foregroundColor: Colors.white,
                        minimumSize: const Size.fromHeight(48),
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

  Future<void> _submit() async {
    final userId = context.read<AuthProvider>().currentUser?.uid;
    final member = context.read<MemberProvider>();
    final selected = _exercises.firstWhere((e) => e.$1 == _selectedCode);
    if (userId == null) return;

    setState(() => _submitting = true);
    try {
      const clubId = FirebaseConfig.defaultClubId;
      final claimId = await ExerciseClaimService().createSelfDeclarationClaim(
        clubId: clubId,
        memberId: userId,
        declaredBy: userId,
        memberName: '${member.prenom ?? ''} ${member.nom ?? ''}'.trim(),
        exerciseCode: selected.$1,
        exerciseLabel: selected.$2,
        notes: _notes.text,
      );
      await FormationTaskService().markDone(
        clubId,
        widget.task.id,
        userId,
        completionData: {
          'exercise_claim_id': claimId,
          'exercise_code': selected.$1,
        },
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Déclaration envoyée pour validation ✓')),
      );
      Navigator.of(context).pop();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Impossible d\'envoyer : $error')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}
