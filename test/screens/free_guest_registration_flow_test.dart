import 'package:calymob/models/operation.dart';
import 'package:calymob/screens/operations/add_guest_dialog.dart';
import 'package:calymob/screens/operations/operation_detail_screen.dart';
import 'package:calymob/screens/operations/register_with_guests_dialog.dart';
import 'package:calymob/services/operation_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('detail screen keeps free guest action visible to a registered member',
      () {
    expect(
        canAddGuestFromOperationDetail(
          staff: false,
          allowGuests: true,
          hasActiveRegistration: true,
          currentCount: 1,
          capacity: 3,
        ),
        isTrue);
    expect(
        canAddGuestFromOperationDetail(
          staff: false,
          allowGuests: true,
          hasActiveRegistration: false,
          currentCount: 0,
          capacity: 3,
        ),
        isFalse);
  });

  test('event staff guest permission is independent of scanner permission', () {
    expect(
      canAddGuestFromOperationDetail(
        staff: true,
        allowGuests: false,
        hasActiveRegistration: false,
        currentCount: 99,
        capacity: 1,
      ),
      isTrue,
    );
  });

  test('guest request identity survives retries and rotates on payload change',
      () {
    var sequence = 0;
    final identity = GuestRequestIdentity(
      requestIdFactory: () => 'request-${++sequence}',
    );
    expect(identity.requestIdFor('same-payload'), 'request-1');
    expect(identity.requestIdFor('same-payload'), 'request-1');
    expect(identity.requestIdFor('changed-payload'), 'request-2');
    identity.complete();
    expect(identity.requestIdFor('changed-payload'), 'request-3');
  });

  test(
      'registration identity keeps timeout retries but rotates for a changed group',
      () {
    var sequence = 0;
    final identity = RegistrationRequestIdentity(
      requestIdFactory: () => 'request-${++sequence}',
    );
    expect(identity.requestIdFor('member-plus-bob'), 'request-1');
    // Ambiguous transport failure: the screen deliberately does not complete
    // the identity, so an exact retry receives the original request id.
    expect(identity.requestIdFor('member-plus-bob'), 'request-1');
    expect(identity.requestIdFor('member-plus-eve'), 'request-2');
    identity.complete();
    expect(identity.requestIdFor('member-plus-eve'), 'request-3');
  });

  test('registration feedback reflects the callable receipt', () {
    expect(
      registrationSuccessMessage(const EventRegistrationResult(
        status: 'confirmed',
        inscriptionId: 'member-1',
        guestInscriptionIds: [],
        idempotent: true,
      )),
      'Inscription déjà enregistrée.',
    );
    expect(
      registrationSuccessMessage(const EventRegistrationResult(
        status: 'pending_payment',
        inscriptionId: 'member-1',
        guestInscriptionIds: ['guest-1'],
        idempotent: false,
      )),
      'Inscription enregistrée — paiement en attente.',
    );
  });

  testWidgets('initial free guest registration emits no synthetic tariff id',
      (tester) async {
    Map<String, dynamic>? result;
    final now = DateTime(2026, 8, 13);
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) {
      return TextButton(
        onPressed: () async {
          result = await showDialog<Map<String, dynamic>>(
            context: context,
            builder: (_) => RegisterWithGuestsDialog(
              operation: Operation(
                id: 'event-1',
                type: 'evenement',
                titre: 'Free event',
                montantPrevu: 0,
                statut: 'ouvert',
                allowGuests: true,
                createdAt: now,
                updatedAt: now,
              ),
              memberBasePrice: 0,
              guestTariffs: const [],
              memberDisplayName: 'Alice Member',
              memberInitials: 'AM',
            ),
          );
        },
        child: const Text('open'),
      );
    })));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ajouter un invité'));
    await tester.pump();
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'Bob');
    await tester.enterText(fields.at(1), 'Guest');
    await tester.tap(find.text("S'inscrire"));
    await tester.pumpAndSettle();
    final guest = (result!['guests'] as List).single as Map<String, dynamic>;
    expect(guest['prix'], 0);
    expect(guest['tariffId'], isNull);
  });

  testWidgets('post-registration free guest dialog locks price to server-free',
      (tester) async {
    Map<String, dynamic>? result;
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) {
      return TextButton(
        onPressed: () async {
          result = await showDialog<Map<String, dynamic>>(
            context: context,
            builder: (_) => const AddGuestDialog(serverPricedFreeGuest: true),
          );
        },
        child: const Text('open'),
      );
    })));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('Invité gratuit'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Prix (€)'), findsNothing);
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'Bob');
    await tester.enterText(fields.at(1), 'Guest');
    await tester.tap(find.text('Ajouter'));
    await tester.pumpAndSettle();
    expect(result, containsPair('prix', 0.0));
    expect(result, containsPair('tariffId', null));
  });
}
