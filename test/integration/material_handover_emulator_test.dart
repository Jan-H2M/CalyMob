@TestOn('browser')
library;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
// Explicit registration is required by flutter test's browser harness.
// ignore: depend_on_referenced_packages
import 'package:firebase_core_web/firebase_core_web.dart';
// ignore: depend_on_referenced_packages
import 'package:cloud_firestore_web/cloud_firestore_web.dart';
// ignore: depend_on_referenced_packages
import 'package:flutter_web_plugins/flutter_web_plugins.dart';
import 'package:calymob/models/material_loan.dart';
import 'package:calymob/services/material_loan_service.dart';

void main() {
  const enabled = bool.fromEnvironment('RUN_FIRESTORE_EMULATOR');
  test('real transaction contention allows exactly one physical handover',
      () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    FirebaseCoreWeb.registerWith(Registrar());
    FirebaseFirestoreWeb.registerWith(Registrar());
    final app = await Firebase.initializeApp(
            name: 'handover-test',
            options: const FirebaseOptions(
                apiKey: 'demo-not-a-real-key',
                appId: '1:123:web:local-test',
                messagingSenderId: '123',
                projectId: 'demo-calypso-release'))
        .timeout(const Duration(seconds: 12),
            onTimeout: () =>
                throw StateError('Firebase web initialization timed out'));
    final db = FirebaseFirestore.instanceFor(app: app);
    db.settings = const Settings(persistenceEnabled: false);
    db.useFirestoreEmulator('127.0.0.1', 8087);
    final service = MaterialLoanService(firestore: db);
    const clubId = 'emulator_handover';
    final itemId = 'item-${DateTime.now().microsecondsSinceEpoch}';
    final itemRef = db.doc('clubs/$clubId/inventory_items/$itemId');
    await itemRef.set({
      'typeId': 'gilet',
      'nom': 'Gilet',
      'code': itemId,
      'taille': 'XL',
      'numero_serie': 'SER-EMULATOR',
      'statut': 'disponible'
    }).timeout(const Duration(seconds: 12),
        onTimeout: () => throw StateError('Local emulator seed timed out'));
    Future<String> request() => service.createPendingTypeLoan(
        clubId: clubId,
        member: const MaterialLoanMember(id: 'member', name: 'Test'),
        requestedLines: const [
          MaterialLoanRequestedLine(
              typeId: 'gilet', typeName: 'Gilet', variant: 'XL')
        ],
        expectedReturnDate: DateTime(2026, 10, 1),
        createdByUserId: 'test-staff',
        createdByName: 'Test staff',
        paymentMode: 'epc_qr_email');
    final first = await request();
    final second = await request();
    expect((await itemRef.get()).data()!['statut'], 'disponible');
    final results = await Future.wait([first, second].map((id) async {
      try {
        await service.confirmPendingPaymentAndHandover(
            clubId: clubId,
            loanId: id,
            confirmedByUserId: 'test-staff',
            confirmedByName: 'Test staff',
            selectedItemIds: [itemId],
            paymentConfirmed: true);
        return true;
      } catch (_) {
        // FlutterFire web boxes a Dart transaction rejection in a JS error.
        // Assert the durable loser/winner state below, not its wrapper type.
        return false;
      }
    }));
    expect(results.where((value) => value).length, 1);
    final winner = results.first ? first : second;
    final loser = results.first ? second : first;
    expect((await itemRef.get()).data()!['current_loan_id'], winner);
    expect(
        (await db.doc('clubs/$clubId/inventory_loans/$winner').get())
            .data()!['statut'],
        'actif');
    final pending =
        (await db.doc('clubs/$clubId/inventory_loans/$loser').get()).data()!;
    expect(pending['statut'], 'attente_caution');
    expect(pending['itemIds'], isEmpty);
    await db.terminate();
    await app.delete();
  },
      skip: !enabled
          ? 'Run explicitly with local demo Firestore emulator and --platform chrome.'
          : false);
}
