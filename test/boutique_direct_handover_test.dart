import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:calymob/screens/boutique/boutique_direct_handover_screen.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:calymob/widgets/boutique/boutique_access_guard.dart';

void main() {
  testWidgets(
      'chooses a member and confirms a handover without a mission or QR',
      (tester) async {
    final calls = <Map<String, dynamic>>[];
    final service = BoutiqueOperationsService(transport: (request) async {
      calls.add(Map.of(request));
      if (request['action'] == 'handoverCandidates')
        return {
          'units': [
            {
              'id': 'piece',
              'revision': 'r1',
              'productName': 'Polo',
              'variantLabel': 'M',
              'buyerId': 'buyer',
              'buyerName': 'Alex',
              'orderNumber': 'BTQ-1',
              'location': 'Club'
            }
          ],
          'hasMore': false
        };
      if (request['action'] == 'manualDeliver') return {'count': 1};
      throw StateError('unexpected');
    });
    final access = BoutiqueAccessService(
        firestore: FakeFirebaseFirestore(),
        authUserIds: () => Stream.value('rb'));
    await tester.pumpWidget(BoutiqueAccessScope(
        accessService: access,
        clubId: 'demo',
        userId: 'rb',
        child: MaterialApp(
            home: BoutiqueDirectHandoverScreen(
                clubId: 'demo', service: service))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Alex · Polo'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remettre au membre'));
    await tester.pumpAndSettle();
    expect(find.text('Confirmer la remise ?'), findsOneWidget);
    expect(calls.where((v) => v['action'] == 'manualDeliver').length, 1);
    await tester.tap(find.text('Confirmer'));
    await tester.pumpAndSettle();
    final changes = calls.where((v) => v['action'] == 'manualDeliver').toList();
    expect(changes.length, 2);
    expect(changes.first['preview'], true);
    expect(changes.last['recipientMemberId'], 'buyer');
    expect(changes.last['verificationMethod'], 'manual');
    expect(changes.last.containsKey('missionId'), false);
  });
}
