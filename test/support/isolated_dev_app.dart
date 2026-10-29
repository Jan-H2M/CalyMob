// Test-only fixtures, imported by the standalone DEV entrypoint, never main.dart.
import 'package:calymob/models/formation_snapshot_doc.dart';
import 'package:calymob/models/member_profile.dart';
import 'package:calymob/models/operation.dart';
import 'package:calymob/models/participant_operation.dart';
import 'package:calymob/models/pool_formation_snapshot_doc.dart';
import 'package:calymob/models/user_event_registration.dart';
import 'package:calymob/screens/profile/who_is_who_screen.dart';
import 'package:calymob/utils/event_registration_error.dart';
import 'package:calymob/utils/permission_helper.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

const devSource = String.fromEnvironment('ISOLATED_DEV_SOURCE');
const devEnabled = bool.fromEnvironment('ISOLATED_DEV');

/// Separate entrypoint: never imports main.dart or initializes a Firebase app.
/// This lab verifies three CLIENT fixes, not server rules or real settlement.
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  validateDevOrigin(Uri.base, enabled: devEnabled, isWeb: kIsWeb);
  if (Firebase.apps.isNotEmpty) {
    throw StateError('Isolated DEV refuses an initialized Firebase app.');
  }
  runApp(const IsolatedDevApp());
}

void validateDevOrigin(Uri uri, {required bool enabled, required bool isWeb}) {
  if (!enabled ||
      !isWeb ||
      uri.scheme != 'http' ||
      uri.host != '127.0.0.1' ||
      uri.port != 7375) {
    throw StateError('Isolated DEV requires http://127.0.0.1:7375.');
  }
}

MemberProfile fictionalStudent(String id, String first,
        {String level = 'P2'}) =>
    MemberProfile(
        id: 'dev-$id',
        prenom: first,
        nom: 'FICTIF',
        email: '',
        plongeurCode: level);

final fictionalStudents = [
  fictionalStudent('quiet', 'Aaron'),
  fictionalStudent('goal', 'Bert'),
  fictionalStudent('pending', 'Yves'),
  fictionalStudent('attention', 'Zoé', level: 'P3'),
];

List<FormationSnapshotDoc> fictionalSnapshots() => [
      for (var i = 0; i < fictionalStudents.length; i++)
        FormationSnapshotDoc.fromMap(fictionalStudents[i].id, {
          'current_code': fictionalStudents[i].plongeurCode,
          'attention_points': i == 3 ? ['P4.FICTIF'] : [],
          'exercises': {
            'pending_claims': i == 2
                ? [
                    {'code': 'P3.FICTIF', 'status': 'submitted'}
                  ]
                : []
          },
          'goals': {
            'codes': i == 1 ? ['P3.FICTIF'] : []
          },
        }),
    ];

const paymentStates = ['unpaid', 'review', 'paid'];
const paymentAliases = [
  'payment_intent_status',
  'event_payment_intent_status',
  'payment_intent.status',
];

/// In-memory fake only. No FirebaseAuth, Admin SDK, service account or QR.
Future<UserEventRegistration> fictionalPayment(
    String state, String? alias) async {
  if (!paymentStates.contains(state) ||
      (alias != null && !paymentAliases.contains(alias))) {
    throw ArgumentError('Unsupported fictional payment scenario');
  }
  final db = FakeFirebaseFirestore();
  final ref = db
      .doc('clubs/dev-fictional/operations/dev-event/inscriptions/dev-member');
  await ref.set({
    'operation_id': 'dev-event',
    'membre_id': 'dev-member',
    'prix': 8,
    'paye': state == 'paid',
    'transaction_matched': false,
    'payment_status': state == 'review'
        ? 'manual_review'
        : state == 'paid'
            ? 'paid'
            : 'qr_email_sent',
    'date_inscription': Timestamp.fromDate(DateTime(2026, 1, 1)),
    if (alias == 'payment_intent.status') 'payment_intent': {'status': 'paid'},
    if (alias != null && alias != 'payment_intent.status') alias: 'paid',
  });
  return UserEventRegistration(
    operation: Operation(
        id: 'dev-event',
        type: 'evenement',
        titre: 'Activité FICTIVE — 8 €',
        montantPrevu: 0,
        statut: 'ouvert',
        createdAt: DateTime(2026),
        updatedAt: DateTime(2026)),
    participant: ParticipantOperation.fromFirestore(await ref.get()),
  );
}

final registrationScenarios = <String, Object Function()>{
  'Tarif membre absent': () => FirebaseFunctionsException(
          code: 'failed-precondition',
          message: 'Aucun tarif membre ne correspond à votre catégorie.',
          details: const {
            'stack': 'fictional-internal-stack-MUST-NOT-BE-DISPLAYED'
          }),
  'Activité complète': () => FirebaseFunctionsException(
      code: 'resource-exhausted', message: 'Événement complet (12 places).'),
  'Inscription existante': () => FirebaseFunctionsException(
      code: 'already-exists', message: 'Inscription fictive existante.'),
  'Connexion incertaine': () => FirebaseFunctionsException(
      code: 'deadline-exceeded', message: 'Connexion fictive interrompue.'),
};

class IsolatedDevApp extends StatelessWidget {
  const IsolatedDevApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'CalyMob — DEV isolé',
        theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.blue),
        home: const _DevHome(),
      );
}

class _DevHome extends StatefulWidget {
  const _DevHome();
  @override
  State<_DevHome> createState() => _DevHomeState();
}

class _DevHomeState extends State<_DevHome> {
  int page = 0;
  int generation = 0;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar:
            AppBar(title: const Text('DEV isolé · Données fictives'), actions: [
          IconButton(
              tooltip: 'Réinitialiser les scénarios',
              icon: const Icon(Icons.restart_alt),
              onPressed: () => setState(() {
                    page = 0;
                    generation++;
                  })),
        ]),
        body: Center(
            child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1000),
                child: Column(children: [
                  const Padding(
                      padding: EdgeInsets.all(12),
                      child: Text(
                          'Aucune connexion Firebase. Aucun paiement, inscription ou dossier réel. '
                          'Laboratoire client uniquement — pas une validation des règles serveur.',
                          textAlign: TextAlign.center)),
                  Padding(
                      padding: const EdgeInsets.all(8),
                      child: Wrap(spacing: 8, runSpacing: 8, children: [
                        for (final (index, label) in const [
                          (0, 'MOB-048 · Élèves'),
                          (1, 'MOB-044 · Paiements'),
                          (2, 'COM-147 · Inscriptions'),
                        ])
                          ChoiceChip(
                              label: Text(label),
                              selected: page == index,
                              onSelected: (_) => setState(() => page = index)),
                      ])),
                  Expanded(
                      child: KeyedSubtree(
                          key: ValueKey('$generation-$page'),
                          child: switch (page) {
                            0 => const _Students(),
                            1 => const _Payments(),
                            _ => const _Registration(),
                          })),
                  Padding(
                      padding: const EdgeInsets.all(8),
                      child: Text(
                          'DEV-ISOLATION-001 · source ${devSource.isEmpty ? 'test' : devSource.substring(0, 12)}',
                          style: Theme.of(context).textTheme.labelSmall)),
                ]))),
      );
}

class _Students extends StatefulWidget {
  const _Students();
  @override
  State<_Students> createState() => _StudentsState();
}

class _StudentsState extends State<_Students> {
  String query = '';
  bool pool = false;
  String? level;
  @override
  Widget build(BuildContext context) => Column(children: [
        Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
                key: const Key('dev-student-search'),
                decoration: const InputDecoration(
                    labelText: 'Rechercher un élève fictif'),
                onChanged: (v) => setState(() => query = v))),
        Wrap(spacing: 12, children: [
          FilterChip(
              label: const Text('Piscine uniquement'),
              selected: pool,
              onSelected: (v) => setState(() {
                    pool = v;
                    level = null;
                  })),
          if (!pool)
            FilterChip(
                label: const Text('Niveau P2'),
                selected: level == 'P2',
                onSelected: (v) => setState(() => level = v ? 'P2' : null)),
        ]),
        const Padding(
            padding: EdgeInsets.all(8),
            child: Text(
                'Attendu : Bert, Yves, Zoé avant Aaron. Piscine : Yves en premier. '
                'Liste en lecture seule : ouverture des dossiers désactivée.')),
        Expanded(
            child: ColoredBox(
                color: const Color(0xff174668),
                child: AbsorbPointer(
                  // The production row tap would open the live dossier screen. Do not expose
                  // that route in this fixture lab; filters outside the list still work.
                  child: FormationListView(
                    key: ValueKey(pool),
                    clubId: 'dev-fictional',
                    searchQuery: query,
                    filterLevel: level,
                    scope: pool
                        ? FormationTrackingScope.piscineOnly
                        : FormationTrackingScope.full,
                    profilesLoader: (_) async {
                      if (pool) {
                        throw StateError(
                            'Pool view must not load full profiles');
                      }
                      return fictionalStudents;
                    },
                    snapshotsLoader: (_) async {
                      if (pool) {
                        throw StateError(
                            'Pool view must not load full snapshots');
                      }
                      return fictionalSnapshots();
                    },
                    poolStudentsLoader: (_) async => [
                      for (var i = 0; i < fictionalStudents.length; i++)
                        PoolFormationStudent(
                            profile: fictionalStudents[i],
                            snapshot: PoolFormationSnapshotDoc(
                                memberId: fictionalStudents[i].id,
                                validated: 0,
                                pending: i == 2 ? 1 : 0,
                                remaining: 1,
                                pct: 0))
                    ],
                  ),
                ))),
      ]);
}

class _Payments extends StatefulWidget {
  const _Payments();
  @override
  State<_Payments> createState() => _PaymentsState();
}

class _PaymentsState extends State<_Payments> {
  String state = 'unpaid';
  String? alias;
  late Future<UserEventRegistration> value = fictionalPayment(state, alias);
  void refresh() => value = fictionalPayment(state, alias);
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        const Text('Modèle réel de paiement, données uniquement en mémoire. '
            'Un alias « paid » ne doit pas transformer une dette en paiement reçu.'),
        Wrap(spacing: 8, children: [
          for (final v in paymentStates)
            ChoiceChip(
                label: Text(v),
                selected: state == v,
                onSelected: (_) => setState(() {
                      state = v;
                      refresh();
                    }))
        ]),
        const SizedBox(height: 16),
        const Text('Alias non fiable ajouté au scénario :'),
        Wrap(spacing: 8, runSpacing: 8, children: [
          ChoiceChip(
              label: const Text('Aucun alias'),
              selected: alias == null,
              onSelected: (_) => setState(() {
                    alias = null;
                    refresh();
                  })),
          for (final v in paymentAliases)
            ChoiceChip(
                label: Text('$v = paid'),
                selected: alias == v,
                onSelected: (_) => setState(() {
                      alias = v;
                      refresh();
                    })),
        ]),
        const SizedBox(height: 24),
        FutureBuilder<UserEventRegistration>(
            future: value,
            builder: (context, snapshot) {
              if (!snapshot.hasData) return const CircularProgressIndicator();
              final result = snapshot.data!;
              return Card(
                  child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(children: [
                        Text(result.operation.titre),
                        const SizedBox(height: 12),
                        Text(result.statusLabel,
                            key: const Key('dev-payment-label'),
                            style: Theme.of(context).textTheme.headlineSmall),
                        Text(
                            'Paiement confirmé : ${result.isPaid ? 'oui' : 'non'}'),
                        Text(
                            'Affichage participant : ${result.participant.paymentDisplayStatus}'),
                        const Text(
                            'Aucun QR, aucun IBAN, aucune confirmation bancaire possible ici.'),
                      ])));
            }),
      ]);
}

class _Registration extends StatefulWidget {
  const _Registration();
  @override
  State<_Registration> createState() => _RegistrationState();
}

class _RegistrationState extends State<_Registration> {
  String scenario = registrationScenarios.keys.first;
  String? feedback;
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        const Text('Simulation du message client, sans appel serveur. '
            'Ne valide ni le tarif réel ni la règle des invités.'),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final v in registrationScenarios.keys)
            ChoiceChip(
                label: Text(v),
                selected: scenario == v,
                onSelected: (_) => setState(() {
                      scenario = v;
                      feedback = null;
                    }))
        ]),
        const SizedBox(height: 16),
        FilledButton(
            key: const Key('dev-simulate-error'),
            onPressed: () => setState(() => feedback =
                eventRegistrationErrorMessage(
                    registrationScenarios[scenario]!())),
            child: const Text('Simuler le message (aucune inscription)')),
        if (feedback != null)
          Padding(
              padding: const EdgeInsets.all(24),
              child:
                  Text(feedback!, key: const Key('dev-registration-feedback'))),
      ]);
}
