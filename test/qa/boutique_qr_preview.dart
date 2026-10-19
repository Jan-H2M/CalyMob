// Local UI verification only. No Firebase initialization or production transport.
import 'package:calymob/screens/boutique/boutique_management_screen.dart';
import 'package:calymob/screens/boutique/boutique_stock_session_screen.dart';
import 'package:calymob/screens/boutique/boutique_handover_screen.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:calymob/widgets/boutique/boutique_access_guard.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';

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
  'expiresAt': '2026-10-23T19:00:00Z',
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
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff153868)),
        useMaterial3: true),
    home: BoutiqueAccessGuard(
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
        })));
