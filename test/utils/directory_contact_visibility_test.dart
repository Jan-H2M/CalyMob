import 'package:calymob/models/member_profile.dart';
import 'package:calymob/utils/directory_contact_visibility.dart';
import 'package:flutter_test/flutter_test.dart';

MemberProfile directoryCard({
  bool shareEmail = true,
  bool sharePhone = true,
  String email = 'member@example.test',
  String? phone = '+32 470 00 00 01',
}) {
  return MemberProfile(
    id: 'member',
    prenom: 'Directory',
    nom: 'Member',
    email: email,
    phoneNumber: phone,
    shareEmail: shareEmail,
    sharePhone: sharePhone,
  );
}

void main() {
  test('directory card exposes only consented, non-empty contact actions', () {
    final visible = directoryCard();
    final optedOut = directoryCard(shareEmail: false, sharePhone: false);
    final empty = directoryCard(email: ' ', phone: ' ');

    expect(canShowDirectoryEmail(visible), isTrue);
    expect(canShowDirectoryPhone(visible), isTrue);
    expect(canShowDirectoryEmail(optedOut), isFalse);
    expect(canShowDirectoryPhone(optedOut), isFalse);
    expect(canShowDirectoryEmail(empty), isFalse);
    expect(canShowDirectoryPhone(empty), isFalse);
  });
}
