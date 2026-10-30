import 'package:calymob/services/mil_protocol_reader.dart';
import 'package:calymob/widgets/formation/mil_protocol_catalog_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('lists a code-free MIL pool section by its stable anchor',
      (tester) async {
    const record = MilProtocol(
      key: 'pool__section-h23-3-1',
      code: null,
      medium: 'pool',
      sectionId: 'h23-3-1',
      title: 'Apnée immobile et parcours',
      body: 'Protocole.',
      sourceUrl: 'https://mil.amb-lifras.be/#h23-3-1',
      sourceVersion: 'v2026-8',
      referenceUrls: [],
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: MilProtocolCatalogSheet(
          clubId: 'calypso',
          pool: true,
          loader: () async => [record],
        ),
      ),
    ));
    await tester.pump();
    expect(find.text('Apnée immobile et parcours'), findsOneWidget);
    expect(find.text('Section h23-3-1'), findsOneWidget);
  });
}
