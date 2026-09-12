import 'package:calymob/models/member_profile.dart';
import 'package:calymob/screens/profile/who_is_who_screen.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const months = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ];

  test('Who’s Who uses only consented directory birthday parts', () {
    final directoryMember = MemberProfile(
      id: 'member',
      nom: 'Example',
      prenom: 'Alice',
      email: '',
      shareBirthday: true,
      birthMonth: 7,
      birthDay: 7,
      birthDate: DateTime.utc(1991, 7, 6, 22),
    );
    final privateOnlyMember = MemberProfile(
      id: 'private',
      nom: 'Private',
      prenom: 'Date',
      email: '',
      shareBirthday: true,
      birthDate: DateTime.utc(1991, 7, 7),
    );
    final optedOut = MemberProfile(
      id: 'hidden',
      nom: 'Hidden',
      prenom: 'Date',
      email: '',
      shareBirthday: false,
      birthMonth: 7,
      birthDay: 7,
      birthDate: DateTime.utc(1991, 7, 7),
    );

    expect(formatDirectoryBirthday(directoryMember, months), '7 juillet');
    expect(formatDirectoryBirthday(privateOnlyMember, months), isNull);
    expect(formatDirectoryBirthday(optedOut, months), isNull);
  });
}
