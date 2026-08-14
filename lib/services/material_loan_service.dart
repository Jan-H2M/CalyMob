import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/material_loan.dart';

/// Production service for the direct material-loan flow.
///
/// The transaction is intentionally all-or-nothing: a loan, its inventory
/// reservation and its audit entry are created together. The caller must only
/// invoke [createDirectLoan] after the organizer has confirmed the fixed
/// caution of EUR 100 was received.
class MaterialLoanService {
  static const double fixedCautionAmount = 100;

  final FirebaseFirestore _firestore;

  MaterialLoanService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  Stream<List<MaterialLoan>> watchMyActiveLoans({
    required String clubId,
    required String memberId,
  }) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_loans')
        .where('memberId', isEqualTo: memberId)
        .snapshots()
        .asyncMap((snapshot) async {
      final loans = <MaterialLoan>[];
      for (final document in snapshot.docs) {
        final loan = MaterialLoan.fromFirestore(document);
        if (!{'actif', 'en_cours', 'en_retard'}.contains(loan.status)) {
          continue;
        }
        final items = await _loadLoanItems(clubId, loan.itemIds);
        loans.add(MaterialLoan.fromFirestore(document, items: items));
      }
      loans.sort((left, right) {
        final leftDate = left.expectedReturnDate ?? left.loanDate;
        final rightDate = right.expectedReturnDate ?? right.loanDate;
        if (leftDate == null && rightDate == null) return 0;
        if (leftDate == null) return 1;
        if (rightDate == null) return -1;
        return leftDate.compareTo(rightDate);
      });
      return loans;
    });
  }

  Future<List<MaterialLoanMember>> loadActiveMembers(String clubId) async {
    final snapshot = await _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('member_directory')
        .get();

    final members = snapshot.docs
        .where((document) => document.data()['is_test_account'] != true)
        .where((document) {
      final status = document.data()['member_status']?.toString();
      return status == null || status == 'active';
    }).map((document) {
      final data = document.data();
      final name = (data['display_name'] ??
              data['displayName'] ??
              '${data['prenom'] ?? ''} ${data['nom'] ?? ''}')
          .toString()
          .trim();
      return MaterialLoanMember(
        id: document.id,
        name: name.isEmpty ? 'Membre' : name,
      );
    }).toList();
    members.sort((left, right) => left.name.compareTo(right.name));
    return members;
  }

  /// Creates a handed-over loan after an organizer manually confirmed that the
  /// EUR 100 caution was paid. No email, QR payment or bank transaction is
  /// initiated here; those need their own verified payment integration.
  Future<String> createDirectLoan({
    required String clubId,
    required MaterialLoanMember member,
    required List<MaterialLoanItem> items,
    required DateTime expectedReturnDate,
    required String createdByUserId,
    required String createdByName,
    String? notes,
  }) async {
    if (items.isEmpty) {
      throw ArgumentError.value(
          items, 'items', 'Au moins un article est requis');
    }
    if (items.map((item) => item.id).toSet().length != items.length) {
      throw ArgumentError.value(
          items, 'items', 'Chaque article ne peut être prêté qu’une fois');
    }

    final clubRef = _firestore.collection('clubs').doc(clubId);
    final loansRef = clubRef.collection('inventory_loans');
    final loanRef = loansRef.doc();
    final now = FieldValue.serverTimestamp();
    final year = DateTime.now().year;
    final counterRef =
        clubRef.collection('inventory_loan_counters').doc('$year');
    final auditRef = clubRef.collection('audit_logs').doc();

    await _firestore.runTransaction((transaction) async {
      final counterSnapshot = await transaction.get(counterRef);
      final nextCounter =
          (counterSnapshot.data()?['counter'] as num? ?? 0).toInt() + 1;
      final loanNumber = 'PRET-$year-${nextCounter.toString().padLeft(4, '0')}';

      // Firestore transactions require every read to complete before the first
      // write. Read the complete selected inventory set first so a concurrent
      // loan cannot reserve the same physical article in between.
      final itemRefs = items
          .map((item) => clubRef.collection('inventory_items').doc(item.id))
          .toList();
      final itemDocuments = await Future.wait(
        itemRefs.map(transaction.get),
      );
      final itemSnapshots = <Map<String, dynamic>>[];
      for (var index = 0; index < items.length; index++) {
        final requestedItem = items[index];
        final itemSnapshot = itemDocuments[index];
        if (!itemSnapshot.exists) {
          throw StateError(
              'Matériel introuvable: ${requestedItem.inventoryLabel}');
        }
        final data = itemSnapshot.data() ?? const <String, dynamic>{};
        final status = (data['statut'] ?? data['status'] ?? 'disponible')
            .toString()
            .toLowerCase();
        if (!{'disponible', 'available', 'en_stock', 'libre'}
            .contains(status)) {
          throw StateError(
            'Matériel non disponible: ${requestedItem.inventoryLabel}',
          );
        }

        itemSnapshots.add({
          'id': itemSnapshot.id,
          'code': data['code']?.toString() ?? requestedItem.code,
          'nom': data['nom']?.toString() ?? requestedItem.name,
          'fabricant': data['fabricant']?.toString() ?? requestedItem.brand,
          'modele': data['modele']?.toString() ?? requestedItem.model,
          'numero_serie':
              data['numero_serie']?.toString() ?? requestedItem.serialNumber,
          'type_id': data['typeId']?.toString() ?? requestedItem.typeId,
          'type_name': requestedItem.typeName,
          'variant': requestedItem.variant,
        });
      }

      for (final itemRef in itemRefs) {
        transaction.update(itemRef, {
          'statut': 'prete',
          'current_loan_id': loanRef.id,
          'updatedAt': now,
        });
      }

      transaction.set(
          counterRef,
          {
            'counter': nextCounter,
            'year': year,
            'updatedAt': now,
          },
          SetOptions(merge: true));

      transaction.set(loanRef, {
        'loanNumber': loanNumber,
        'memberId': member.id,
        'memberName': member.name,
        'itemIds': items.map((item) => item.id).toList(),
        'items_snapshot': itemSnapshots,
        'statut': 'actif',
        'date_pret': now,
        'date_retour_prevue': Timestamp.fromDate(expectedReturnDate),
        'caution_amount': fixedCautionAmount,
        'caution_payment_status': 'paid',
        'caution_paid_at': now,
        'payment_mode': 'onsite_confirmed',
        'handover_status': 'handed_over',
        'notes': notes?.trim(),
        'createdBy': createdByUserId,
        'createdByName': createdByName,
        'createdAt': now,
        'updatedAt': now,
      });

      transaction.set(auditRef, {
        'event_type': 'material_loan_created',
        'entity_type': 'inventory_loan',
        'entity_id': loanRef.id,
        'loan_number': loanNumber,
        'member_id': member.id,
        'member_name': member.name,
        'item_ids': items.map((item) => item.id).toList(),
        'caution_amount': fixedCautionAmount,
        'actor_id': createdByUserId,
        'actor_name': createdByName,
        'createdAt': now,
      });
    });

    return loanRef.id;
  }

  Future<List<MaterialLoanItem>> _loadLoanItems(
    String clubId,
    List<String> itemIds,
  ) async {
    final items = <MaterialLoanItem>[];
    for (final itemId in itemIds) {
      final snapshot = await _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('inventory_items')
          .doc(itemId)
          .get();
      if (snapshot.exists) {
        items.add(MaterialLoanItem.fromFirestore(snapshot));
      }
    }
    return items;
  }
}

class MaterialLoanMember {
  final String id;
  final String name;

  const MaterialLoanMember({required this.id, required this.name});
}
