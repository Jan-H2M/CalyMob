import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../models/formation_snapshot_doc.dart';
import '../../providers/auth_provider.dart';
import '../../services/formation_goals_service.dart';
import '../../services/formation_snapshot_reader.dart';
import '../../widgets/ocean_background.dart';

/// WP-11 — « Mes objectifs ».
///
/// Écran self-service : l'élève marque les exercices qu'il veut travailler
/// (⭐), ceux qu'il trouve difficiles, ceux à refaire, une note, ses
/// disponibilités et son brevet visé. Le moniteur les voit en lecture seule
/// (fiche 360°). La liste des exercices restants vient du snapshot (WP-09).
class MyGoalsScreen extends StatefulWidget {
  const MyGoalsScreen({super.key});

  @override
  State<MyGoalsScreen> createState() => _MyGoalsScreenState();
}

class _MyGoalsScreenState extends State<MyGoalsScreen> {
  final String _clubId = 'calypso';
  final FormationGoalsService _goalsService = FormationGoalsService();
  final FormationSnapshotReader _reader = FormationSnapshotReader();
  final TextEditingController _noteController = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  String _memberId = '';

  FormationSnapshotDoc? _snapshot;
  final Set<String> _codes = {};
  final Set<String> _difficult = {};
  final Set<String> _redo = {};
  FormationGoalsAvailability _availability = const FormationGoalsAvailability();
  String? _targetLevel;

  static const List<String> _brevets = ['1*', '2*', '3*', '4*', 'AM', 'MC'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final uid = context.read<AuthProvider>().currentUser?.uid ?? '';
    if (uid.isEmpty) {
      setState(() => _loading = false);
      return;
    }
    _memberId = uid;
    final snapshot = await _reader.getSnapshot(_clubId, uid);
    final goals = await _goalsService.getGoals(_clubId, uid);
    if (!mounted) return;
    setState(() {
      _snapshot = snapshot;
      _codes
        ..clear()
        ..addAll(goals.codes);
      _difficult
        ..clear()
        ..addAll(goals.difficultCodes);
      _redo
        ..clear()
        ..addAll(goals.redoCodes);
      _availability = goals.availability;
      _noteController.text = goals.note;
      _targetLevel = snapshot?.targetLevel;
      _loading = false;
    });
  }

  Future<void> _save() async {
    if (_memberId.isEmpty) return;
    setState(() => _saving = true);
    try {
      await _goalsService.saveGoals(
        _clubId,
        _memberId,
        FormationGoals(
          codes: _codes.toList(),
          difficultCodes: _difficult.toList(),
          redoCodes: _redo.toList(),
          note: _noteController.text.trim(),
          availability: _availability,
        ),
      );
      // Brevet visé : reste le champ moteur `target_formation_level`.
      if (_targetLevel != null && _targetLevel != _snapshot?.targetLevel) {
        await FirebaseFirestore.instance
            .collection('clubs')
            .doc(_clubId)
            .collection('members')
            .doc(_memberId)
            .set({'target_formation_level': _targetLevel}, SetOptions(merge: true));
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Objectifs enregistrés'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text('Mes objectifs',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: OceanBackground(
        child: SafeArea(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: Colors.white))
              : _buildBody(),
        ),
      ),
      floatingActionButton: _loading
          ? null
          : FloatingActionButton.extended(
              onPressed: _saving ? null : _save,
              backgroundColor: AppColors.lichtblauw,
              icon: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.save, color: Colors.white),
              label: const Text('Enregistrer',
                  style: TextStyle(color: Colors.white)),
            ),
    );
  }

  Widget _buildBody() {
    final remaining = _snapshot?.remaining ?? const <SnapshotExercise>[];
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 90),
      children: [
        _card('Brevet visé', [
          Wrap(
            spacing: 8,
            children: _brevets.map((b) {
              final active = _targetLevel == b;
              return ChoiceChip(
                label: Text(b),
                selected: active,
                onSelected: (_) => setState(() => _targetLevel = b),
                selectedColor: AppColors.lichtblauw,
                labelStyle: TextStyle(
                    color: active ? Colors.white : AppColors.donkerblauw,
                    fontWeight: FontWeight.w600),
              );
            }).toList(),
          ),
          const SizedBox(height: 6),
          Text(
            'Modifier ton brevet visé prévient le chef d\'école.',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 12),
          ),
        ]),
        _card('Mes disponibilités', [
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              _availChip('Profonde', _availability.profonde,
                  (v) => _availability = _availability.copyWith(profonde: v)),
              _availChip('Nuit', _availability.nuit,
                  (v) => _availability = _availability.copyWith(nuit: v)),
              _availChip('DP', _availability.dp,
                  (v) => _availability = _availability.copyWith(dp: v)),
              _availChip('S.F.', _availability.sf,
                  (v) => _availability = _availability.copyWith(sf: v)),
              _availChip('Mer', _availability.mer,
                  (v) => _availability = _availability.copyWith(mer: v)),
              _availChip('Eau douce', _availability.eauDouce,
                  (v) => _availability = _availability.copyWith(eauDouce: v)),
            ],
          ),
        ]),
        _card('Note pour le moniteur', [
          TextField(
            controller: _noteController,
            maxLines: 3,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Ex : stress à la VM sans visibilité…',
              hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.5)),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.1),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
        ]),
        _card('Exercices à travailler (${remaining.length} restants)', [
          if (remaining.isEmpty)
            Text('Aucun exercice restant pour ton objectif.',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.7)))
          else
            ...remaining.map(_exerciseTile),
        ]),
      ],
    );
  }

  Widget _availChip(String label, bool active, void Function(bool) onChange) {
    return FilterChip(
      label: Text(label),
      selected: active,
      onSelected: (v) => setState(() => onChange(v)),
      selectedColor: AppColors.lichtblauw,
      backgroundColor: Colors.white.withValues(alpha: 0.12),
      labelStyle: TextStyle(
          color: active ? Colors.white : Colors.white,
          fontWeight: FontWeight.w600),
      checkmarkColor: Colors.white,
    );
  }

  Widget _exerciseTile(SnapshotExercise ex) {
    final isGoal = _codes.contains(ex.code);
    final isDifficult = _difficult.contains(ex.code);
    final isRedo = _redo.contains(ex.code);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          IconButton(
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
            icon: Icon(isGoal ? Icons.star : Icons.star_border,
                color: isGoal ? Colors.amberAccent : Colors.white70),
            tooltip: 'Objectif',
            onPressed: () => setState(() {
              if (isGoal) {
                _codes.remove(ex.code);
              } else {
                _codes.add(ex.code);
              }
            }),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(ex.code,
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w700)),
                if (ex.description.isNotEmpty)
                  Text(ex.description,
                      style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.7),
                          fontSize: 12)),
              ],
            ),
          ),
          _tag('Difficile', isDifficult, Colors.orangeAccent, () {
            setState(() {
              if (isDifficult) {
                _difficult.remove(ex.code);
              } else {
                _difficult.add(ex.code);
              }
            });
          }),
          const SizedBox(width: 4),
          _tag('À refaire', isRedo, Colors.pinkAccent, () {
            setState(() {
              if (isRedo) {
                _redo.remove(ex.code);
              } else {
                _redo.add(ex.code);
              }
            });
          }),
        ],
      ),
    );
  }

  Widget _tag(String label, bool active, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: active ? color.withValues(alpha: 0.3) : Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: active ? color : Colors.white.withValues(alpha: 0.2)),
        ),
        child: Text(label,
            style: TextStyle(
                color: active ? color : Colors.white70,
                fontSize: 11,
                fontWeight: FontWeight.w600)),
      ),
    );
  }

  Widget _card(String title, List<Widget> children) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          ...children,
        ],
      ),
    );
  }
}
