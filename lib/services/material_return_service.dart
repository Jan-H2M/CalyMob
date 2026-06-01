import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../models/material_loan.dart';

enum MaterialReturnDecision {
  fullRefund,
  partialRefund,
  retainCaution,
  decideLater,
}

class MaterialReturnResult {
  final String? demandId;
  final String? paymentReference;

  const MaterialReturnResult({
    this.demandId,
    this.paymentReference,
  });
}

class MaterialReturnService {
  final FirebaseFirestore _firestore;

  MaterialReturnService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  Stream<List<MaterialLoan>> watchReturnableLoans(String clubId) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_loans')
        .where('statut', whereIn: ['actif', 'en_retard', 'en_cours'])
        .snapshots()
        .asyncMap((snapshot) async {
          final loans = <MaterialLoan>[];

          for (final doc in snapshot.docs) {
            final rawLoan = MaterialLoan.fromFirestore(doc);
            final items = await _loadLoanItems(clubId, rawLoan.itemIds);
            loans.add(MaterialLoan.fromFirestore(doc, items: items));
          }

          loans.sort((a, b) {
            final aDate = a.expectedReturnDate ?? a.loanDate ?? DateTime(1900);
            final bDate = b.expectedReturnDate ?? b.loanDate ?? DateTime(1900);
            return aDate.compareTo(bDate);
          });

          return loans;
        });
  }

  Stream<List<MaterialLoanItem>> watchBorrowableItems(String clubId) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_items')
        .where('statut', isEqualTo: 'disponible')
        .snapshots()
        .asyncMap((snapshot) async {
      final typeNames = await _loadItemTypeNames(clubId);
      final items = snapshot.docs.map((doc) {
        final item = MaterialLoanItem.fromFirestore(doc);
        return item.copyWithTypeName(typeNames[item.typeId]);
      }).toList();
      items.sort((a, b) => a.displayName.compareTo(b.displayName));
      return items;
    });
  }

  Future<Map<String, String>> _loadItemTypeNames(String clubId) async {
    try {
      final snapshot = await _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('inventory_config')
          .doc('settings')
          .collection('item_types')
          .get();

      return {
        for (final doc in snapshot.docs)
          doc.id: doc.data()['nom']?.toString() ??
              doc.data()['name']?.toString() ??
              doc.data()['code']?.toString() ??
              doc.id,
      };
    } catch (e) {
      debugPrint('Types materiel niet geladen: $e');
      return const {};
    }
  }

  Stream<List<MaterialLoanRequest>> watchMyLoanRequests({
    required String clubId,
    required String memberId,
  }) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_loan_requests')
        .where('memberId', isEqualTo: memberId)
        .where('status', whereIn: ['submitted', 'approved'])
        .snapshots()
        .asyncMap((snapshot) async {
          final requests = <MaterialLoanRequest>[];
          for (final doc in snapshot.docs) {
            final rawRequest = MaterialLoanRequest.fromFirestore(doc);
            final items = await _loadLoanItems(clubId, rawRequest.itemIds);
            requests.add(
              MaterialLoanRequest.fromFirestore(doc, items: items),
            );
          }

          requests.sort((a, b) {
            final aDate = a.createdAt ?? DateTime(1900);
            final bDate = b.createdAt ?? DateTime(1900);
            return bDate.compareTo(aDate);
          });
          return requests;
        });
  }

  Future<String> submitLoanRequest({
    required String clubId,
    required String memberId,
    required String memberName,
    required String memberEmail,
    required List<MaterialLoanItem> items,
    required DateTime expectedReturnDate,
    String? notes,
  }) async {
    if (items.isEmpty) {
      throw Exception('Choisissez au moins un materiel');
    }

    final requestRef = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_loan_requests')
        .doc();

    final itemSnapshots = items
        .map((item) => {
              'id': item.id,
              'code': item.code,
              'nom': item.name,
              'fabricant': item.brand,
              'modele': item.model,
              'numero_serie': item.serialNumber,
            })
        .toList();

    await requestRef.set({
      'memberId': memberId,
      'memberName': memberName,
      'memberEmail': memberEmail,
      'itemIds': items.map((item) => item.id).toList(),
      'items_snapshot': itemSnapshots,
      'date_retour_prevue': Timestamp.fromDate(expectedReturnDate),
      'status': 'submitted',
      'notes': notes?.trim(),
      'source': 'calymob',
      'createdBy': memberId,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });

    return requestRef.id;
  }

  Future<List<MaterialLoanItem>> _loadLoanItems(
    String clubId,
    List<String> itemIds,
  ) async {
    if (itemIds.isEmpty) return const [];

    final items = <MaterialLoanItem>[];
    for (final itemId in itemIds) {
      try {
        final doc = await _firestore
            .collection('clubs')
            .doc(clubId)
            .collection('inventory_items')
            .doc(itemId)
            .get();
        if (doc.exists) {
          items.add(MaterialLoanItem.fromFirestore(doc));
        }
      } catch (e) {
        debugPrint('Materiel $itemId niet geladen: $e');
      }
    }
    return items;
  }

  Future<MaterialReturnResult> validateReturn({
    required String clubId,
    required MaterialLoan loan,
    required MaterialReturnDecision decision,
    required double refundAmount,
    required String validatedByUserId,
    required String validatedByName,
    String? notes,
  }) async {
    final loanRef = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_loans')
        .doc(loan.id);

    final itemsRef = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_items');
    final memberRef = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .doc(loan.memberId);

    final year = DateTime.now().year;
    final demandId = 'loan_caution_refund_${loan.id}';
    final demandRef = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('demandes_remboursement')
        .doc(demandId);
    final canonicalDemandRef = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('expense_claims')
        .doc(demandId);
    final counterRef = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('settings')
        .doc('rem_reference_counter_$year');

    return _firestore.runTransaction((transaction) async {
      final loanSnap = await transaction.get(loanRef);
      if (!loanSnap.exists) {
        throw Exception('Pret introuvable');
      }

      final existingDemandSnap = await transaction.get(demandRef);
      final memberSnap =
          loan.memberId.isNotEmpty ? await transaction.get(memberRef) : null;

      String? paymentReference;
      String? paymentReferenceKey;
      String? communicationQr;

      if (refundAmount > 0 && !existingDemandSnap.exists) {
        final counterSnap = await transaction.get(counterRef);
        final nextCounter =
            (counterSnap.data()?['counter'] as num? ?? 0).toInt() + 1;
        paymentReference =
            'REM-$year-${nextCounter.toString().padLeft(4, '0')}';
        paymentReferenceKey = '+++$paymentReference+++';
        communicationQr =
            '$paymentReferenceKey Remb. caution ${loan.loanNumber}';

        transaction.set(
            counterRef,
            {
              'counter': nextCounter,
              'year': year,
              'updated_at': FieldValue.serverTimestamp(),
            },
            SetOptions(merge: true));
      } else if (existingDemandSnap.exists) {
        final data = existingDemandSnap.data() ?? {};
        paymentReference = data['payment_reference']?.toString();
        communicationQr = data['communication_qr']?.toString();
      }

      final now = FieldValue.serverTimestamp();
      final retainedAmount =
          (loan.cautionAmount - refundAmount).clamp(0, loan.cautionAmount);
      final cautionStatus = _cautionStatusFor(decision, refundAmount);

      transaction.update(loanRef, {
        'statut': 'rendu',
        'date_retour_reel': now,
        'return_validated_at': now,
        'return_validated_by': validatedByUserId,
        'return_validated_by_name': validatedByName,
        'return_decision': decision.name,
        'return_notes': notes?.trim(),
        'notes_retour': notes?.trim(),
        'caution_retournee': refundAmount,
        'caution_non_rendue': retainedAmount,
        'caution_payment_status': cautionStatus,
        if (refundAmount > 0) 'caution_refund_demand_id': demandId,
        'updatedAt': now,
      });

      for (final itemId in loan.itemIds) {
        transaction.update(itemsRef.doc(itemId), {
          'statut': 'disponible',
          'updatedAt': now,
        });
      }

      if (refundAmount > 0 && !existingDemandSnap.exists) {
        final memberData = memberSnap?.data() ?? {};
        final memberName = _memberName(memberData, fallback: loan.memberName);
        final fiscalYearId = 'FY$year';
        final description =
            'Retour materiel valide pour ${loan.loanNumber}. Caution a rembourser.';

        final legacyPayload = <String, dynamic>{
          'club_id': clubId,
          'demandeur_id': loan.memberId,
          'demandeur_nom': memberName,
          'demandeur_prenom': memberData['prenom']?.toString() ?? '',
          'demandeur_email': memberData['email']?.toString() ?? '',
          'titre': 'Remboursement caution materiel ${loan.loanNumber}',
          'description': description,
          'montant': refundAmount,
          'categorie': 'caution_materiel',
          'code_comptable': '439-00-002',
          'accounting_context': 'loan_caution_refunded',
          'statut': 'approuve',
          'date_depense': now,
          'date_demande': now,
          'date_soumission': now,
          'date_approbation': now,
          'approuve_par': validatedByUserId,
          'approuve_par_nom': validatedByName,
          'beneficiaire_type': 'demandeur',
          'source': 'loan_caution_return',
          'source_loan_id': loan.id,
          'source_loan_number': loan.loanNumber,
          'linked_to_loan_id': loan.id,
          'linked_entity_type': 'loan_caution_refund',
          'payment_reference': paymentReference,
          'payment_reference_key': paymentReferenceKey,
          'communication_qr': communicationQr,
          'fiscal_year_id': fiscalYearId,
          'created_by': validatedByUserId,
          'created_at': now,
          'updated_at': now,
          'status_history': [
            {
              'from': null,
              'to': 'approuve',
              'at': Timestamp.now(),
              'by': validatedByUserId,
              'by_name': validatedByName,
              'reason': 'Retour materiel valide depuis CalyMob',
            }
          ],
        };

        transaction.set(demandRef, legacyPayload);
        transaction.set(
            canonicalDemandRef,
            _canonicalPayload(
              legacyPayload,
              demandId,
              clubId,
            ));
      }

      return MaterialReturnResult(
        demandId: refundAmount > 0 ? demandId : null,
        paymentReference: paymentReference,
      );
    });
  }

  String _cautionStatusFor(
      MaterialReturnDecision decision, double refundAmount) {
    switch (decision) {
      case MaterialReturnDecision.fullRefund:
        return 'refund_pending';
      case MaterialReturnDecision.partialRefund:
        return refundAmount > 0 ? 'partially_refund_pending' : 'retained';
      case MaterialReturnDecision.retainCaution:
        return 'retained';
      case MaterialReturnDecision.decideLater:
        return 'return_validated';
    }
  }

  String _memberName(Map<String, dynamic> data, {required String fallback}) {
    final displayName = data['displayName']?.toString();
    if (displayName != null && displayName.trim().isNotEmpty) {
      return displayName.trim();
    }

    final name = [
      data['prenom']?.toString(),
      data['nom']?.toString(),
    ].where((part) => part != null && part.trim().isNotEmpty).join(' ');

    return name.trim().isNotEmpty ? name.trim() : fallback;
  }

  Map<String, dynamic> _canonicalPayload(
    Map<String, dynamic> legacy,
    String demandId,
    String clubId,
  ) {
    return {
      'club_id': clubId,
      'legacy_collection': 'demandes_remboursement',
      'legacy_document_id': demandId,
      'requester_id': legacy['demandeur_id'],
      'requester_name': legacy['demandeur_nom'],
      'requester_first_name': legacy['demandeur_prenom'],
      'requester_email': legacy['demandeur_email'],
      'title': legacy['titre'],
      'amount': legacy['montant'],
      'description': legacy['description'],
      'category': legacy['categorie'],
      'account_code': legacy['code_comptable'],
      'status': 'approved',
      'requested_at': legacy['date_demande'],
      'expense_date': legacy['date_depense'],
      'submitted_at': legacy['date_soumission'],
      'approved_at': legacy['date_approbation'],
      'approved_by': legacy['approuve_par'],
      'approved_by_name': legacy['approuve_par_nom'],
      'beneficiary_type': legacy['beneficiaire_type'],
      'payment_qr_message': legacy['communication_qr'],
      'payment_reference': legacy['payment_reference'],
      'payment_reference_key': legacy['payment_reference_key'],
      'fiscal_year_id': legacy['fiscal_year_id'],
      'source_loan_id': legacy['source_loan_id'],
      'source_loan_number': legacy['source_loan_number'],
      'accounting_context': legacy['accounting_context'],
      'created_at': legacy['created_at'],
      'updated_at': legacy['updated_at'],
      'created_by': legacy['created_by'],
    };
  }
}
