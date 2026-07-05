import 'package:calymob/models/member_profile.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('MemberProfile', () {
    test('uses visible insurance validity for LIFRAS members', () async {
      final firestore = FakeFirebaseFirestore();
      final cotisationValidite = DateTime(2099, 1, 30);
      final assuranceValidite = DateTime(2099, 1, 31);

      final docRef = firestore.collection('clubs/club1/members').doc('juan');
      await docRef.set({
        'prenom': 'Juan Antonio',
        'nom': 'MARQUEZ SEQUEIRA',
        'email': 'juan.antonio.marquez.sc@gmail.com',
        'lifras_id': '12345',
        'cotisation_validite': Timestamp.fromDate(cotisationValidite),
        'certificat_medical_validite': Timestamp.fromDate(DateTime(2099, 8, 7)),
        'assurance_validite': Timestamp.fromDate(assuranceValidite),
      });

      final profile = MemberProfile.fromFirestore(await docRef.get());

      expect(profile.hasLifras, isTrue);
      expect(profile.assuranceValiditeEffective, assuranceValidite);
      expect(profile.assuranceStatus, ValidationStatus.valid);
    });

    test('parses legacy string validity dates without dropping member data',
        () async {
      final firestore = FakeFirebaseFirestore();

      final docRef = firestore.collection('clubs/club1/members').doc('member');
      await docRef.set({
        'prenom': 'Legacy',
        'nom': 'Member',
        'email': 'legacy@example.com',
        'licence_lifras': '98765',
        'cotisation_validite': '2099-01-30T00:00:00.000Z',
        'certificat_medical_validite': '07/08/2099',
        'assurance_validite': '30/01/2099',
      });

      final profile = MemberProfile.fromFirestore(await docRef.get());

      expect(profile.hasLifras, isTrue);
      expect(profile.cotisationStatus, ValidationStatus.valid);
      expect(profile.certificatStatus, ValidationStatus.valid);
      expect(profile.assuranceStatus, ValidationStatus.valid);
    });

    test('does not use hidden has_lifras flag as insurance fallback', () async {
      final firestore = FakeFirebaseFirestore();

      final docRef = firestore.collection('clubs/club1/members').doc('hidden');
      await docRef.set({
        'prenom': 'Hidden',
        'nom': 'Flag',
        'email': 'hidden@example.com',
        'has_lifras': true,
        'cotisation_validite': Timestamp.fromDate(DateTime(2099, 1, 30)),
        'certificat_medical_validite': Timestamp.fromDate(DateTime(2099, 8, 7)),
      });

      final profile = MemberProfile.fromFirestore(await docRef.get());

      expect(profile.hasLifras, isFalse);
      expect(profile.assuranceValiditeEffective, isNull);
      expect(profile.assuranceStatus, ValidationStatus.missing);
    });

    test('does not derive insurance from LIFRAS id or cotisation', () async {
      final firestore = FakeFirebaseFirestore();

      final docRef = firestore.collection('clubs/club1/members').doc('lifras');
      await docRef.set({
        'prenom': 'Lifras',
        'nom': 'Only',
        'email': 'lifras@example.com',
        'lifras_id': '12345',
        'cotisation_validite': Timestamp.fromDate(DateTime(2099, 1, 30)),
        'certificat_medical_validite': Timestamp.fromDate(DateTime(2099, 8, 7)),
      });

      final profile = MemberProfile.fromFirestore(await docRef.get());

      expect(profile.hasLifras, isTrue);
      expect(profile.assuranceValiditeEffective, isNull);
      expect(profile.assuranceStatus, ValidationStatus.missing);
    });

    test('uses explicit insurance validity without a LIFRAS id', () async {
      final firestore = FakeFirebaseFirestore();
      final assuranceValidite = DateTime(2099, 1, 30);

      final docRef =
          firestore.collection('clubs/club1/members').doc('federation');
      await docRef.set({
        'prenom': 'Other',
        'nom': 'Federation',
        'email': 'other@example.com',
        'cotisation_validite': Timestamp.fromDate(DateTime(2099, 1, 30)),
        'certificat_medical_validite': Timestamp.fromDate(DateTime(2099, 8, 7)),
        'assurance_validite': Timestamp.fromDate(assuranceValidite),
      });

      final profile = MemberProfile.fromFirestore(await docRef.get());

      expect(profile.hasLifras, isFalse);
      expect(profile.assuranceValiditeEffective, assuranceValidite);
      expect(profile.assuranceStatus, ValidationStatus.valid);
    });
  });
}
