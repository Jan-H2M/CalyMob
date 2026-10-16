import 'package:rxdart/rxdart.dart';
import 'package:calymob/screens/boutique/boutique_pickup_mission_screen.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:calymob/widgets/boutique/boutique_access_guard.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class LiveQaAccess extends BoutiqueAccessService {
  final states =
      BehaviorSubject<BoutiqueAccessState>.seeded(const BoutiqueAccessState(
          canAccess: true,
          visibility: {},
          member: {
            'member_status': 'active',
            'clubStatuten': ['RB']
          },
          qrEnabled: true));
  LiveQaAccess() : super(firestore: FakeFirebaseFirestore());
  @override
  Stream<BoutiqueAccessState> watchBoutiqueAccess(
          {required String clubId, required String userId}) =>
      states.stream;
}

void main() {
  testWidgets(
      'role withdrawal while a root confirmation is open disposes its action and cannot issue a write',
      (tester) async {
    final access = LiveQaAccess();
    addTearDown(access.states.close);
    final requests = <Map<String, dynamic>>[];
    final service = BoutiqueOperationsService(transport: (request) async {
      requests.add(request);
      return {
        'mission': {
          'id': 'qa-mission',
          'destination': 'Piscine',
          'sourceLocation': 'Jim',
          'pickupWindow': 'Ce soir',
          'arrived': 0,
          'total': 0,
          'delivered': 0,
          'expiresAt': '2026-10-23T19:00:00Z',
          'assigneeNames': ['Helper']
        },
        'units': [],
        'packets': []
      };
    });
    await tester.pumpWidget(MaterialApp(
        home: BoutiqueAccessGuard(
            accessService: access,
            clubId: 'fixture',
            testUserIdOverride: 'qa-rb',
            requiredSection: 'gestion',
            builder: (_, __) => BoutiquePickupMissionScreen(
                clubId: 'fixture',
                missionId: 'qa-mission',
                manager: true,
                service: service))));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 30));
    await tester.ensureVisible(find.text('Retirer cette mission'));
    await tester.tap(find.text('Retirer cette mission'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));
    expect(find.text('Retirer la mission'), findsOneWidget);
    access.states.add(const BoutiqueAccessState(
        canAccess: false,
        visibility: {},
        member: {'member_status': 'active', 'clubStatuten': []},
        qrEnabled: false));
    await tester.pump();
    await tester.tap(find.text('Retirer la mission'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));
    expect(requests.where((r) => r['action'] == 'revoke'), isEmpty);
    expect(tester.takeException(), isNull);
    expect(
        find.byKey(const Key('boutique-access-unavailable')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
