import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:calymob/screens/stock/material_returns_screen.dart';
import 'package:calymob/services/material_return_service.dart';

class FictionalLoanLiability extends StatefulWidget {
  const FictionalLoanLiability({super.key});
  @override
  State<FictionalLoanLiability> createState() => _FictionalLoanLiabilityState();
}

class _FictionalLoanLiabilityState extends State<FictionalLoanLiability> {
  final db = FictionalLoanRequestStore();
  String result = 'Aucune demande enregistrée.';
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        const Text(
            'AV-LOAN-001 · Membre et matériel FICTIFS · Écriture en mémoire uniquement.'),
        ElevatedButton(
            onPressed: () async {
              await showMaterialLoanRequestForm(
                  context: context,
                  service:
                      MaterialReturnService.forDevLoanLiability(firestore: db),
                  clubId: 'dev-fictional',
                  memberId: 'dev-borrower',
                  memberName: 'Membre FICTIF',
                  memberEmail: '');
              if (!mounted) return;
              final saved = db.saved;
              setState(() => result = saved == null
                  ? 'Aucune demande enregistrée.'
                  : '${saved['notes']} · accord FICTIF du compte '
                      '${saved['liability_acceptance']['accepted_by_uid']} · '
                      '${saved['liability_acceptance']['terms_version']}\n'
                      'Horodatage serveur demandé mais non exécuté dans ce laboratoire. Ce n’est pas une preuve serveur.');
            },
            child: const Text('Ouvrir la vraie demande FICTIVE')),
        SelectableText(result),
        const Text(
            'Les règles réelles sont testées séparément avec un projet demo et des identités fictives. Aucun e-mail/paiement.'),
      ]);
}

/// A narrowly bound in-memory write sink, NOT an SDK platform mock or database.
/// It lets the real service produce its request payload in a release-compiled
/// fixture. Every unimplemented path throws; there is no Firebase fallback.
class FictionalLoanRequestStore implements FirebaseFirestore {
  Map<String, dynamic>? saved;
  @override
  CollectionReference<Map<String, dynamic>> collection(String path) {
    if (path != 'clubs') throw UnsupportedError('Fictional clubs path only');
    return _FictionalLoanCollection(this, path);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Fictional write sink only');
}

// ignore: subtype_of_sealed_class
class _FictionalLoanCollection
    implements CollectionReference<Map<String, dynamic>> {
  _FictionalLoanCollection(this.store, this.path);
  final FictionalLoanRequestStore store;
  @override
  final String path;
  @override
  DocumentReference<Map<String, dynamic>> doc([String? id]) {
    if (path == 'clubs' && id == 'dev-fictional') {
      return _FictionalLoanDocument(store, 'clubs/dev-fictional');
    }
    if (path == 'clubs/dev-fictional/inventory_loan_requests' && id == null) {
      return _FictionalLoanDocument(store, '$path/dev-request');
    }
    throw UnsupportedError('Unexpected fictional document');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Fictional collection path only');
}

// ignore: subtype_of_sealed_class
class _FictionalLoanDocument
    implements DocumentReference<Map<String, dynamic>> {
  _FictionalLoanDocument(this.store, this.path);
  final FictionalLoanRequestStore store;
  @override
  final String path;
  @override
  String get id => path.split('/').last;
  @override
  CollectionReference<Map<String, dynamic>> collection(String name) {
    if (path != 'clubs/dev-fictional' || name != 'inventory_loan_requests') {
      throw UnsupportedError('Unexpected fictional subcollection');
    }
    return _FictionalLoanCollection(store, '$path/$name');
  }

  @override
  Future<void> set(Map<String, dynamic> data, [SetOptions? options]) async {
    if (path != 'clubs/dev-fictional/inventory_loan_requests/dev-request' ||
        options != null) {
      throw UnsupportedError('Unexpected fictional write');
    }
    store.saved = Map<String, dynamic>.from(data);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Fictional document path only');
}
