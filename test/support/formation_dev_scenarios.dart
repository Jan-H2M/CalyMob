// Fictional values only. Never imported by the ordinary application entrypoint.
import 'package:calymob/models/formation_snapshot_doc.dart';
import 'package:calymob/models/member_profile.dart';
import 'package:calymob/screens/profile/who_is_who_screen.dart';
import 'package:calymob/services/pool_formation_overview_reader.dart';
import 'package:calymob/utils/permission_helper.dart';
import 'package:flutter/material.dart';

final devFormationProfiles = [
  MemberProfile(
      id: 'dev-ada',
      prenom: 'Ada',
      nom: 'FICTIVE',
      email: '',
      plongeurCode: 'P1'),
  MemberProfile(
      id: 'dev-boris',
      prenom: 'Boris',
      nom: 'FICTIF',
      email: '',
      plongeurCode: 'P2'),
];

List<FormationSnapshotDoc> devFormationSnapshots({bool extraGoal = false}) => [
      FormationSnapshotDoc.fromMap('dev-ada', {
        'current_code': 'P1',
        'target_level': '2*',
        'formation_pct': 33,
        'exercises': {
          'validated': [
            {
              'code': 'P2.RA',
              'description': 'Remontée FICTIVE validée',
              'niveau': 'P2'
            },
            {
              'code': 'P2.EXP',
              'description': 'Examen piscine FICTIF validé',
              'niveau': 'P2'
            },
          ],
          'pending_claims': [
            {
              'code': 'P2.EXT',
              'label': 'Théorie FICTIVE à vérifier',
              'status': 'submitted'
            }
          ],
          'remaining': [
            {'code': 'P2.RT', 'description': 'Carrière FICTIVE restante'},
            {
              'code': 'P2.PISC',
              'description': 'Exercice piscine FICTIF restant'
            },
            {'code': 'P2.T', 'description': 'Théorie FICTIVE restante'},
          ],
        },
        'goals': {
          'codes': extraGoal ? ['P2.SOUHAIT-FICTIF'] : <String>[]
        },
      }),
      FormationSnapshotDoc.fromMap('dev-boris', {
        'current_code': 'P2',
        'target_level': '3*',
        'formation_pct': 33,
        'exercises': {
          'validated': [
            {
              'code': 'P3.EXT',
              'description': 'Théorie FICTIVE validée',
              'niveau': 'P3'
            }
          ],
          'pending_claims': [
            {
              'code': 'P3.RA',
              'label': 'Carrière FICTIVE à vérifier',
              'status': 'submitted'
            }
          ],
          'remaining': [
            {'code': 'P3.EXP', 'description': 'Examen piscine FICTIF restant'}
          ],
        },
      }),
    ];

/// Exercises the actual list and restricted DTO reader, without a real callable.
class FictionalFormation extends StatefulWidget {
  const FictionalFormation({super.key});
  @override
  State<FictionalFormation> createState() => _FictionalFormationState();
}

class _FictionalFormationState extends State<FictionalFormation> {
  bool pool = false;
  bool extraGoal = false;
  bool failNext = false;
  int revision = 0;
  String query = '';

  void checkFailure() {
    if (failNext) {
      failNext = false;
      throw StateError('fictional-read-error');
    }
  }

  @override
  Widget build(BuildContext context) => Column(children: [
        const Padding(
            padding: EdgeInsets.all(8),
            child: Text(
                'MOB-033 — progression FICTIVE : carrière, piscine, théorie. Un souhait ne vaut pas validation. Portée simulée, pas un test des droits serveur.')),
        Padding(
            padding: const EdgeInsets.all(8),
            child: TextField(
                key: const Key('dev-formation-search'),
                decoration: const InputDecoration(
                    labelText: 'Rechercher dans la formation fictive'),
                onChanged: (v) => setState(() => query = v))),
        Wrap(spacing: 8, children: [
          FilterChip(
              label: const Text('Portée piscine uniquement'),
              selected: pool,
              onSelected: (v) => setState(() {
                    pool = v;
                    revision++;
                  })),
          FilterChip(
              label: const Text('Souhait supplémentaire non validé'),
              selected: extraGoal,
              onSelected: (v) => setState(() {
                    extraGoal = v;
                    revision++;
                  })),
          TextButton(
              onPressed: () => setState(() {
                    failNext = true;
                    revision++;
                  }),
              child: const Text('Simuler une erreur de lecture')),
        ]),
        Expanded(
            child: ColoredBox(
                color: const Color(0xff174668),
                child:
                    // Disable dossier routing, not the real loading/error/retry/filter UI.
                    FormationListView(
                  key: ValueKey('formation-$revision'),
                  clubId: 'dev-fictional',
                  searchQuery: query,
                  scope: pool
                      ? FormationTrackingScope.piscineOnly
                      : FormationTrackingScope.full,
                  allowDossierNavigation: false,
                  profilesLoader: (_) async {
                    if (pool)
                      throw StateError('Pool must never read full profiles');
                    checkFailure();
                    return devFormationProfiles;
                  },
                  snapshotsLoader: (_) async {
                    if (pool)
                      throw StateError('Pool must never read full snapshots');
                    return devFormationSnapshots(extraGoal: extraGoal);
                  },
                  poolStudentsLoader: (_) => PoolFormationOverviewReader(
                      callableInvoker: (method, payload) async {
                    if (method != 'getPoolFormationOverviewV1' ||
                        payload['clubId'] != 'dev-fictional') {
                      throw StateError('Unexpected fictional DTO request');
                    }
                    checkFailure();
                    return {
                      'students': [
                        for (final profile in devFormationProfiles)
                          {
                            'member_id': profile.id,
                            'identity': {
                              'first_name': profile.prenom,
                              'last_name': profile.nom,
                              'consent_internal_photo': false
                            },
                            'piscine': {
                              'validated': 1,
                              'pending': 1,
                              'remaining': 1,
                              'total': 3,
                              'pct': 33
                            },
                            'mil_experience': {
                              'fictional-forbidden-field': true
                            },
                          }
                      ]
                    };
                  }).getAllStudents('dev-fictional'),
                ))),
      ]);
}
