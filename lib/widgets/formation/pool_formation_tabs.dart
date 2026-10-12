import 'package:flutter/material.dart';

/// The same pool navigation in instructor and pupil dossiers. No data writes.
class PoolFormationTabs extends StatelessWidget {
  final Widget sessions;
  final Widget exercises;
  final Widget? apnee;
  final bool initiallyApnee;
  const PoolFormationTabs({
    super.key,
    required this.sessions,
    required this.exercises,
    this.apnee,
    this.initiallyApnee = false,
  });

  @override
  Widget build(BuildContext context) => DefaultTabController(
        key: ValueKey(apnee != null),
        length: apnee == null ? 2 : 3,
        initialIndex: initiallyApnee && apnee != null ? 2 : 0,
        child: Column(children: [
          Container(
            color: const Color(0xCC173853),
            child: TabBar(
              labelColor: Colors.white,
              unselectedLabelColor: Colors.white70,
              indicatorColor: Colors.lightBlueAccent,
              labelStyle:
                  const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
              tabs: [
                const Tab(text: 'Séances'),
                const Tab(text: 'Exercices'),
                if (apnee != null) const Tab(text: 'Apnée'),
              ],
            ),
          ),
          Expanded(
              child: TabBarView(
                  children: [sessions, exercises, if (apnee != null) apnee!])),
        ]),
      );
}
