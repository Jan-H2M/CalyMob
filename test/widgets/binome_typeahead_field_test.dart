import 'package:calymob/widgets/binome_typeahead_field.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
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
        .collection('member_directory')
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

  testWidgets('offers a reusable external buddy from the diver history',
      (tester) async {
    final firestore = FakeFirebaseFirestore();
    await firestore
        .collection('clubs')
        .doc('calypso')
        .collection('student_logbook_entries')
        .doc('dive-1')
        .set({
      'member_id': 'current-user',
      'date': Timestamp.fromDate(DateTime(2026, 8, 1)),
      'binomes': [
        {
          'type': 'external',
          'display_name': 'Alex Exemple',
          'niveau': '3*',
          'club': 'Club voisin',
        },
      ],
    });

    List<BinomeSelection> selected = const [];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: StatefulBuilder(
          builder: (context, setState) => BinomeTypeaheadField(
            firestore: firestore,
            currentUserId: 'current-user',
            binomes: selected,
            onChanged: (value) => setState(() => selected = value),
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(TextField).first);
    await tester.pumpAndSettle();

    expect(find.text('Binômes externes récents'), findsOneWidget);
    expect(find.text('Alex Exemple'), findsOneWidget);
    await tester.tap(find.text('Alex Exemple'));
    await tester.pumpAndSettle();
    expect(selected.single.isExternal, isTrue);
    expect(selected.single.club, 'Club voisin');
  });
}
