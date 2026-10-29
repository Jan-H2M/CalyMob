// Synthetic, in-memory preview. No Firebase app, credentials, writes or network.
import 'dart:convert';
import 'package:calymob/config/app_colors.dart';
import 'package:calymob/models/boutique/boutique_physical_unit.dart';
import 'package:calymob/models/boutique/boutique_unit_qr.dart';
import 'package:calymob/screens/boutique/boutique_action_wizard_screen.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:calymob/widgets/boutique/boutique_access_guard.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';

class LocalBoutiqueWizardStore {
  final units = <String, Map<String, dynamic>>{};
  final requests = <Map<String, dynamic>>[];
  final receipts = <String, Map<String, dynamic>>{},
      payloads = <String, String>{};
  final bool ambiguous;
  int applied = 0;
  LocalBoutiqueWizardStore({this.ambiguous = false}) {
    void add(String id, String order, String name, String place, String finish,
        {bool embroidery = true,
        bool ready = false,
        bool transit = false,
        bool sold = false}) {
      units[id] = {
        'id': id,
        'revision': 'demo-1',
        'productName': name,
        'variantLabel': 'L · Bleu marine',
        'location': place,
        'finish': finish,
        'saleStatus': sold
            ? 'sold'
            : ready
                ? 'sale_ready'
                : 'not_ready',
        'requiresEmbroidery': embroidery,
        'workshopReady': ready && finish == 'at_jim',
        'customerOrderId': order,
        'customerName': order == 'demo-a'
            ? 'Camille Exemple'
            : order == 'demo-b'
                ? 'Alex Exemple'
                : 'Stock club fictif',
        'orderNumber': order == 'demo-a'
            ? 'DÉMO-001'
            : order == 'demo-b'
                ? 'DÉMO-002'
                : 'DÉMO-003',
        if (transit) 'transportMissionId': 'demo-transport'
      };
    }

    add('polo-a', 'demo-a', 'Polo Calypso', 'Jim', 'at_jim');
    add('veste-a', 'demo-a', 'Veste Calypso', 'Jim', 'at_jim');
    add('bonnet-b', 'demo-b', 'Bonnet Calypso', 'Jim', 'at_jim', ready: true);
    add('transit-b', 'demo-b', 'Polo en transport', 'Jim', 'at_jim',
        transit: true);
    add('sold-b', 'demo-b', 'Article déjà remis', 'Jim', 'returned_embroidered',
        sold: true);
    add('polo-p', 'demo-a', 'Polo à broder', 'Piscine', 'unembroidered');
    add('veste-p', 'demo-b', 'Veste à broder', 'Piscine', 'unembroidered');
    add('plain-r', 'demo-stock', 'Bonnet sans broderie', 'Réserve',
        'unembroidered',
        embroidery: false);
    add('ready-r', 'demo-stock', 'Article contrôlé', 'Réserve',
        'not_required_reviewed',
        embroidery: false, ready: true);
  }
  BoutiqueOperationsService get service =>
      BoutiqueOperationsService(transport: call);
  Never fail(String message) => throw FirebaseFunctionsException(
      code: 'failed-precondition', message: message);
  Future<Map<String, dynamic>> call(Map<String, dynamic> input) async {
    requests.add(Map.of(input));
    if (input['clubId'] != 'synthetic-boutique') {
      fail('Club de démonstration incorrect.');
    }
    final action = input['action'];
    if (action == 'list') {
      return {
        'units': units.values.map((u) => Map.of(u)).toList(),
        'hasMore': false,
        'assignees': [
          {'id': 'demo-helper', 'name': 'Accueil Exemple'}
        ]
      };
    }
    if (action == 'lookup') {
      final u = units[input['unitId']];
      if (u == null) fail('Pièce introuvable.');
      return {'unit': Map.of(u)};
    }
    if (action == 'orders') {
      return {
        'orders': ['demo-a', 'demo-b', 'demo-stock'].map((id) {
          final rows =
              units.values.where((u) => u['customerOrderId'] == id).toList();
          return {
            'id': id,
            'orderNumber': rows.first['orderNumber'],
            'customerName': rows.first['customerName'],
            'physicalCount': rows.length
          };
        }).toList(),
        'hasMore': false,
        'nextCursor': null
      };
    }
    if (action == 'orderSelection') {
      final rows = units.values
          .where((u) =>
              u['customerOrderId'] == input['orderId'] &&
              u['saleStatus'] != 'sold')
          .toList();
      if (rows.any((u) => u['location'] != input['sourceLocation'])) {
        fail(
            'Commande répartie entre plusieurs lieux : choisissez ses pièces dans la liste.');
      }
      return {'units': rows.map((u) => Map.of(u)).toList()};
    }
    if (!boutiqueBatchActions.containsKey(action)) {
      fail('Action de démonstration inconnue.');
    }
    final key = input['idempotencyKey'] as String;
    final payload = Map<String, dynamic>.of(input)..remove('preview');
    final fingerprint = jsonEncode(payload);
    if (receipts.containsKey(key)) {
      if (payloads[key] != fingerprint) fail('La confirmation a changé.');
      return receipts[key]!;
    }
    final selected = (input['units'] as List).map((v) {
      final u = units[v['id']];
      if (u == null || u['revision'] != v['revision']) {
        fail('La pièce a changé.');
      }
      final reason = boutiqueBatchBlockedReason(BoutiquePhysicalUnit(u),
          action as String, input['sourceLocation'] as String);
      if (reason != null) fail(reason);
      return u;
    }).toList();
    if (selected.isEmpty || selected.length > 50) fail('Sélection invalide.');
    final dest = input['destination'] as String?;
    if (['move', 'dispatch', 'confirmJim'].contains(action) &&
        (dest == null || dest.trim().isEmpty)) {
      fail('Destination obligatoire.');
    }
    if (action == 'move' && dest == input['sourceLocation']) {
      fail('Choisissez un autre lieu.');
    }
    if (['finishJim', 'confirmJim', 'reviewPlain'].contains(action) &&
        (input['note'] as String? ?? '').trim().length < 3) {
      fail('Contrôle obligatoire.');
    }
    final result = <String, dynamic>{
      'count': selected.length,
      'destination': dest ?? input['sourceLocation'],
      'notificationCount': 0,
      'heldOrders': []
    };
    if (input['preview'] == true) return result;
    if (input['confirmed'] != true || input['expectedActorId'] != 'demo-rb') {
      fail('Confirmation requise.');
    }
    for (final u in selected) {
      switch (action) {
        case 'move':
          u['location'] = dest;
        case 'prepareJim':
          u['finish'] = 'to_jim';
        case 'confirmJim':
          u['finish'] = 'at_jim';
          u['location'] = dest;
        case 'finishJim':
          u['workshopReady'] = true;
        case 'reviewPlain':
          u['finish'] = 'not_required_reviewed';
          u['saleStatus'] = 'sale_ready';
        case 'dispatch':
          if (dest == input['sourceLocation']) {
            if (u['workshopReady'] == true) {
              u['finish'] = 'returned_embroidered';
            }
            u['pickupMissionId'] = 'demo-pickup';
          } else {
            u['location'] = 'En transport → $dest';
            u['transportMissionId'] = 'demo-transport';
          }
      }
      u['revision'] = 'demo-${applied + 2}';
    }
    applied++;
    receipts[key] = result;
    payloads[key] = fingerprint;
    if (ambiguous && applied == 1) {
      throw FirebaseFunctionsException(
          code: 'unavailable',
          message:
              'Réponse simulée perdue après enregistrement. Réessayez la même confirmation.');
    }
    return result;
  }
}

class WizardQaAccess extends BoutiqueAccessService {
  WizardQaAccess() : super(firestore: FakeFirebaseFirestore());
  @override
  Stream<BoutiqueAccessState> watchBoutiqueAccess(
          {required String clubId, required String userId}) =>
      Stream.value(const BoutiqueAccessState(
          canAccess: true,
          visibility: {},
          member: {
            'member_status': 'active',
            'clubStatuten': ['RB']
          },
          qrEnabled: true));
}

class SyntheticQrEntry extends StatefulWidget {
  final Future<String> Function(String) onScan;
  const SyntheticQrEntry(this.onScan, {super.key});
  @override
  State<SyntheticQrEntry> createState() => _SyntheticQrEntryState();
}

class _SyntheticQrEntryState extends State<SyntheticQrEntry> {
  String? _feedback;
  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('QR simulé · sans caméra')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Text(
            'Aucun accès caméra. Ces boutons simulent les QR de pièces fictives.'),
        for (final id in ['polo-a', 'veste-a', 'bonnet-b', 'polo-p'])
          OutlinedButton(
              onPressed: () async {
                try {
                  final feedback = await widget.onScan(
                      BoutiqueUnitQr(clubId: 'synthetic-boutique', unitId: id)
                          .url);
                  if (mounted) setState(() => _feedback = feedback);
                } catch (e) {
                  if (mounted) {
                    setState(
                        () => _feedback = BoutiqueOperationsService.message(e));
                  }
                }
              },
              child: Text('QR · $id')),
        if (_feedback != null) Text(_feedback!),
      ]));
}

void main() {
  final store = LocalBoutiqueWizardStore(
      ambiguous: Uri.base.queryParameters['ambiguous'] == '1');
  runApp(MaterialApp(
      title: 'CalyMob · Boutique nouvelle navigation',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: AppColors.donkerblauw),
          useMaterial3: true),
      home: Builder(
          builder: (context) => Scaffold(
              appBar: AppBar(
                  title: const Text('Boutique · aperçu local'),
                  backgroundColor: AppColors.donkerblauw,
                  foregroundColor: Colors.white),
              body: Center(
                  child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 700),
                      child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Text('Une action, plusieurs paquets',
                                    style: Theme.of(context)
                                        .textTheme
                                        .headlineSmall),
                                const SizedBox(height: 12),
                                const Text(
                                    'DONNÉES FICTIVES · aucune connexion à Firebase. Les confirmations modifient uniquement la mémoire de cet aperçu.'),
                                const SizedBox(height: 24),
                                FilledButton(
                                    onPressed: () => Navigator.push(
                                        context,
                                        MaterialPageRoute<void>(
                                            builder: (_) => BoutiqueAccessGuard(
                                                clubId: 'synthetic-boutique',
                                                testUserIdOverride: 'demo-rb',
                                                accessService: WizardQaAccess(),
                                                requiredSection: 'gestion',
                                                builder: (_, __) =>
                                                    BoutiqueActionWizardScreen(
                                                        clubId:
                                                            'synthetic-boutique',
                                                        service: store.service,
                                                        scannerBuilder: (scan) =>
                                                            SyntheticQrEntry(
                                                                scan))))),
                                    child:
                                        const Text('Ouvrir Gestion Boutique')),
                              ]))))))));
}
