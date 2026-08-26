import 'package:calymob/models/emergency_contact.dart';
import 'package:calymob/models/emergency_info.dart';
import 'package:calymob/widgets/profile/emergency_contacts_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _app(Stream<EmergencyInfo?> stream) => MaterialApp(
  home: Scaffold(
    body: EmergencyContactsCard(emergencyInfo: stream, onCall: (_) async {}),
  ),
);

void main() {
  const contact = EmergencyContact(
    name: 'Marie Dupont',
    relation: 'Conjointe',
    phone: '+32 470 12 34 56',
    priority: 1,
  );

  testWidgets('shows a shared emergency contact', (tester) async {
    await tester.pumpWidget(
      _app(
        Stream.value(
          const EmergencyInfo(contacts: [contact], shareWithStaff: true),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('CONTACT D’URGENCE'), findsOneWidget);
    expect(find.text('Marie Dupont'), findsOneWidget);
    expect(find.text('+32 470 12 34 56'), findsOneWidget);
  });

  testWidgets('hides contacts when consent is disabled', (tester) async {
    await tester.pumpWidget(
      _app(
        Stream.value(
          const EmergencyInfo(contacts: [contact], shareWithStaff: false),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Marie Dupont'), findsNothing);
    expect(find.text('CONTACT D’URGENCE'), findsNothing);
  });

  testWidgets('silently hides Firestore permission errors', (tester) async {
    await tester.pumpWidget(_app(Stream<EmergencyInfo?>.error('denied')));
    await tester.pump();

    expect(find.text('CONTACT D’URGENCE'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
