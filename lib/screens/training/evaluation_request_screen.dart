import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/exercice_lifras.dart';
import '../../providers/auth_provider.dart';
import '../../services/exercise_claim_service.dart';
import '../../services/member_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

enum EvaluationEnvironment { pool, openWater }

@visibleForTesting
bool isEligibleEvaluationMonitor(
  Map<String, dynamic> member, {
  required String studentId,
}) {
  final id = member['id']?.toString() ?? '';
  final code = member['plongeur_code']?.toString().toUpperCase();
  final statuses = (member['clubStatuten'] as List? ?? const [])
      .map((value) => value.toString().toLowerCase());
  return id.isNotEmpty &&
      id != studentId &&
      const ['MC', 'MF', 'MN'].contains(code) &&
      statuses.any(const ['encadrant', 'encadrants', 'e'].contains);
}

class EvaluationReferenceOption {
  const EvaluationReferenceOption({
    required this.id,
    required this.label,
    required this.date,
  });

  final String id;
  final String label;
  final DateTime date;
}

class EvaluationMonitorOption {
  const EvaluationMonitorOption({required this.id, required this.name});
  final String id;
  final String name;
}

class EvaluationExerciseOption {
  const EvaluationExerciseOption({
    required this.id,
    required this.code,
    required this.label,
  });

  factory EvaluationExerciseOption.fromExercise(ExerciceLIFRAS exercise) =>
      EvaluationExerciseOption(
        id: exercise.id,
        code: exercise.code,
        label: exercise.description,
      );

  final String id;
  final String code;
  final String label;
}

class EvaluationRequestScreen extends StatefulWidget {
  const EvaluationRequestScreen({
    super.key,
    required this.exercises,
    this.initialExerciseId,
    this.previewPoolSessions,
    this.previewDives,
    this.previewMonitors,
    this.onPreviewSubmit,
  });

  final List<EvaluationExerciseOption> exercises;
  final String? initialExerciseId;
  final List<EvaluationReferenceOption>? previewPoolSessions;
  final List<EvaluationReferenceOption>? previewDives;
  final List<EvaluationMonitorOption>? previewMonitors;
  final Future<void> Function()? onPreviewSubmit;

  @override
  State<EvaluationRequestScreen> createState() =>
      _EvaluationRequestScreenState();
}

class _EvaluationRequestScreenState extends State<EvaluationRequestScreen> {
  final _notes = TextEditingController();
  EvaluationEnvironment _environment = EvaluationEnvironment.pool;
  String? _exerciseId;
  String? _referenceId;
  String? _monitorId;
  List<EvaluationReferenceOption> _poolSessions = const [];
  List<EvaluationReferenceOption> _dives = const [];
  List<EvaluationMonitorOption> _monitors = const [];
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  bool get _preview => widget.previewPoolSessions != null;
  List<EvaluationReferenceOption> get _references =>
      _environment == EvaluationEnvironment.pool ? _poolSessions : _dives;

  @override
  void initState() {
    super.initState();
    _exerciseId = widget.initialExerciseId ??
        (widget.exercises.isEmpty ? null : widget.exercises.first.id);
    if (_preview) {
      _poolSessions = widget.previewPoolSessions ?? const [];
      _dives = widget.previewDives ?? const [];
      _monitors = widget.previewMonitors ?? const [];
      _loading = false;
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final userId = context.read<AuthProvider>().currentUser?.uid;
    if (userId == null) {
      setState(() {
        _loading = false;
        _error = 'Connexion requise';
      });
      return;
    }
    try {
      final club = FirebaseFirestore.instance
          .collection('clubs')
          .doc(FirebaseConfig.defaultClubId);
      final results = await Future.wait([
        club
            .collection('student_logbook_entries')
            .where('member_id', isEqualTo: userId)
            .get(),
        MemberService().getMonitors(FirebaseConfig.defaultClubId),
      ]);
      final entries = results[0] as QuerySnapshot<Map<String, dynamic>>;
      final monitors = results[1] as List<Map<String, dynamic>>;
      if (!mounted) return;
      setState(() {
        final references = entries.docs.map((doc) {
          final data = doc.data();
          final date = (data['date'] as Timestamp?)?.toDate() ?? DateTime(1970);
          final isPool = data['source'] == 'piscine';
          final location = (data['location_name'] ??
                  data['operation_title'] ??
                  (isPool ? 'Piscine' : 'Plongée'))
              .toString();
          return EvaluationReferenceOption(
            id: doc.id,
            label:
                '${isPool ? 'Piscine · ' : ''}$location · ${_dateLabel(date)}',
            date: date,
          );
        }).toList();
        _poolSessions = entries.docs
            .asMap()
            .entries
            .where((entry) => entry.value.data()['source'] == 'piscine')
            .map((entry) => references[entry.key])
            .toList()
          ..sort((a, b) => b.date.compareTo(a.date));
        _dives = entries.docs
            .asMap()
            .entries
            .where((entry) => entry.value.data()['source'] != 'piscine')
            .map((entry) => references[entry.key])
            .toList()
          ..sort((a, b) => b.date.compareTo(a.date));
        _monitors = monitors
            .where((m) => isEligibleEvaluationMonitor(m, studentId: userId))
            .map((m) => EvaluationMonitorOption(
                  id: m['id'].toString(),
                  name: m['displayName'].toString(),
                ))
            .where((m) => m.id.isNotEmpty && m.name.isNotEmpty)
            .toList();
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: OceanGradientBackground(
        child: SafeArea(
          child: Column(
            children: [
              AppBar(
                title: const Text('Demander une évaluation'),
                backgroundColor: Colors.transparent,
                foregroundColor: Colors.white,
              ),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _error != null
                        ? Center(
                            child: Text(_error!,
                                style: const TextStyle(color: Colors.white)))
                        : _form(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _form() {
    final refs = _references;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      children: [
        _card([
          const _StepTitle('1', 'Exercice'),
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _exerciseId,
            decoration: const InputDecoration(labelText: 'Exercice'),
            items: widget.exercises
                .map((e) => DropdownMenuItem(
                    value: e.id,
                    child: Text('${e.code} — ${e.label}',
                        overflow: TextOverflow.ellipsis)))
                .toList(),
            onChanged: (value) => setState(() => _exerciseId = value),
          ),
        ]),
        const SizedBox(height: 12),
        _card([
          const _StepTitle('2', 'Contexte'),
          SegmentedButton<EvaluationEnvironment>(
            segments: const [
              ButtonSegment(
                  value: EvaluationEnvironment.pool,
                  label: Text('Piscine'),
                  icon: Icon(Icons.pool)),
              ButtonSegment(
                  value: EvaluationEnvironment.openWater,
                  label: Text('Milieu naturel'),
                  icon: Icon(Icons.scuba_diving)),
            ],
            selected: {_environment},
            onSelectionChanged: (value) => setState(() {
              _environment = value.single;
              _referenceId = null;
            }),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            isExpanded: true,
            key: ValueKey(_environment),
            initialValue:
                refs.any((r) => r.id == _referenceId) ? _referenceId : null,
            decoration: InputDecoration(
              labelText: _environment == EvaluationEnvironment.pool
                  ? 'Séance piscine'
                  : 'Plongée du carnet',
              helperText: refs.isEmpty
                  ? 'Aucun élément disponible dans ton historique.'
                  : null,
            ),
            items: refs
                .map((r) => DropdownMenuItem(value: r.id, child: Text(r.label)))
                .toList(),
            onChanged: refs.isEmpty
                ? null
                : (value) => setState(() => _referenceId = value),
          ),
        ]),
        const SizedBox(height: 12),
        _card([
          const _StepTitle('3', 'Moniteur'),
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _monitorId,
            decoration:
                const InputDecoration(labelText: 'Moniteur qui t’a évalué'),
            items: _monitors
                .map((m) => DropdownMenuItem(value: m.id, child: Text(m.name)))
                .toList(),
            onChanged: (value) => setState(() => _monitorId = value),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notes,
            maxLines: 3,
            decoration: const InputDecoration(
                labelText: 'Note (optionnel)', border: OutlineInputBorder()),
          ),
        ]),
        const SizedBox(height: 18),
        FilledButton.icon(
          onPressed: _canSubmit && !_submitting ? _submit : null,
          icon: const Icon(Icons.send_outlined),
          label: Text(_submitting ? 'Envoi…' : 'Envoyer la demande'),
          style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
              backgroundColor: AppColors.oranje),
        ),
        const SizedBox(height: 8),
        const Text(
          'Le moniteur recevra automatiquement l’action. Aucun envoi séparé n’est nécessaire.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.white70, fontSize: 12),
        ),
      ],
    );
  }

  bool get _canSubmit =>
      _exerciseId != null && _referenceId != null && _monitorId != null;

  Widget _card(List<Widget> children) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            color: Colors.white, borderRadius: BorderRadius.circular(16)),
        child: Column(
            crossAxisAlignment: CrossAxisAlignment.start, children: children),
      );

  Future<void> _submit() async {
    setState(() => _submitting = true);
    try {
      if (widget.onPreviewSubmit != null) {
        await widget.onPreviewSubmit!();
      } else {
        final exercise =
            widget.exercises.firstWhere((e) => e.id == _exerciseId);
        final reference = _references.firstWhere((e) => e.id == _referenceId);
        final monitor = _monitors.firstWhere((e) => e.id == _monitorId);
        await ExerciseClaimService().createEvaluationRequest(
          clubId: FirebaseConfig.defaultClubId,
          exerciseId: exercise.id,
          contextType:
              _environment == EvaluationEnvironment.pool ? 'pool' : 'dive',
          contextEntryId: reference.id,
          monitorId: monitor.id,
          notes: _notes.text,
        );
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Demande envoyée au moniteur ✓')));
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Impossible d’envoyer : $error')));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  static String _dateLabel(DateTime date) =>
      '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
}

class _StepTitle extends StatelessWidget {
  const _StepTitle(this.number, this.title);
  final String number;
  final String title;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(children: [
          CircleAvatar(
              radius: 13,
              backgroundColor: AppColors.middenblauw,
              foregroundColor: Colors.white,
              child: Text(number)),
          const SizedBox(width: 8),
          Text(title,
              style:
                  const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
        ]),
      );
}
