// Local UI verification only. No Firebase initialization or production transport.
import 'package:calymob/screens/boutique/boutique_management_screen.dart';
import 'package:calymob/screens/boutique/boutique_stock_session_screen.dart';
import 'package:calymob/screens/boutique/boutique_handover_screen.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:calymob/widgets/boutique/boutique_access_guard.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';

final pieces = List.generate(
    3,
    (i) => <String, dynamic>{
          'id': 'qa-piece-$i',
          'revision': 'qa-1',
          'productName': ['Polo Calypso', 'Veste polaire', 'Bonnet Calypso'][i],
          'variantLabel': ['M · Bleu', 'M · Bleu', 'OS · Bleu'][i],
          'location': 'Piscine',
          'finish': 'returned_embroidered',
          'saleStatus': 'sale_ready',
          'customerOrderId': 'qa-order',
          'customerLineId': 'qa-line',
          'customerName': 'Membre Exemple',
          'requiresEmbroidery': true,
          'pickupMissionId': 'qa-mission'
        });
final helpers = [
  {'id': 'qa-helper1', 'name': 'Accueil Exemple 1', 'accueil': true},
  {'id': 'qa-helper2', 'name': 'Accueil Exemple 2', 'accueil': true}
];
final mission = <String, dynamic>{
  'id': 'qa-mission',
  'status': 'received',
  'destination': 'Piscine',
  'sourceLocation': 'Jim',
  'pickupWindow': 'Vendredi de 19h à 21h · accueil',
  'expiresAt':
      DateTime.now().toUtc().add(const Duration(days: 7)).toIso8601String(),
  'total': 3,
  'arrived': 3,
  'delivered': 0,
  'assigneeNames': ['Accueil Exemple 1', 'Accueil Exemple 2'],
  'allowPartial': false,
  'pickupPoint': true
};
Map<String, dynamic> packet() => {
      'orderId': 'qa-order',
      'orderNumber': 'BTQ-EXEMPLE',
      'buyerId': 'qa-buyer',
      'buyerName': 'Membre Exemple',
      'units': pieces.where((u) => u['saleStatus'] != 'sold').toList(),
      'ready': true,
      'partial': false,
      'remaining': 0
    };
final service = BoutiqueOperationsService(transport: (request) async {
  switch (request['action']) {
    case 'access':
      return {'enabled': true, 'canManage': true, 'hasAssignments': true};
    case 'list':
      return {'units': pieces, 'assignees': helpers, 'hasMore': false};
    case 'missions':
      return {
        'missions': [mission],
        'hasMore': false
      };
    case 'mission':
      return {
        'mission': mission,
        'units': pieces,
        'packets': [packet()]
      };
    case 'lookup':
      return {'unit': pieces.firstWhere((u) => u['id'] == request['unitId'])};
    case 'orders':
      if (Uri.base.queryParameters['ordersError'] == '1') {
        throw FirebaseFunctionsException(
            code: 'invalid-argument', message: 'Demande Boutique invalide.');
      }
      return {
        'orders': [
          {
            'id': 'qa-order',
            'orderNumber': 'BTQ-EXEMPLE',
            'customerName': 'Membre Exemple',
            'physicalCount': pieces.length
          }
        ],
        'hasMore': false,
        'nextCursor': null
      };
    case 'orderSelection':
      return {'units': pieces};
    default:
      final count = (request['units'] as List? ?? []).length;
      return {
        'count': count,
        'applied': request['preview'] != true,
        'notificationCount': 0,
        'heldOrders': [],
        'destination': request['destination'] ?? 'Piscine',
        'recipientName': 'Membre Exemple',
        'missionId': 'qa-mission',
        'expiresAt': mission['expiresAt']
      };
  }
});

class QaAccess extends BoutiqueAccessService {
  QaAccess() : super(firestore: FakeFirebaseFirestore());
  @override
  Stream<BoutiqueAccessState> watchBoutiqueAccess(
          {required String clubId, required String userId}) =>
      Stream.value(const BoutiqueAccessState(
          canAccess: false,
          visibility: {},
          member: {
            'member_status': 'active',
            'clubStatuten': ['RB']
          },
          qrEnabled: true,
          hasPickupAssignments: true));
}

void main() => runApp(MaterialApp(
    title: 'CalyMob · Boutique QA locale',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff153868)),
        // Match the real app's global theme: do not hide transparent/white
        // AppBar regressions behind Flutter's default preview theme.
        appBarTheme: const AppBarTheme(
            backgroundColor: Colors.transparent,
            foregroundColor: Colors.white,
            iconTheme: IconThemeData(color: Colors.white)),
        useMaterial3: true),
    home: const QaLanding()));

class QaLanding extends StatelessWidget {
  const QaLanding({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(
          backgroundColor: const Color(0xff183868),
          title: const Text('Boutique · test local')),
      body: ListView(padding: const EdgeInsets.all(24), children: [
        const Text('DONNÉES FICTIVES — aucune connexion à Firebase'),
        const Text(
            'Les confirmations éventuelles restent dans cette simulation.'),
        FilledButton(
            onPressed: () => Navigator.push(context,
                MaterialPageRoute<void>(builder: (_) => const QaFlow())),
            child: const Text('Ouvrir Gestion Boutique')),
      ]));
}

class QaFlow extends StatelessWidget {
  const QaFlow({super.key});
  @override
  Widget build(BuildContext context) => BoutiqueAccessGuard(
      clubId: 'fixture',
      testUserIdOverride: 'qa-rb',
      accessService: QaAccess(),
      requiredSection: 'gestion',
      builder: (context, access) {
        final page = Uri.base.queryParameters['qa'];
        final Widget child = page == 'session'
            ? BoutiqueStockSessionScreen(
                clubId: 'fixture',
                location: 'Piscine',
                assignees: helpers,
                service: service)
            : page == 'handover'
                ? BoutiqueHandoverScreen(
                    clubId: 'fixture',
                    missionId: 'qa-mission',
                    packet: packet(),
                    manager: true,
                    service: service)
                : BoutiqueManagementScreen(
                    manager: page != 'accueil', service: service);
        return Banner(
            message: 'DONNÉES FICTIVES',
            location: BannerLocation.topEnd,
            child: child);
      });
}
