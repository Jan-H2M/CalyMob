import 'package:calymob/providers/boutique_cart_provider.dart';
import 'package:calymob/screens/boutique/boutique_screen.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const clubId = 'calypso';
  const userId = 'member-1';
  const sectionTitles = [
    'Produits',
    'Ma cotisation',
    'Mon matériel emprunté',
    'Mon panier',
    'Mes commandes',
  ];

  Future<void> pumpAccessEvent(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));
  }

  void expectSections({required bool visible}) {
    for (final title in sectionTitles) {
      expect(find.text(title), visible ? findsOneWidget : findsNothing);
    }
  }

  testWidgets(
    'live access removes and restores all sections without a new login',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final firestore = FakeFirebaseFirestore();
      final flagsRef = firestore
          .collection('clubs')
          .doc(clubId)
          .collection('settings')
          .doc('feature_flags');
      final memberRef = firestore
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .doc(userId);

      await flagsRef.set({
        'boutiqueEnabled': true,
        'boutiqueMobileEnabled': true,
        'boutiqueAccess': 'testeurs',
      });
      await memberRef.set({
        'member_status': 'active',
        'clubStatuten': <String>[],
      });

      final cart = BoutiqueCartProvider(
        authStateChanges: const Stream<User?>.empty(),
      );
      addTearDown(cart.dispose);
      await tester.pumpWidget(
        ChangeNotifierProvider<BoutiqueCartProvider>.value(
          value: cart,
          child: MaterialApp(
            home: BoutiqueScreen(
              accessService: BoutiqueAccessService(firestore: firestore),
              clubId: clubId,
              userId: userId,
            ),
          ),
        ),
      );
      await pumpAccessEvent(tester);

      // Direct navigation in preparation fails closed for an ordinary member.
      expect(
        find.byKey(const Key('boutique-access-unavailable')),
        findsOneWidget,
      );
      expectSections(visible: false);

      // Adding the Boutique responsibility is observed without logging in again.
      await memberRef.update({
        'clubStatuten': ['Responsable boutique'],
      });
      await pumpAccessEvent(tester);
      expect(
        find.byKey(const Key('boutique-access-unavailable')),
        findsNothing,
      );
      expectSections(visible: true);

      // Becoming inactive immediately invalidates the already open screen.
      await memberRef.update({'member_status': 'inactive'});
      await pumpAccessEvent(tester);
      expect(
        find.byKey(const Key('boutique-access-unavailable')),
        findsOneWidget,
      );
      expectSections(visible: false);

      await memberRef.update({'member_status': 'active'});
      await pumpAccessEvent(tester);
      expectSections(visible: true);

      // Removing the responsibility immediately hides every card.
      await memberRef.update({'clubStatuten': <String>[]});
      await pumpAccessEvent(tester);
      expect(
        find.byKey(const Key('boutique-access-unavailable')),
        findsOneWidget,
      );
      expectSections(visible: false);

      // Going online grants every active member all five fallback sections.
      await memberRef.update({
        'member_status': 'active',
        'clubStatuten': <String>[],
      });
      await flagsRef.update({'boutiqueAccess': 'tous'});
      await pumpAccessEvent(tester);
      expect(
        find.byKey(const Key('boutique-access-unavailable')),
        findsNothing,
      );
      expectSections(visible: true);

      // Disabling the module invalidates an already open direct route.
      await flagsRef.update({
        'boutiqueEnabled': false,
        'boutiqueMobileEnabled': false,
      });
      await pumpAccessEvent(tester);
      expect(
        find.byKey(const Key('boutique-access-unavailable')),
        findsOneWidget,
      );
      expectSections(visible: false);

      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
