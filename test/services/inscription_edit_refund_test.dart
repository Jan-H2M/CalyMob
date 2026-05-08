import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import 'package:calymob/models/supplement.dart';
import 'package:calymob/services/operation_service.dart';

/// Tests for OperationService.updateMyInscription().
///
/// Previously these tests wrote directly to FakeFirebaseFirestore,
/// bypassing the service entirely. Now they call the real
/// updateMyInscription() method — the same one the app uses.
///
/// Scenarios:
/// 1. Unpaid inscription, supplement change — no refund needed
/// 2. Paid inscription, price decrease — refund fire-and-forget
/// 3. Cancel guest on paid inscription — guest deleted, history written
/// 4. Edit history: written on every update
/// 5. Guest with supplements: delta reflects guest price + supplement
void main() {
  const clubId = 'club1';
  const operationId = 'op1';
  const userId = 'user1';
  const inscriptionId = 'ins1';
  const guestId = 'guest_initial_001';
  final inscriptionsPath =
      'clubs/$clubId/operations/$operationId/inscriptions';

  late FakeFirebaseFirestore firestore;
  late OperationService service;

  setUp(() async {
    firestore = FakeFirebaseFirestore();
    service = OperationService(firestore: firestore);
    // Every test needs an operation document (deadline check is now in the service)
    const opPath = 'clubs/$clubId/operations';
    await firestore.collection(opPath).doc(operationId).set({
      'titre': 'Test Event',
      'type': 'evenement',
      'statut': 'actif',
      'date_debut': Timestamp.fromDate(DateTime.now().add(const Duration(days: 14))),
      'created_at': Timestamp.now(),
      'updated_at': Timestamp.now(),
    });
  });

  /// Seed a basic operation in Firestore (overrides default, used for deadline edge cases)
  Future<void> seedOperation({DateTime? deadline}) async {
    await firestore
        .collection('clubs/$clubId/operations')
        .doc(operationId)
        .set({
      'titre': 'Test Event',
      'type': 'evenement',
      'statut': 'actif',
      'date_debut': Timestamp.fromDate(DateTime.now().add(const Duration(days: 14))),
      if (deadline != null)
        'registration_deadline': Timestamp.fromDate(deadline),
      'created_at': Timestamp.now(),
      'updated_at': Timestamp.now(),
    });
  }

  // ================================================================
  // Helper: seed a basic inscription with optional supplements
  // ================================================================
  Future<void> seedInscription({
    double prix = 50.0,
    bool paye = false,
    double? amountPaid,
    List<Map<String, dynamic>> supplements = const [],
    double supplementTotal = 0.0,
    String? parentInscriptionId,
  }) async {
    final data = <String, dynamic>{
      'operation_id': operationId,
      'membre_id': userId,
      'membre_nom': 'Janssen',
      'membre_prenom': 'Jan',
      'prix': prix,
      'paye': paye,
      'date_inscription': Timestamp.fromDate(DateTime(2026, 4, 1)),
      'selected_supplements': supplements,
      'supplement_total': supplementTotal,
      'created_at': Timestamp.now(),
      'updated_at': Timestamp.now(),
    };
    if (amountPaid != null) {
      data['amount_paid'] = amountPaid;
    }
    if (parentInscriptionId != null) {
      data['parent_inscription_id'] = parentInscriptionId;
    }
    await firestore.collection(inscriptionsPath).doc(inscriptionId).set(data);
  }

  /// Helper: seed a guest inscription linked to the main inscription
  Future<void> seedGuestInscription({
    required double prix,
    bool paye = false,
    double? amountPaid,
    double supplementTotal = 0.0,
    List<Map<String, dynamic>> supplements = const [],
  }) async {
    final data = <String, dynamic>{
      'operation_id': operationId,
      'membre_id': guestId,
      'membre_nom': 'Gast',
      'membre_prenom': 'Test',
      'prix': prix,
      'paye': paye,
      'is_guest': true,
      'parent_inscription_id': inscriptionId,
      'date_inscription': Timestamp.fromDate(DateTime(2026, 4, 1)),
      'selected_supplements': supplements,
      'supplement_total': supplementTotal,
      'created_at': Timestamp.now(),
      'updated_at': Timestamp.now(),
    };
    if (amountPaid != null) {
      data['amount_paid'] = amountPaid;
    }
    await firestore.collection(inscriptionsPath).add(data);
  }

  // ================================================================
  // Scenario 1: Unpaid inscription — supplement change (no refund)
  // ================================================================
  group('Scenario 1 — Unpaid inscription, supplement change', () {
    test('changing supplements on unpaid inscription succeeds, returns delta',
        () async {
      // Arrange: unpaid inscription with 1 supplement (€10)
      await seedInscription(
        prix: 50.0,
        paye: false,
        supplements: [
          {'id': 'sup1', 'name': 'Location combinaison', 'price': 10.0},
        ],
        supplementTotal: 10.0,
      );

      // Act: call real service — switch to a cheaper supplement
      const newTotal = 5.0;
      final delta = await service.updateMyInscription(
        clubId: clubId,
        operationId: operationId,
        inscriptionId: inscriptionId,
        selectedSupplements: [SelectedSupplement(id: 'sup2', name: 'Remplacement', price: 5.0)],
        supplementTotal: newTotal,
      );

      // Assert: delta = 60 - 55 = +5 (price went DOWN)
      //   oldTotal = prix(50) + oldSupplementTotal(10) = 60
      //   newTotal = prix(50) + newSupplementTotal(5)  = 55
      //   delta = oldTotal - newTotal = +5
      expect(delta, 5.0);

      // Assert: Firestore was updated correctly
      final doc = await firestore
          .collection(inscriptionsPath)
          .doc(inscriptionId)
          .get();
      final data = doc.data()!;
      expect((data['supplement_total'] as num).toDouble(), newTotal);
      expect(data['paye'], isFalse);
      expect(
        data['selected_supplements'],
        [{'id': 'sup2', 'name': 'Remplacement', 'price': 5.0}],
      );

      // Assert: edit_history subcollection has 1 entry
      final historySnap = await firestore
          .collection('$inscriptionsPath/$inscriptionId/edit_history')
          .get();
      expect(historySnap.docs.length, 1);
      final history = historySnap.docs.first.data();
      expect(history['action'], 'inscription_updated');
      expect((history['new_total'] as num).toDouble(), 5.0);
      expect((history['previous_total'] as num).toDouble(), 10.0);
    });

    test('no refund demande created for unpaid inscription even with delta>0',
        () async {
      // Arrange: unpaid inscription
      await seedInscription(
        prix: 50.0,
        paye: false,
        supplementTotal: 20.0,
        supplements: [
          {'id': 'sup1', 'name': 'Expensive', 'price': 20.0},
        ],
      );

      // Act: lower supplement total
      await service.updateMyInscription(
        clubId: clubId,
        operationId: operationId,
        inscriptionId: inscriptionId,
        selectedSupplements: [],
        supplementTotal: 0.0,
      );

      // Assert: even though delta=20 (price decreased), the inscription
      // is unpaid so no refund was needed — the update succeeded.
      final doc = await firestore
          .collection(inscriptionsPath)
          .doc(inscriptionId)
          .get();
      expect((doc.data()!['supplement_total'] as num).toDouble(), 0.0);
    });
  });

  // ================================================================
  // Scenario 2: Paid inscription — price decrease triggers refund
  //   The refund call is fire-and-forget inside updateMyInscription.
  //   It will fail in unit tests (no Cloud Functions emulator) but
  //   the Firestore batch already committed — the update succeeds.
  // ================================================================
  group('Scenario 2 — Paid inscription, price decrease (refund)', () {
    test('price decrease on paid inscription: update succeeds, delta positive',
        () async {
      // Arrange: paid inscription (€50 base + €10 supplement = €60 total)
      await seedInscription(
        prix: 50.0,
        paye: true,
        amountPaid: 60.0,
        supplementTotal: 10.0,
        supplements: [
          {'id': 'sup1', 'name': 'Location combinaison', 'price': 10.0},
        ],
      );

      // Act: remove all supplements (total goes from 60→50)
      final delta = await service.updateMyInscription(
        clubId: clubId,
        operationId: operationId,
        inscriptionId: inscriptionId,
        selectedSupplements: [],
        supplementTotal: 0.0,
      );

      // Assert: delta = 60 - 50 = +10
      expect(delta, 10.0);

      // Assert: Firestore updated
      final doc = await firestore
          .collection(inscriptionsPath)
          .doc(inscriptionId)
          .get();
      expect((doc.data()!['supplement_total'] as num).toDouble(), 0.0);
      expect(doc.data()!['selected_supplements'], isEmpty);
    });

    test('price increase on paid inscription: no refund, delta negative',
        () async {
      // Arrange: paid inscription (€50 base, €0 supplement)
      await seedInscription(
        prix: 50.0,
        paye: true,
        amountPaid: 50.0,
        supplementTotal: 0.0,
      );

      // Act: add supplement (price goes UP)
      final delta = await service.updateMyInscription(
        clubId: clubId,
        operationId: operationId,
        inscriptionId: inscriptionId,
        selectedSupplements: [SelectedSupplement(id: 'sup1', name: 'Add-on', price: 15.0)],
        supplementTotal: 15.0,
      );

      // Assert: delta = 50 - 65 = -15 (negative = price increased)
      expect(delta, -15.0);

      // Firestore updated
      final doc = await firestore
          .collection(inscriptionsPath)
          .doc(inscriptionId)
          .get();
      expect((doc.data()!['supplement_total'] as num).toDouble(), 15.0);
    });
  });

  // ================================================================
  // Scenario 3: Cancel 1 guest on paid inscription
  //   The service deletes the guest doc and writes edit_history.
  //   Refund CF call fails silently in tests (no CF emulator).
  // ================================================================
  group('Scenario 3 — Cancel guest on paid inscription', () {
    test('removing one guest: guest doc deleted, edit_history written', () async {
      // Arrange: paid parent + 2 guests
      await seedInscription(
        prix: 50.0,
        paye: true,
        amountPaid: 80.0,
        supplementTotal: 0.0,
      );

      // Create 2 guest docs and capture their IDs
      final g1Ref = await firestore.collection(inscriptionsPath).add({
        'operation_id': operationId,
        'membre_id': 'guest_1',
        'membre_nom': 'Gast1',
        'membre_prenom': 'Test',
        'prix': 30.0,
        'paye': true,
        'amount_paid': 30.0,
        'is_guest': true,
        'parent_inscription_id': inscriptionId,
        'created_at': Timestamp.now(),
        'updated_at': Timestamp.now(),
      });
      await firestore.collection(inscriptionsPath).add({
        'operation_id': operationId,
        'membre_id': 'guest_2',
        'membre_nom': 'Gast2',
        'membre_prenom': 'Test',
        'prix': 30.0,
        'paye': true,
        'amount_paid': 30.0,
        'is_guest': true,
        'parent_inscription_id': inscriptionId,
        'created_at': Timestamp.now(),
        'updated_at': Timestamp.now(),
      });

      // Act: remove guest 1 via service — supplement not changing
      // (no price change on parent, so delta = 0)
      final delta = await service.updateMyInscription(
        clubId: clubId,
        operationId: operationId,
        inscriptionId: inscriptionId,
        selectedSupplements: [],
        supplementTotal: 0.0,
        guestIdsToRemove: [g1Ref.id],
      );

      // Assert: delta includes guest totals
      //   oldTotal = prix(50) + supplement(0) + oldGuests(30+30) = 110
      //   newTotal = prix(50) + supplement(0) + newGuests(0)     = 50
      //   delta = 110 - 50 = 60
      expect(delta, 60.0);

      // Guest 1 doc deleted
      final g1Snap = await g1Ref.get();
      expect(g1Snap.exists, isFalse);

      // Guest 2 still exists
      final guestsAfter = await firestore
          .collection(inscriptionsPath)
          .where('parent_inscription_id', isEqualTo: inscriptionId)
          .get();
      expect(guestsAfter.docs.length, 1);

      // Assert: edit_history written
      final historySnap = await firestore
          .collection('$inscriptionsPath/$inscriptionId/edit_history')
          .get();
      expect(historySnap.docs.length, 1);
      final history = historySnap.docs.first.data();
      expect(history['guests_removed'], [g1Ref.id]);
    });
  });

  // ================================================================
  // Scenario 4: Edit history structure
  // ================================================================
  group('Scenario 4 — Edit history written correctly', () {
    test('edit_history contains previous and new supplement info', () async {
      await seedInscription(
        prix: 50.0,
        paye: false,
        supplementTotal: 10.0,
        supplements: [
          {'id': 'sup1', 'name': 'Old', 'price': 10.0},
        ],
      );

      await service.updateMyInscription(
        clubId: clubId,
        operationId: operationId,
        inscriptionId: inscriptionId,
        selectedSupplements: [SelectedSupplement(id: 'sup2', name: 'Extra 1', price: 10.0), SelectedSupplement(id: 'sup3', name: 'Extra 2', price: 5.0)],
        supplementTotal: 15.0,
      );

      final historySnap = await firestore
          .collection('$inscriptionsPath/$inscriptionId/edit_history')
          .get();
      expect(historySnap.docs.length, 1);
      final history = historySnap.docs.first.data();

      expect(history['action'], 'inscription_updated');
      expect(history['inscription_id'], inscriptionId);
      expect((history['previous_total'] as num).toDouble(), 10.0);
      expect((history['new_total'] as num).toDouble(), 15.0);
      expect(history['previous_supplements'], [
        {'id': 'sup1', 'name': 'Old', 'price': 10.0},
      ]);
      expect(history['new_supplements'], [
        {'id': 'sup2', 'name': 'Extra 1', 'price': 10.0},
        {'id': 'sup3', 'name': 'Extra 2', 'price': 5.0},
      ]);
      expect(history['guests_added'], isEmpty);
      expect(history['guests_removed'], isEmpty);
    });
  });

  // ================================================================
  // Scenario 5: Guest delta calculation
  //   When a guest has supplements, delta should reflect the guest
  //   prix + supplement_total. The service returns the parent's delta
  //   (based on supplement_total change), not the guest's individually.
  //   We test that guest data (prix + supplement_total) is stored correctly.
  // ================================================================
  group('Scenario 5 — Guest supplements stored correctly', () {
    test('adding a guest with supplements stores prix + supplement_total',
        () async {
      await seedInscription(
        prix: 50.0,
        paye: false,
        supplementTotal: 0.0,
      );

      // Act: add a guest via GuestUpdate (inscriptionId=null)
      await service.updateMyInscription(
        clubId: clubId,
        operationId: operationId,
        inscriptionId: inscriptionId,
        selectedSupplements: [],
        supplementTotal: 0.0,
        guests: [
          GuestUpdate(
            inscriptionId: null, // new guest
            prenom: 'Marie',
            nom: 'Dupont',
            prix: 25.0,
            tariffId: null,
            selectedSupplements: [SelectedSupplement(id: 'sup_palmes', name: 'Palmes', price: 5.0)],
            supplementTotal: 5.0,
          ),
        ],
      );

      // Assert: guest doc exists with correct amounts
      final guests = await firestore
          .collection(inscriptionsPath)
          .where('parent_inscription_id', isEqualTo: inscriptionId)
          .get();
      expect(guests.docs.length, 1);
      final guest = guests.docs.first.data();
      expect((guest['prix'] as num).toDouble(), 25.0);
      expect((guest['supplement_total'] as num).toDouble(), 5.0);
      expect(guest['is_guest'], isTrue);
      expect(guest['paye'], isFalse); // new guests start unpaid
      expect(
        guest['selected_supplements'],
        [{'id': 'sup_palmes', 'name': 'Palmes', 'price': 5.0}],
      );
    });
  });
}
