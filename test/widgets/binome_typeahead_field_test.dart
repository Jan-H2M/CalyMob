import 'package:calymob/widgets/binome_typeahead_field.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('finds an internal member stored with English-only name fields',
      (tester) async {
    final firestore = FakeFirebaseFirestore();
    await firestore
        .collection('clubs')
        .doc('calypso')
        .collection('members')
        .doc('gradini')
        .set({
      'firstName': 'Raffaele',
      'lastName': 'Gradini',
      'displayName': 'Raffaele Gradini',
      'email': 'member@example.test',
      'member_status': 'active',
    });

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: BinomeTypeaheadField(
          firestore: firestore,
          binomes: const [],
          onChanged: (_) {},
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).first, 'Gradini');
    await tester.pumpAndSettle();

    expect(find.text('Raffaele Gradini'), findsOneWidget);
    expect(find.text('Aucun membre Calypso ne correspond.'), findsNothing);
  });
}
