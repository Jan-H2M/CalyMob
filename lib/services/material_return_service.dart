import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';

import '../models/material_loan.dart';

enum MaterialReturnDecision {
  fullRefund,
  partialRefund,
  retainCaution,
  decideLater,
}

/// Physical condition recorded for one exact inventory item at return.
///
/// Incidents belong to the physical item, not merely to the loan. This makes
/// its history available to CalyCompta when staff repair or replace equipment.
enum MaterialReturnItemCondition { good, damaged, missing }

class MaterialReturnItemCheck {
  final String itemId;
  final MaterialReturnItemCondition condition;
  final String? note;
  final List<String> photoUrls;

  const MaterialReturnItemCheck({
    required this.itemId,
    this.condition = MaterialReturnItemCondition.good,
    this.note,
    this.photoUrls = const [],
  });

  Map<String, dynamic> toMap() => {
        'item_id': itemId,
        'condition': condition.name,
        if (note != null && note!.trim().isNotEmpty) 'note': note!.trim(),
        'photo_urls': photoUrls,
      };
}

class MaterialReturnResult {
  final String? refundRequestId;

  const MaterialReturnResult({this.refundRequestId});
}

class MaterialReturnService {
  final FirebaseFirestore _firestore;
  FirebaseStorage? _storage;

  MaterialReturnService({
    FirebaseFirestore? firestore,
    FirebaseStorage? storage,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _storage = storage;

  FirebaseStorage get _storageInstance => _storage ??= FirebaseStorage.instance;

  /// Uploads a return-condition photo under the exact item and loan. The URL
  /// is subsequently attached to the immutable condition history entry.
  Future<String> uploadReturnConditionPhoto({
    required String clubId,
    required String loanId,
    required String itemId,
    required Uint8List bytes,
    required String fileName,
    String? contentType,
  }) async {
    if (bytes.isEmpty) {
      throw ArgumentError.value(bytes, 'bytes', 'Photo vide');
    }

    final safeName = fileName
        .replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_')
        .replaceFirst(RegExp(r'^_+'), '');
    final timestamp = DateTime.now().microsecondsSinceEpoch;
    final path = 'clubs/$clubId/inventory_incidents/$loanId/$itemId/'
        '${timestamp}_${safeName.isEmpty ? 'photo.jpg' : safeName}';
    final reference = _storageInstance.ref().child(path);

    await reference.putData(
      bytes,
      SettableMetadata(contentType: contentType ?? 'image/jpeg'),
    );
    return reference.getDownloadURL();
  }

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
      final items = snapshot.docs
          .map((doc) {
            final item = MaterialLoanItem.fromFirestore(doc);
            return item.copyWithTypeName(typeNames[item.typeId]);
          })
          .where((item) => item.isBorrowable)
          .toList();
      if (kDebugMode) {
        debugPrint(
          'Materiel disponible geladen: ${items.length}/${snapshot.docs.length}',
        );
      }
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
        .snapshots()
        .asyncMap((snapshot) async {
      final requests = <MaterialLoanRequest>[];
      for (final doc in snapshot.docs) {
        final rawRequest = MaterialLoanRequest.fromFirestore(doc);
        if (!{
          'submitted',
          'approved',
          'validated',
          'ready',
          'handed_over',
          'refused',
        }.contains(rawRequest.status)) {
          continue;
        }
        final items = rawRequest.lines.isEmpty
            ? await _loadLoanItems(clubId, rawRequest.itemIds)
            : const <MaterialLoanItem>[];
        requests.add(MaterialLoanRequest.fromFirestore(doc, items: items));
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
        .map(
          (item) => {
            'id': item.id,
            'code': item.code,
            'nom': item.name,
            'fabricant': item.brand,
            'modele': item.model,
            'numero_serie': item.serialNumber,
          },
        )
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

  Future<String> submitLoanRequestLines({
    required String clubId,
    required String memberId,
    required String memberName,
    required String memberEmail,
    required List<MaterialLoanRequestLine> lines,
    required DateTime expectedReturnDate,
    String? notes,
  }) async {
    if (lines.isEmpty) {
      throw Exception('Choisissez au moins un materiel');
    }

    final requestRef = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_loan_requests')
        .doc();

    await requestRef.set({
      'memberId': memberId,
      'memberName': memberName,
      'memberEmail': memberEmail,
      'lines': lines.map((line) => line.toMap()).toList(),
      'itemIds': const <String>[],
      'assignedItemIds': const <String>[],
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
    List<MaterialReturnItemCheck> itemChecks = const [],
  }) async {
    if (refundAmount < 0 || refundAmount > loan.cautionAmount) {
      throw ArgumentError.value(
        refundAmount,
        'refundAmount',
        'Le remboursement doit être compris entre 0 et la caution.',
      );
    }

    final checksByItemId = <String, MaterialReturnItemCheck>{
      for (final check in itemChecks)
        if (loan.itemIds.contains(check.itemId)) check.itemId: check,
    };
    final hasMissingItem = checksByItemId.values.any(
      (check) => check.condition == MaterialReturnItemCondition.missing,
    );
    if (hasMissingItem && refundAmount > 0) {
      throw ArgumentError(
        'Un article manquant doit d’abord être examiné dans CalyCompta. '
        'Aucun remboursement ne peut être demandé à ce stade.',
      );
    }

    final loanRef = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_loans')
        .doc(loan.id);

    final itemsRef = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_items');
    final refundRequestId = 'loan_caution_refund_${loan.id}';
    final refundRequestRef = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('material_refund_requests')
        .doc(refundRequestId);
    final auditRef = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('audit_logs')
        .doc();
    final incidentsRef = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('material_incidents');

    return _firestore.runTransaction((transaction) async {
      final loanSnap = await transaction.get(loanRef);
      if (!loanSnap.exists) {
        throw Exception('Pret introuvable');
      }

      final existingRefundRequest = await transaction.get(refundRequestRef);

      final now = FieldValue.serverTimestamp();
      final historyRecordedAt = Timestamp.now();
      final retainedAmount = (loan.cautionAmount - refundAmount)
          .clamp(0, loan.cautionAmount)
          .toDouble();
      final cautionStatus = _cautionStatusFor(decision, refundAmount);
      final normalizedChecks = <Map<String, dynamic>>[];

      for (final itemId in loan.itemIds) {
        final check =
            checksByItemId[itemId] ?? MaterialReturnItemCheck(itemId: itemId);
        normalizedChecks.add(check.toMap());
      }

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
        'return_item_checks': normalizedChecks,
        if (refundAmount > 0) 'caution_refund_request_id': refundRequestId,
        'updatedAt': now,
      });

      transaction.set(auditRef, {
        'event_type': 'material_loan_return_validated',
        'entity_type': 'inventory_loan',
        'entity_id': loan.id,
        'loan_number': loan.loanNumber,
        'member_id': loan.memberId,
        'member_name': loan.memberName,
        'item_ids': loan.itemIds,
        'return_decision': decision.name,
        'refund_amount': refundAmount,
        'retained_amount': retainedAmount,
        'item_checks': normalizedChecks,
        'incident_count': normalizedChecks
            .where((check) => check['condition'] != 'good')
            .length,
        'actor_id': validatedByUserId,
        'actor_name': validatedByName,
        'createdAt': now,
      });

      for (final itemId in loan.itemIds) {
        final check =
            checksByItemId[itemId] ?? MaterialReturnItemCheck(itemId: itemId);
        final hasIncident = check.condition != MaterialReturnItemCondition.good;
        transaction.update(itemsRef.doc(itemId), {
          'statut': hasIncident ? 'en_maintenance' : 'disponible',
          'current_loan_id': FieldValue.delete(),
          'last_return_condition': check.condition.name,
          'last_return_note': check.note?.trim(),
          'last_return_photo_urls': check.photoUrls,
          'condition_history': FieldValue.arrayUnion([
            {
              'loan_id': loan.id,
              'loan_number': loan.loanNumber,
              'condition': check.condition.name,
              if (check.note != null && check.note!.trim().isNotEmpty)
                'note': check.note!.trim(),
              'photo_urls': check.photoUrls,
              'recorded_by': validatedByUserId,
              'recorded_by_name': validatedByName,
              'recorded_at': historyRecordedAt,
            },
          ]),
          'updatedAt': now,
        });

        if (hasIncident) {
          final incidentRef = incidentsRef.doc('${loan.id}_$itemId');
          transaction.set(incidentRef, {
            'loan_id': loan.id,
            'loan_number': loan.loanNumber,
            'member_id': loan.memberId,
            'member_name': loan.memberName,
            'item_id': itemId,
            'condition': check.condition.name,
            'status': check.condition == MaterialReturnItemCondition.missing
                ? 'decision_required'
                : 'pending_maintenance',
            'note': check.note?.trim(),
            'photo_urls': check.photoUrls,
            'reported_by': validatedByUserId,
            'reported_by_name': validatedByName,
            'created_at': now,
            'updated_at': now,
          });
        }
      }

      if (refundAmount > 0 && !existingRefundRequest.exists) {
        transaction.set(refundRequestRef, {
          'loan_id': loan.id,
          'loan_number': loan.loanNumber,
          'member_id': loan.memberId,
          'member_name': loan.memberName,
          'amount': refundAmount,
          'retained_amount': retainedAmount,
          'status': 'pending_treasurer',
          'source': 'loan_caution_return',
          'created_by': validatedByUserId,
          'created_by_name': validatedByName,
          'created_at': now,
          'updated_at': now,
        });
      }

      return MaterialReturnResult(
        refundRequestId: refundAmount > 0 ? refundRequestId : null,
      );
    });
  }

  String _cautionStatusFor(
    MaterialReturnDecision decision,
    double refundAmount,
  ) {
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
}
