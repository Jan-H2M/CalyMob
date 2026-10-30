import 'package:calymob/services/mil_protocol_reader.dart';
import 'package:calymob/widgets/formation/mil_protocol_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('missing protocol is not replaced with a guessed description',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: MilProtocolSheet(
                clubId: 'calypso',
                code: 'P3.PL',
                pool: false,
                loader: () async => null))));
    await tester.pump();
    expect(find.textContaining('Aucun protocole MIL'), findsOneWidget);
    expect(find.byTooltip('Fermer le protocole'), findsOneWidget);
  });
  testWidgets('read failure is distinct from an unmapped exercise',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: MilProtocolSheet(
                clubId: 'calypso',
                code: 'P3.RT',
                pool: false,
                loader: () => Future.error(StateError('synthetic offline'))))));
    await tester.pump();
    expect(find.textContaining('Catalogue MIL indisponible'), findsOneWidget);
    expect(find.textContaining('Aucun protocole MIL'), findsNothing);
    expect(find.textContaining('synthetic offline'), findsNothing);
  });
  testWidgets('shows the MIL protocol and its stable environment key',
      (tester) async {
    const protocol = MilProtocol(
      key: 'mn__P3.RT',
      code: 'P3.RT',
      medium: 'mn',
      sectionId: 'h11-3-5',
      title: 'Remontée technique',
      body: 'Procédure de remontée.\n\nCritères de réussite.',
      sourceUrl: 'https://mil.amb-lifras.be/#h11-3-5',
      sourceVersion: 'v2026-8',
      referenceUrls: ['https://mil.amb-lifras.be/#h7-3-2'],
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: MilProtocolSheet(
          clubId: 'calypso',
          code: 'P3.RT',
          pool: false,
          loader: () async => protocol,
        ),
      ),
    ));
    await tester.pump();
    expect(find.text('P3.RT · Milieu naturel'), findsOneWidget);
    expect(find.text('Remontée technique'), findsOneWidget);
    expect(find.textContaining('Critères de réussite.'), findsOneWidget);
    expect(find.textContaining('mn__P3.RT'), findsOneWidget);
    expect(find.text('Règles MIL associées'), findsOneWidget);
  });
}
