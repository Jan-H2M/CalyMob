import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:calymob/screens/boutique/boutique_handover_screen.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:calymob/widgets/boutique/boutique_access_guard.dart';

void main() {
  testWidgets(
      'selects a piece and confirms without QR with a truthful manual receipt',
      (tester) async {
    final requests = <Map<String, dynamic>>[];
    final service = BoutiqueOperationsService(transport: (req) async {
      requests.add(Map.of(req));
      return {'count': 1, 'recipientName': 'Camille', 'destination': 'Club'};
    });
    final access = BoutiqueAccessService(
        firestore: FakeFirebaseFirestore(),
        authUserIds: () => Stream.value('rb'));
    final packet = <String, dynamic>{
      'buyerId': 'buyer',
      'buyerName': 'Camille',
      'orderNumber': 'DÉMO-1',
      'allowPartial': true,
      'units': [
        {
          'id': 'p1',
          'revision': 'rev1',
          'productName': 'Polo',
          'variantLabel': 'M'
        },
        {
          'id': 'p2',
          'revision': 'rev2',
          'productName': 'Bonnet',
          'variantLabel': 'OS'
        }
      ]
    };
    await tester.pumpWidget(BoutiqueAccessScope(
        accessService: access,
        clubId: 'demo',
        userId: 'rb',
        child: MaterialApp(
            home: Builder(
                builder: (context) => Scaffold(
                    body: TextButton(
                        onPressed: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (_) => BoutiqueHandoverScreen(
                                    clubId: 'demo',
                                    missionId: 'm1',
                                    packet: packet,
                                    manager: true,
                                    service: service))),
                        child: const Text('Ouvrir')))))));
    await tester.tap(find.text('Ouvrir'));
    await tester.pumpAndSettle();
    expect(find.textContaining('QR'), findsNothing);
    await tester.tap(find.text('Polo'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Confirmer la remise'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirmer la remise'));
    await tester.pumpAndSettle();
    expect(requests.length, 2);
    expect(requests[0]['preview'], true);
    expect(requests[1]['verificationMethod'], 'manual');
    expect(requests[1]['recipientMemberId'], 'buyer');
    expect(requests[1]['units'], [
      {'id': 'p1', 'revision': 'rev1'}
    ]);
    expect(requests[0]['idempotencyKey'], requests[1]['idempotencyKey']);
  });
}
