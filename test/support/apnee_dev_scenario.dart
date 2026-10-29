// Local fictional lesson stream and name lookup; no session or directory I/O.
import 'dart:async';
import 'package:calymob/widgets/piscine/pool_apnee_overview.dart';
import 'package:flutter/material.dart';

class FictionalApnee extends StatefulWidget {
  const FictionalApnee({super.key});
  @override
  State<FictionalApnee> createState() => _FictionalApneeState();
}

class _FictionalApneeState extends State<FictionalApnee> {
  late Stream<List<PoolApneeLesson>> lessons;
  bool alternate = false;
  bool empty = false;
  bool failNext = false;
  bool timeout = false;
  List<PoolApneeLesson> get rows => empty
      ? []
      : [
          PoolApneeLesson(
              track: 'apnee.a1',
              hour: '1ere_heure',
              theme: 'Statique FICTIVE',
              instructorIds: const ['dev-moniteur'],
              memberIds: [alternate ? 'dev-boris' : 'dev-ada']),
          const PoolApneeLesson(
              track: 'apnee.a2',
              hour: '2eme_heure',
              theme: 'Dynamique FICTIVE',
              instructorIds: [],
              memberIds: ['dev-celia']),
        ];
  @override
  void initState() {
    super.initState();
    lessons = Stream.value(rows);
  }

  Future<Map<String, String>> resolve(Set<String> ids) async {
    if (failNext) {
      failNext = false;
      throw StateError('fictional-directory-failure');
    }
    if (timeout) return Completer<Map<String, String>>().future;
    const names = {
      'dev-moniteur': 'Moniteur FICTIF',
      'dev-ada': 'Ada FICTIVE',
      'dev-boris': 'Boris FICTIF',
      'dev-celia': 'Célia FICTIVE'
    };
    if (ids.any((id) => !names.containsKey(id)))
      throw StateError('Unknown fictional identity');
    return {for (final id in ids) id: names[id]!};
  }

  void refresh() => lessons = Stream.value(rows);
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(12), children: [
        const Text(
            'MOB-036 — planning apnée FICTIF. Une inscription au cours ne prouve ni présence, ni QR, ni exercice validé. Aucune séance réelle consultée.'),
        Wrap(spacing: 8, children: [
          TextButton(
              onPressed: () => setState(() {
                    empty = false;
                    timeout = false;
                    failNext = true;
                    refresh();
                  }),
              child: const Text('Simuler un échec des noms')),
          TextButton(
              onPressed: () => setState(() {
                    alternate = !alternate;
                    empty = false;
                    timeout = false;
                    refresh();
                  }),
              child: const Text('Changer les élèves fictifs')),
          TextButton(
              onPressed: () => setState(() {
                    empty = !empty;
                    refresh();
                  }),
              child: const Text('Planning fictif vide')),
          TextButton(
              onPressed: () => setState(() {
                    timeout = true;
                    empty = false;
                    refresh();
                  }),
              child: const Text('Simuler un délai de 8 secondes')),
          TextButton(
              onPressed: () => setState(() {
                    lessons =
                        Stream.error(StateError('fictional-planning-error'));
                  }),
              child: const Text('Simuler une erreur de planning')),
          TextButton(
              onPressed: () => setState(() {
                    timeout = false;
                    empty = false;
                    failNext = false;
                    refresh();
                  }),
              child: const Text('Recharger le planning fictif')),
        ]),
        if (empty)
          const Text(
              'Planning fictif vide : aucune présence ou absence ne peut être déduite.'),
        ColoredBox(
            color: const Color(0xff174668),
            child: Padding(
                padding: const EdgeInsets.all(12),
                child: PoolApneeOverview(
                    lessons: lessons, resolveNames: resolve))),
      ]);
}
