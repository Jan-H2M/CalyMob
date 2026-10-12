import 'package:flutter/material.dart';
import 'package:rxdart/rxdart.dart';
import '../../services/apnee_training_service.dart';
import 'formation_navigation.dart';

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
  late final Stream<List<List<ApneeRow>>>? _data = !widget.live
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
  Widget build(BuildContext context) {
    if (!widget.live) return _content(widget.initialApnee);
    return StreamBuilder<List<List<ApneeRow>>>(
        stream: _data,
        builder: (context, snapshot) {
          final directory = snapshot.data?[0];
          final scubaActive = directory != null && directory.isNotEmpty
              ? directory.single['formation_active'] == true
              : widget.fallbackScubaActive;
          final active = (snapshot.data?[1] ?? <ApneeRow>[])
              .where((row) =>
                  row['status'] == 'active' &&
                  apneeFormationLevels.containsKey(row['track']))
              .toList();
          final conflict = active.length + (scubaActive ? 1 : 0) > 1;
          final selected = _selected ??
              (widget.initialApnee || (!conflict && active.length == 1));
          String? message;
          if (snapshot.hasError) {
            message =
                'Formation actuelle indisponible. Choisissez une discipline pour consulter son historique.';
          } else if (snapshot.hasData) {
            if (conflict) {
              message =
                  'Plusieurs inscriptions actives. Aucune formation n’est choisie automatiquement.';
            } else if (active.length == 1 && !selected) {
              message =
                  'Historique plongée · Formation actuelle : ${apneeFormationLevels[active.single['track']]}';
            } else if (active.isEmpty && !scubaActive) {
              message =
                  'Aucune formation active · consultation de l’historique';
            }
          }
          final resolving = _selected == null &&
              (!snapshot.hasData || snapshot.hasError || conflict);
          return _content(selected, message: message, resolving: resolving);
        });
  }

  Widget _content(bool apnee, {String? message, bool resolving = false}) =>
      Column(children: [
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
                : Builder(builder: apnee ? widget.apnee : widget.scuba)),
      ]);
}
