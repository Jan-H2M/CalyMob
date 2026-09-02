import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/screens/piscine/add_attendee_dialog.dart';

void main() {
  group('routeManualAttendeeSelection', () {
    test(
      'routes an existing member through the eligibility-aware member flow',
      () async {
        String? validatedMemberId;
        var guestWrites = 0;

        await routeManualAttendeeSelection(
          const ManualAttendeeSelection.member(
            memberId: 'member-42',
            memberName: 'Ada Lovelace',
          ),
          onMember: (memberId) async => validatedMemberId = memberId,
          onGuest: (_) async => guestWrites++,
        );

        expect(validatedMemberId, 'member-42');
        expect(guestWrites, 0);
      },
    );

    test('keeps a genuine guest on the separate guest flow', () async {
      var memberValidations = 0;
      ManualAttendeeSelection? addedGuest;
      const guest = ManualAttendeeSelection.guest(
        memberId: 'guest-42',
        memberName: 'Grace Hopper',
      );

      await routeManualAttendeeSelection(
        guest,
        onMember: (_) async => memberValidations++,
        onGuest: (selection) async => addedGuest = selection,
      );

      expect(memberValidations, 0);
      expect(addedGuest, same(guest));
      expect(addedGuest!.isGuest, isTrue);
    });
  });
}
