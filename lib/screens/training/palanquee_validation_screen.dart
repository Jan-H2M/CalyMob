/// Sortie — palanquée validation grid (Carnet de Formation).
///
/// The monitor of a palanquée validates, in one pass, the exercises each diver
/// DECLARED during the dive. Same shared model as the pool roster: the diver
/// declares the facts, the monitor confirms the verdict.
///
/// Layout = a list grouped per diver; under each diver, one row per declared
/// exercise with three verdict buttons A / P / R (acquis / en progrès /
/// à revoir). One "Enregistrer" saves the whole palanquée.
///
/// This screen is UI-first and data-injected: it takes its content via
/// [divers] and reports the result. The real wiring onto `exercise_claims`
/// (read declared claims → bulk-update their status/verdict) is done in a
/// separate, cross-app-coordinated step — see CARNET_SCENARIOS_CATALOGUE.md.
///
/// `previewMode` (used by the scenario gallery) shows the payload that would
/// be persisted instead of touching any backend.

import 'dart:convert';

import 'package:flutter/material.dart';

import '../../config/app_colors.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

/// Verdict for one declared exercise. `none` = declared, not yet judged.
enum ExerciseVerdict { none, acquis, enProgres, aRevoir }

extension ExerciseVerdictX on ExerciseVerdict {
  /// Persisted/code value (null when not yet judged).
  String? get code {
    switch (this) {
      case ExerciseVerdict.acquis:
        return 'acquis';
      case ExerciseVerdict.enProgres:
        return 'en_progres';
      case ExerciseVerdict.aRevoir:
        return 'a_revoir';
      case ExerciseVerdict.none:
        return null;
    }
  }
}

/// One exercise a diver declared during the dive.
class DeclaredExercise {
  final String code; // LIFRAS code, e.g. "P2.RA"
  final String label; // human label, e.g. "Remontée assistée"
  final String? claimId; // exercise_claims doc id (when wired); null in preview
  ExerciseVerdict verdict;

  DeclaredExercise({
    required this.code,
    required this.label,
    this.claimId,
    this.verdict = ExerciseVerdict.none,
  });
}

/// A diver in the palanquée with the exercises they declared.
class PalanqueeValidationDiver {
  final String memberId;
  final String name;
  final String? photoUrl;
  final List<DeclaredExercise> exercises;

  PalanqueeValidationDiver({
    required this.memberId,
    required this.name,
    this.photoUrl,
    required this.exercises,
  });

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    if (parts.length == 1) {
      return parts.first.characters.take(2).toString().toUpperCase();
    }
    return (parts.first.characters.first + parts.last.characters.first)
        .toUpperCase();
  }
}

class PalanqueeValidationScreen extends StatefulWidget {
  final String palanqueeTitle; // e.g. "Palanquée 2 · Rochefontaine"
  final List<PalanqueeValidationDiver> divers;

  /// When true, never touches the backend: submit shows the payload + pops.
  final bool previewMode;

  const PalanqueeValidationScreen({
    super.key,
    required this.palanqueeTitle,
    required this.divers,
    this.previewMode = false,
  });

  @override
  State<PalanqueeValidationScreen> createState() =>
      _PalanqueeValidationScreenState();
}

class _PalanqueeValidationScreenState extends State<PalanqueeValidationScreen> {
  bool _submitting = false;

  static const _verdictColors = <ExerciseVerdict, Color>{
    ExerciseVerdict.acquis: Color(0xFF16A34A),
    ExerciseVerdict.enProgres: Color(0xFFF59E0B),
    ExerciseVerdict.aRevoir: Color(0xFFE5484D),
  };

  static const _verdictLabels = <ExerciseVerdict, String>{
    ExerciseVerdict.acquis: 'A',
    ExerciseVerdict.enProgres: 'P',
    ExerciseVerdict.aRevoir: 'R',
  };

  Map<String, dynamic> _buildPayload() {
    return {
      'palanquee': widget.palanqueeTitle,
      'verdicts': [
        for (final d in widget.divers)
          for (final ex in d.exercises)
            if (ex.verdict != ExerciseVerdict.none)
              {
                'member_id': d.memberId,
                'exercise_code': ex.code,
                if (ex.claimId != null) 'claim_id': ex.claimId,
                'verdict': ex.verdict.code,
              },
      ],
    };
  }

  Future<void> _submit() async {
    if (_submitting) return;
    final payload = _buildPayload();

    if (widget.previewMode) {
      await _showPreviewResult(payload);
      if (mounted) Navigator.pop(context);
      return;
    }

    // Real persistence onto exercise_claims is wired in a later,
    // cross-app-coordinated step (see CARNET_SCENARIOS_CATALOGUE.md).
    // Until then this screen is reached only in preview mode.
    setState(() => _submitting = true);
    try {
      // TODO(carnet): bulk-update declared exercise_claims with the verdicts.
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _showPreviewResult(Map<String, dynamic> data) async {
    const encoder = JsonEncoder.withIndent('  ');
    String pretty;
    try {
      pretty = encoder.convert(data);
    } catch (_) {
      pretty = data.toString();
    }
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Aperçu — validation palanquée'),
        content: SingleChildScrollView(
          child: Text(
            pretty,
            style: const TextStyle(fontFamily: 'monospace', fontSize: 12.5),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
          ),
        ],
      ),
    );
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
              _header(context),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                  children: [
                    _contextCard(),
                    const SizedBox(height: 16),
                    _Card(child: _diversList()),
                    const SizedBox(height: 10),
                    _legend(),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: AnimatedPadding(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        padding: EdgeInsets.only(bottom: keyboardInset),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _submitting ? null : _submit,
                icon: _submitting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppColors.donkerblauw,
                        ),
                      )
                    : const Icon(Icons.send),
                label: Text(
                  _submitting ? 'Envoi…' : 'Enregistrer la palanquée',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.lichtblauw,
                  foregroundColor: AppColors.donkerblauw,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _header(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 16, 6),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          const Text(
            'VALIDER MA PALANQUÉE',
            style: TextStyle(
              color: Colors.white70,
              fontSize: 11.5,
              letterSpacing: 1.4,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _contextCard() {
    return _Card(
      child: Row(
        children: [
          const Icon(Icons.groups_2_outlined, color: Colors.white, size: 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.palanqueeTitle,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Chaque plongeur a déclaré · donne ton verdict.',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.78),
                    fontSize: 12.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _diversList() {
    final children = <Widget>[];
    for (var i = 0; i < widget.divers.length; i++) {
      final d = widget.divers[i];
      children.add(Padding(
        padding: EdgeInsets.only(top: i == 0 ? 4 : 12, bottom: 2),
        child: Row(
          children: [
            _avatar(d),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                d.name,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ));
      if (d.exercises.isEmpty) {
        children.add(Padding(
          padding: const EdgeInsets.only(left: 42, top: 2, bottom: 4),
          child: Text(
            'Rien déclaré',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.55),
              fontSize: 12.5,
            ),
          ),
        ));
      } else {
        for (final ex in d.exercises) {
          children.add(_exerciseRow(d, ex));
        }
      }
    }
    return Column(children: children);
  }

  Widget _avatar(PalanqueeValidationDiver d) {
    return Container(
      width: 34,
      height: 34,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white.withValues(alpha: 0.18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.45)),
        image: (d.photoUrl != null && d.photoUrl!.isNotEmpty)
            ? DecorationImage(
                image: NetworkImage(d.photoUrl!), fit: BoxFit.cover)
            : null,
      ),
      alignment: Alignment.center,
      child: (d.photoUrl == null || d.photoUrl!.isEmpty)
          ? Text(
              d.initials,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            )
          : null,
    );
  }

  Widget _exerciseRow(PalanqueeValidationDiver d, DeclaredExercise ex) {
    return Container(
      margin: const EdgeInsets.only(left: 15, top: 6),
      padding: const EdgeInsets.only(left: 12),
      decoration: BoxDecoration(
        border: Border(
          left: BorderSide(color: Colors.white.withValues(alpha: 0.15), width: 2),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              ex.label,
              style: const TextStyle(color: Colors.white, fontSize: 12.5),
            ),
          ),
          for (final v in const [
            ExerciseVerdict.acquis,
            ExerciseVerdict.enProgres,
            ExerciseVerdict.aRevoir,
          ])
            Padding(
              padding: const EdgeInsets.only(left: 5),
              child: _verdictButton(ex, v),
            ),
        ],
      ),
    );
  }

  Widget _verdictButton(DeclaredExercise ex, ExerciseVerdict v) {
    final active = ex.verdict == v;
    final color = _verdictColors[v]!;
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => setState(
        () => ex.verdict = active ? ExerciseVerdict.none : v,
      ),
      child: Container(
        width: 29,
        height: 29,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? color : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: active ? color : Colors.white.withValues(alpha: 0.35),
          ),
        ),
        child: Text(
          _verdictLabels[v]!,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  Widget _legend() {
    Widget chip(ExerciseVerdict v, String text) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 14,
              height: 14,
              decoration: BoxDecoration(
                color: _verdictColors[v],
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const SizedBox(width: 5),
            Text(
              text,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.8),
                fontSize: 11.5,
              ),
            ),
          ],
        );
    return Wrap(
      spacing: 14,
      runSpacing: 6,
      children: [
        chip(ExerciseVerdict.acquis, 'acquis'),
        chip(ExerciseVerdict.enProgres, 'en progrès'),
        chip(ExerciseVerdict.aRevoir, 'à revoir'),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  final Widget child;
  const _Card({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
      ),
      child: child,
    );
  }
}
