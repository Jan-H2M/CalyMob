import 'package:rxdart/rxdart.dart';
import 'package:calymob/screens/boutique/boutique_screen.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class AssignmentOperations extends BoutiqueOperationsService {
  final assignments = BehaviorSubject<bool>.seeded(false);
  @override
  Stream<bool> watchHasAssignment(String clubId) => assignments.stream;
}

void main() {
  testWidgets(
      'RB alone sees Gestion Boutique; assigned accueil only sees Mes remises in preparation; live revocation hides it',
      (tester) async {
    final firestore = FakeFirebaseFirestore(),
        operations = AssignmentOperations();
    addTearDown(operations.assignments.close);
    final flags = firestore.doc('clubs/calypso/settings/feature_flags'),
        member = firestore.doc('clubs/calypso/members/actor');
    await flags.set({
      'boutiqueEnabled': true,
      'boutiqueAccess': 'testeurs',
      'boutiqueQrEnabled': true,
      'boutiqueSections': {
        'produits': 'masque',
        'panier': 'masque',
        'commandes': 'masque',
        'cotisation': 'masque',
        'pretsMateriel': 'masque'
      }
    });
    await member.set({
      'member_status': 'active',
      'clubStatuten': ['RB']
    });
    final service = BoutiqueAccessService(
        firestore: firestore,
        operations: operations,
        authUserIds: () => Stream.value('actor'));
    await tester.pumpWidget(MaterialApp(
        home: BoutiqueScreen(
            accessService: service,
            clubId: 'calypso',
            testUserIdOverride: 'actor')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));
    expect(find.text('Gestion Boutique'), findsOneWidget);
    expect(find.text('Mes remises'), findsNothing);
    await member.update({
      'clubStatuten': ['Accueil'],
      'role': 'admin'
    });
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));
    operations.assignments.add(true);
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    expect(find.text('Gestion Boutique'), findsNothing);
    expect(find.text('Mes remises'), findsOneWidget);
    expect(find.text('Produits'), findsNothing);
    expect(find.text('Mon panier'), findsNothing);
    operations.assignments.add(false);
    await tester.pump();
    expect(
        find.byKey(const Key('boutique-access-unavailable')), findsOneWidget);
    operations.assignments.add(true);
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    await flags.update({'boutiqueQrEnabled': false});
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));
    await tester.pump();
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    expect(find.text('Mes remises'), findsNothing);
    expect(find.text('Gestion Boutique'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });
}
