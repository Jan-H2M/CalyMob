import 'package:calymob/utils/organizer_contact_policy.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('organizerNameMatchesProfile', () {
    test('accepts exact, reordered, accented, and abbreviated names', () {
      expect(
        organizerNameMatchesProfile(
          storedOrganizerName: 'Philippe Cano',
          profileName: 'Philippe CANO',
        ),
        isTrue,
      );
      expect(
        organizerNameMatchesProfile(
          storedOrganizerName: 'TRUONG Julie',
          profileName: 'Julie TRUONG',
        ),
        isTrue,
      );
      expect(
        organizerNameMatchesProfile(
          storedOrganizerName: 'Sebastien Alonso',
          profileName: 'Sébastien ALONSO MACHIELS',
        ),
        isTrue,
      );
      expect(
        organizerNameMatchesProfile(
          storedOrganizerName: 'Se\u0301bastien Alonso',
          profileName: 'Sébastien ALONSO MACHIELS',
        ),
        isTrue,
      );
      expect(
        organizerNameMatchesProfile(
          storedOrganizerName: 'Juan 0473 00 00 00',
          profileName: 'Juan Antonio MARQUEZ SEQUEIRA',
        ),
        isTrue,
      );
    });

    test('accepts an absent legacy name when the id resolves', () {
      expect(
        organizerNameMatchesProfile(
          storedOrganizerName: null,
          profileName: 'Philippe CANO',
        ),
        isTrue,
      );
    });

    test('rejects a directory profile owned by another organiser', () {
      expect(
        organizerNameMatchesProfile(
          storedOrganizerName: 'Philippe Cano',
          profileName: 'Geoffroy LEMAITRE',
        ),
        isFalse,
      );
      expect(
        organizerNameMatchesProfile(
          storedOrganizerName: 'Jan ANDRIESSENS',
          profileName: 'Geoffroy LEMAITRE',
        ),
        isFalse,
      );
    });

    test('rejects missing directory identity', () {
      expect(
        organizerNameMatchesProfile(
          storedOrganizerName: 'Philippe Cano',
          profileName: null,
        ),
        isFalse,
      );
    });

    test('rejects a present name that cannot be matched safely', () {
      for (final storedName in const ['-', '0473 00 00 00', 'J', '李']) {
        expect(
          organizerNameMatchesProfile(
            storedOrganizerName: storedName,
            profileName: 'Geoffroy LEMAITRE',
          ),
          isFalse,
          reason: storedName,
        );
      }
    });
  });

  group('canDisplayOrganizerPhone', () {
    test('requires explicit sharing and a non-empty number', () {
      expect(
        canDisplayOrganizerPhone(
          sharePhone: true,
          phoneNumber: '+32000000000',
        ),
        isTrue,
      );
      expect(
        canDisplayOrganizerPhone(
          sharePhone: false,
          phoneNumber: '+32000000000',
        ),
        isFalse,
      );
      expect(
        canDisplayOrganizerPhone(sharePhone: true, phoneNumber: '  '),
        isFalse,
      );
    });
  });
}
