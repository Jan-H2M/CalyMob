import 'package:flutter/material.dart';
import 'package:rxdart/rxdart.dart';
import '../../services/apnee_training_service.dart';
import 'formation_navigation.dart';

bool hasApneeEnrollment(List<ApneeRow> rows) => rows.any((row) =>
    apneeFormationLevels.containsKey(row['track']) &&
    ['active', 'closed'].contains(row['status']));

/// Personal navigation stays hidden for members without an apnée enrollment.
class ApneeEnrollmentVisibility extends StatefulWidget {
  final String clubId;
  final String memberId;
  final Widget child;
  final ApneeTrainingService? service;
  const ApneeEnrollmentVisibility(
      {super.key,
      required this.clubId,
      required this.memberId,
      required this.child,
      this.service});
  @override
  State<ApneeEnrollmentVisibility> createState() =>
      _ApneeEnrollmentVisibilityState();
}

class _ApneeEnrollmentVisibilityState extends State<ApneeEnrollmentVisibility> {
  late Stream<List<ApneeRow>> _data;
  Stream<List<ApneeRow>> _watch() => (widget.service ?? ApneeTrainingService())
      .watch(widget.clubId, 'apnee_enrollments', memberId: widget.memberId);
  @override
  void initState() {
    super.initState();
    _data = _watch();
  }

  @override
  void didUpdateWidget(covariant ApneeEnrollmentVisibility oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.clubId != widget.clubId ||
        oldWidget.memberId != widget.memberId ||
        oldWidget.service != widget.service) _data = _watch();
  }

  @override
  Widget build(BuildContext context) => StreamBuilder<List<ApneeRow>>(
      key: ObjectKey(_data),
      stream: _data,
      builder: (context, snapshot) => !snapshot.hasError &&
              snapshot.hasData &&
              hasApneeEnrollment(snapshot.data!)
          ? widget.child
          : const SizedBox.shrink());
}

/// Official brevet and old SCUBA snapshots never select the current training.
/// Resolve from live safe member metadata + active enrollments, then let users
/// explicitly browse either discipline without changing any enrollment.
class ActiveFormationPanel extends StatefulWidget {
  final String clubId;
  final String memberId;
  final bool fallbackScubaActive;
  final bool initialApnee;
  final bool live;
  final ApneeTrainingService? service;
  final WidgetBuilder scuba;
  final WidgetBuilder apnee;
  const ActiveFormationPanel(
      {super.key,
      required this.clubId,
      required this.memberId,
      required this.fallbackScubaActive,
      required this.scuba,
      required this.apnee,
      this.initialApnee = false,
      this.live = true,
      this.service});
  @override
  State<ActiveFormationPanel> createState() => _ActiveFormationPanelState();
}

class _ActiveFormationPanelState extends State<ActiveFormationPanel> {
  bool? _selected;
  Stream<List<List<ApneeRow>>>? _data;
  Stream<List<List<ApneeRow>>>? _makeData() => !widget.live
      ? null
      : CombineLatestStream.list([
          (widget.service ?? ApneeTrainingService())
              .db
              .doc('clubs/${widget.clubId}/member_directory/${widget.memberId}')
              .snapshots()
              .map(
                  (doc) => doc.exists ? <ApneeRow>[doc.data()!] : <ApneeRow>[]),
          (widget.service ?? ApneeTrainingService()).watch(
              widget.clubId, 'apnee_enrollments',
              memberId: widget.memberId),
        ]);

  @override
  void initState() {
    super.initState();
    _data = _makeData();
  }

  @override
  void didUpdateWidget(covariant ActiveFormationPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.memberId != widget.memberId ||
        oldWidget.clubId != widget.clubId ||
        oldWidget.service != widget.service ||
        oldWidget.live != widget.live) {
      _selected = null;
      _data = _makeData();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.live)
      return _content(_selected ?? widget.initialApnee,
          showApnee: widget.initialApnee);
    return StreamBuilder<List<List<ApneeRow>>>(
        key: ObjectKey(_data),
        stream: _data,
        builder: (context, snapshot) {
          final directory = snapshot.data?[0];
          final scubaActive = directory != null && directory.isNotEmpty
              ? directory.single['formation_active'] == true
              : widget.fallbackScubaActive;
          final enrollments = (snapshot.data?[1] ?? <ApneeRow>[])
              .where((row) =>
                  apneeFormationLevels.containsKey(row['track']) &&
                  ['active', 'closed'].contains(row['status']))
              .toList();
          final showApnee = enrollments.isNotEmpty;
          final active = enrollments
              .where((row) =>
                  row['status'] == 'active' &&
                  apneeFormationLevels.containsKey(row['track']))
              .toList();
          final conflict = active.length + (scubaActive ? 1 : 0) > 1;
          final selected = showApnee &&
              (_selected ??
                  (widget.initialApnee || (!conflict && active.length == 1)));
          String? message;
          if (snapshot.hasError) {
            message = 'Formation actuelle indisponible. Rechargez la fiche.';
          } else if (snapshot.hasData) {
            if (conflict) {
              message =
                  'Plusieurs inscriptions actives. Aucune formation n’est choisie automatiquement.';
            } else if (active.length == 1 && !selected) {
              message =
                  'Historique plongée · Formation actuelle : ${apneeFormationLevels[active.single['track']]}';
            } else if (scubaActive && selected) {
              message = 'Historique apnée · Formation actuelle : Plongée';
            } else if (active.isEmpty && !scubaActive) {
              message =
                  'Aucune formation active · consultation de l’historique';
            }
          }
          final resolving = _selected == null &&
              (!snapshot.hasData || snapshot.hasError || conflict);
          return _content(selected,
              showApnee: showApnee, message: message, resolving: resolving);
        });
  }

  Widget _content(bool apnee,
          {required bool showApnee, String? message, bool resolving = false}) =>
      Column(children: [
        if (showApnee)
          FormationDisciplineSelector(
              apnee: apnee,
              onChanged: (value) => setState(() => _selected = value)),
        if (message != null)
          Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              child: Text(message,
                  style: const TextStyle(color: Colors.white70, fontSize: 12))),
        Expanded(
            child: resolving
                ? message == null
                    ? const Center(child: CircularProgressIndicator())
                    : const SizedBox.shrink()
                : KeyedSubtree(
                    key: ValueKey('${widget.clubId}/${widget.memberId}/$apnee'),
                    child:
                        Builder(builder: apnee ? widget.apnee : widget.scuba))),
      ]);
}
