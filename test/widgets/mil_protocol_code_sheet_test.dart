import 'package:calymob/services/mil_protocol_reader.dart';
import 'package:calymob/widgets/formation/mil_protocol_code_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('asks for medium when a MIL code has two protocols',
      (tester) async {
    const natural = MilProtocol(
      key: 'mn__P2.REA',
      code: 'P2.REA',
      medium: 'mn',
      sectionId: 'h10-4-8',
      title: 'Réanimation',
      body: 'Naturel.',
      sourceUrl: 'https://mil.amb-lifras.be/#h10-4-8',
      sourceVersion: 'v2026-8',
      referenceUrls: [],
    );
    const pool = MilProtocol(
      key: 'pool__P2.REA',
      code: 'P2.REA',
      medium: 'pool',
      sectionId: 'h20-2-9',
      title: 'Réanimation',
      body: 'Piscine.',
      sourceUrl: 'https://mil.amb-lifras.be/#h20-2-9',
      sourceVersion: 'v2026-8',
      referenceUrls: [],
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: MilProtocolCodeSheet(
          clubId: 'calypso',
          code: 'P2.REA',
          loader: () async => [natural, pool],
        ),
      ),
    ));
    await tester.pump();
    expect(find.text('Choisissez le milieu de l’épreuve.'), findsOneWidget);
    expect(find.text('Milieu naturel'), findsOneWidget);
    expect(find.text('Piscine'), findsOneWidget);
  });
}
