import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/screens/boutique/boutique_orders_overview_screen.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
void main(){ testWidgets('shows payment and status, searches and loads another page without writing', (tester) async {
 final calls=<Map<String,dynamic>>[];
 final service=BoutiqueOperationsService(transport:(request) async {calls.add(request);if(request['action']!='orderOverview') throw StateError('Unexpected mutation'); if(request['cursor']==null) return {'orders':[{'id':'1','orderNumber':'DÉMO-001','customerName':'Camille','status':'awaiting_payment','paymentStatus':'pending','items':[{'name':'Bonnet','variant':'OS','qty':1,'status':'pending'}]}],'hasMore':true,'nextCursor':'1'};return {'orders':[{'id':'2','orderNumber':'DÉMO-002','customerName':'Alex','status':'preparing','paymentStatus':'paid','items':[]}],'hasMore':false};});
 await tester.pumpWidget(MaterialApp(home:BoutiqueOrdersOverviewScreen(clubId:'demo',service:service)));await tester.pumpAndSettle();expect(find.textContaining('Non payé · En attente de paiement'),findsOneWidget);await tester.tap(find.text('DÉMO-001 · Camille'));await tester.pumpAndSettle();expect(find.text('Bonnet · x1'),findsOneWidget);await tester.tap(find.text('Charger les commandes suivantes'));await tester.pumpAndSettle();expect(find.textContaining('Payé · En cours'),findsOneWidget);await tester.enterText(find.byType(TextField),'Alex');await tester.pumpAndSettle();expect(find.text('DÉMO-002 · Alex'),findsOneWidget);expect(find.text('DÉMO-001 · Camille'),findsNothing);expect(calls.length,2);expect(calls.last['cursor'],'1');
 });}
