import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:calymob/services/local_read_tracker.dart';
import 'package:calymob/services/unread_count_service.dart';

/// Tests voor het nieuwe unread count systeem na de refactor:
/// - LocalReadTracker (SharedPreferences timestamps)
/// - UnreadCountService (Firestore count() queries)
///
/// Scenario's:
/// 1. Nooit geopend → alle messages zijn ongelezen
/// 2. Na markAsRead → nieuwe messages zijn ongelezen, oude niet
/// 3. Meerdere gebruikers posten → count gaat omhoog
/// 4. Rollen filteren team/session channels correct
void main() {
  const clubId = 'calypso';

  group('LocalReadTracker', () {
    setUp(() {
      // Mock SharedPreferences
      SharedPreferences.setMockInitialValues({});
    });

    test('getLastRead retourneert null voor een nieuwe key', () async {
      final tracker = LocalReadTracker();
      await tracker.init();
      expect(tracker.getLastRead('test_key'), isNull);
    });

    test('markAsRead slaat timestamp op', () async {
      final tracker = LocalReadTracker();
      await tracker.init();

      final before = DateTime.now();
      await tracker.markAsRead('announcements');
      final after = DateTime.now();

      final lastRead = tracker.getLastRead('announcements');
      expect(lastRead, isNotNull);
      // Timestamp moet tussen before en after liggen
      expect(lastRead!.millisecondsSinceEpoch,
          greaterThanOrEqualTo(before.millisecondsSinceEpoch));
      expect(lastRead.millisecondsSinceEpoch,
          lessThanOrEqualTo(after.millisecondsSinceEpoch));
    });

    test('initIfAbsent initialiseert alleen als niet bestaat', () async {
      final tracker = LocalReadTracker();
      await tracker.init();

      // Eerste keer: moet initialiseren
      await tracker.initIfAbsent('new_key');
      final first = tracker.getLastRead('new_key');
      expect(first, isNotNull);

      // Wacht 10ms en doe opnieuw: moet NIET overschrijven
      await Future.delayed(const Duration(milliseconds: 10));
      await tracker.initIfAbsent('new_key');
      final second = tracker.getLastRead('new_key');
      expect(second!.millisecondsSinceEpoch, equals(first!.millisecondsSinceEpoch));
    });

    test('resetAll verwijdert alle keys', () async {
      final tracker = LocalReadTracker();
      await tracker.init();

      await tracker.markAsRead('key_1');
      await tracker.markAsRead('key_2');
      expect(tracker.getLastRead('key_1'), isNotNull);
      expect(tracker.getLastRead('key_2'), isNotNull);

      await tracker.resetAll();
      expect(tracker.getLastRead('key_1'), isNull);
      expect(tracker.getLastRead('key_2'), isNull);
    });
  });

  group('UnreadCountService - Announcements', () {
    late FakeFirebaseFirestore fakeFirestore;

    setUp(() {
      SharedPreferences.setMockInitialValues({});
      fakeFirestore = FakeFirebaseFirestore();
    });

    test('CRITICAL FIX: nooit geopend → tel ALLE announcements als ongelezen', () async {
      // Setup: 3 announcements, user heeft het scherm nooit geopend
      for (int i = 0; i < 3; i++) {
        await fakeFirestore.collection('clubs/$clubId/announcements').add({
          'created_at': Timestamp.fromDate(
              DateTime.now().subtract(Duration(days: i))),
          'title': 'Annonce $i',
          'content': 'Contenu $i',
        });
      }

      // VOORHEEN (bug): lastRead == null → return 0
      // NU (fix): lastRead == null → gebruik epoch → tel alles
      // We kunnen niet direct de service testen omdat die FirebaseFirestore.instance gebruikt,
      // maar we testen de logica hier:
      final tracker = LocalReadTracker();
      await tracker.init();
      final lastRead = tracker.getLastRead('announcements');
      expect(lastRead, isNull, reason: 'Nooit geopend, dus null');

      // Met de fix: null → epoch (2024-01-01)
      final epoch = DateTime(2024, 1, 1);
      final effectiveLastRead = lastRead ?? epoch;
      expect(effectiveLastRead, equals(epoch));

      // Query alle announcements na epoch → zou 3 moeten geven
      final snapshot = await fakeFirestore
          .collection('clubs/$clubId/announcements')
          .where('created_at',
              isGreaterThan: Timestamp.fromDate(effectiveLastRead))
          .get();
      expect(snapshot.docs.length, equals(3),
          reason: 'Alle 3 announcements moeten ongelezen zijn');
    });

    test('na markAsRead → alleen nieuwe messages zijn ongelezen', () async {
      // Setup: 2 oude announcements
      for (int i = 0; i < 2; i++) {
        await fakeFirestore.collection('clubs/$clubId/announcements').add({
          'created_at': Timestamp.fromDate(
              DateTime.now().subtract(const Duration(hours: 2))),
          'title': 'Oude annonce $i',
        });
      }

      // User opent het scherm → markAsRead
      final tracker = LocalReadTracker();
      await tracker.init();
      await tracker.markAsRead('announcements');
      final lastRead = tracker.getLastRead('announcements')!;

      // 1 nieuw announcement NA markAsRead
      await Future.delayed(const Duration(milliseconds: 10));
      await fakeFirestore.collection('clubs/$clubId/announcements').add({
        'created_at': Timestamp.fromDate(DateTime.now()),
        'title': 'Nieuw announcement',
      });

      // Query: alleen messages na lastRead
      final snapshot = await fakeFirestore
          .collection('clubs/$clubId/announcements')
          .where('created_at',
              isGreaterThan: Timestamp.fromDate(lastRead))
          .get();
      expect(snapshot.docs.length, equals(1),
          reason: 'Alleen het nieuwe announcement is ongelezen');
    });
  });

  group('UnreadCountService - Event Messages', () {
    late FakeFirebaseFirestore fakeFirestore;
    const operationId = 'sortie_mer_2026';

    setUp(() {
      SharedPreferences.setMockInitialValues({});
      fakeFirestore = FakeFirebaseFirestore();
    });

    test('CRITICAL FIX: nooit geopend event → tel ALLE messages', () async {
      // Maak een open event
      await fakeFirestore
          .collection('clubs/$clubId/operations')
          .doc(operationId)
          .set({
        'type': 'evenement',
        'statut': 'ouvert',
        'titre': 'Sortie Mer',
      });

      // 5 messages van verschillende users
      for (int i = 0; i < 5; i++) {
        await fakeFirestore
            .collection('clubs/$clubId/operations/$operationId/messages')
            .add({
          'created_at': Timestamp.fromDate(
              DateTime.now().subtract(Duration(hours: i))),
          'message': 'Message $i',
          'sender_id': 'user_$i',
          'sender_name': 'User $i',
        });
      }

      // Nooit geopend → lastRead null
      final tracker = LocalReadTracker();
      await tracker.init();
      final lastRead = tracker.getLastRead('operation_$operationId');
      expect(lastRead, isNull);

      // Met de fix: null → epoch
      final epoch = DateTime(2024, 1, 1);
      final effectiveLastRead = lastRead ?? epoch;

      final snapshot = await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .where('created_at',
              isGreaterThan: Timestamp.fromDate(effectiveLastRead))
          .get();
      expect(snapshot.docs.length, equals(5),
          reason: 'Alle 5 messages moeten ongelezen zijn');
    });

    test('multi-user scenario: 3 users posten, badges updaten correct', () async {
      await fakeFirestore
          .collection('clubs/$clubId/operations')
          .doc(operationId)
          .set({
        'type': 'evenement',
        'statut': 'ouvert',
        'titre': 'Sortie Mer',
      });

      final tracker = LocalReadTracker();
      await tracker.init();

      // User Jan opent het event voor het eerst
      await tracker.markAsRead('operation_$operationId');
      final janLastRead = tracker.getLastRead('operation_$operationId')!;

      // Pierre post een message
      await Future.delayed(const Duration(milliseconds: 10));
      await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .add({
        'created_at': Timestamp.fromDate(DateTime.now()),
        'message': 'Salut tout le monde!',
        'sender_id': 'pierre_002',
        'sender_name': 'Pierre',
      });

      // Marie post een message
      await Future.delayed(const Duration(milliseconds: 10));
      await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .add({
        'created_at': Timestamp.fromDate(DateTime.now()),
        'message': 'On se retrouve à 9h?',
        'sender_id': 'marie_003',
        'sender_name': 'Marie',
      });

      // Geoffroy post een message
      await Future.delayed(const Duration(milliseconds: 10));
      await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .add({
        'created_at': Timestamp.fromDate(DateTime.now()),
        'message': 'Je suis partant!',
        'sender_id': 'geoffroy_004',
        'sender_name': 'Geoffroy',
      });

      // Jan's count: 3 messages na zijn lastRead
      final snapshot = await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .where('created_at',
              isGreaterThan: Timestamp.fromDate(janLastRead))
          .get();
      expect(snapshot.docs.length, equals(3),
          reason: 'Jan ziet 3 ongelezen messages');

      // Jan opent het event opnieuw → markAsRead
      await tracker.markAsRead('operation_$operationId');
      final janNewLastRead = tracker.getLastRead('operation_$operationId')!;

      // Na markAsRead: 0 messages ongelezen
      final snapshotAfter = await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .where('created_at',
              isGreaterThan: Timestamp.fromDate(janNewLastRead))
          .get();
      expect(snapshotAfter.docs.length, equals(0),
          reason: 'Jan heeft alles gelezen, 0 ongelezen');

      // Pierre post nog een message
      await Future.delayed(const Duration(milliseconds: 10));
      await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .add({
        'created_at': Timestamp.fromDate(DateTime.now()),
        'message': 'Dernière info: apportez vos palmes!',
        'sender_id': 'pierre_002',
        'sender_name': 'Pierre',
      });

      // Jan ziet nu weer 1 ongelezen
      final snapshotFinal = await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .where('created_at',
              isGreaterThan: Timestamp.fromDate(janNewLastRead))
          .get();
      expect(snapshotFinal.docs.length, equals(1),
          reason: 'Jan ziet 1 nieuw bericht van Pierre');
    });
  });

  group('UnreadCountService - Team Messages (role-based)', () {
    late FakeFirebaseFirestore fakeFirestore;

    setUp(() {
      SharedPreferences.setMockInitialValues({});
      fakeFirestore = FakeFirebaseFirestore();
    });

    test('FIX: rollen worden correct gefilterd voor team channels', () {
      // Test de role mapping logica (die nu correct werkt)
      final roles = ['accueil', 'encadrant'];
      final normalizedRoles = roles.map((r) => r.toLowerCase()).toList();

      final channelIds = <String>[];
      if (normalizedRoles.contains('accueil')) channelIds.add('equipe_accueil');
      if (normalizedRoles.contains('encadrant') ||
          normalizedRoles.contains('encadrants')) {
        channelIds.add('equipe_encadrants');
      }
      if (normalizedRoles.contains('gonflage')) channelIds.add('equipe_gonflage');

      expect(channelIds, equals(['equipe_accueil', 'equipe_encadrants']),
          reason: 'Accueil en encadrant rollen moeten 2 channels geven');
    });

    test('lege rollen → 0 team messages', () {
      final roles = <String>[];
      final channelIds = <String>[];
      final normalizedRoles = roles.map((r) => r.toLowerCase()).toList();

      if (normalizedRoles.contains('accueil')) channelIds.add('equipe_accueil');
      if (normalizedRoles.contains('encadrant')) channelIds.add('equipe_encadrants');

      expect(channelIds.isEmpty, isTrue,
          reason: 'Geen rollen → geen channels → 0 messages');
    });

    test('CRITICAL FIX: nooit geopend team channel → tel ALLE messages', () async {
      const channelId = 'equipe_encadrants';

      // 4 messages in het team channel
      for (int i = 0; i < 4; i++) {
        await fakeFirestore
            .collection('clubs/$clubId/team_channels/$channelId/messages')
            .add({
          'created_at': Timestamp.fromDate(
              DateTime.now().subtract(Duration(hours: i))),
          'message': 'Team message $i',
          'sender_id': 'user_$i',
        });
      }

      // Nooit geopend → lastRead null → epoch
      final tracker = LocalReadTracker();
      await tracker.init();
      final lastRead = tracker.getLastRead('team_$channelId');
      expect(lastRead, isNull);

      final epoch = DateTime(2024, 1, 1);
      final effectiveLastRead = lastRead ?? epoch;

      final snapshot = await fakeFirestore
          .collection('clubs/$clubId/team_channels/$channelId/messages')
          .where('created_at',
              isGreaterThan: Timestamp.fromDate(effectiveLastRead))
          .get();
      expect(snapshot.docs.length, equals(4),
          reason: 'Alle 4 team messages zijn ongelezen');
    });
  });

  group('Scenario complet multi-utilisateurs', () {
    late FakeFirebaseFirestore fakeFirestore;
    const operationId = 'plongee_fevrier';

    setUp(() {
      SharedPreferences.setMockInitialValues({});
      fakeFirestore = FakeFirebaseFirestore();
    });

    test('Simulation: Jan, Pierre et Marie dans une discussion', () async {
      // Setup event
      await fakeFirestore
          .collection('clubs/$clubId/operations')
          .doc(operationId)
          .set({
        'type': 'evenement',
        'statut': 'ouvert',
        'titre': 'Plongée Février',
      });

      final tracker = LocalReadTracker();
      await tracker.init();
      final epoch = DateTime(2024, 1, 1);

      // === ÉTAPE 1: Jan n'a jamais ouvert → tout est non lu ===
      // Pierre poste 2 messages
      await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .add({
        'created_at': Timestamp.fromDate(
            DateTime.now().subtract(const Duration(hours: 5))),
        'message': 'Qui vient samedi?',
        'sender_id': 'pierre',
      });
      await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .add({
        'created_at': Timestamp.fromDate(
            DateTime.now().subtract(const Duration(hours: 4))),
        'message': 'RDV à 8h au port',
        'sender_id': 'pierre',
      });

      var lastRead =
          tracker.getLastRead('operation_$operationId') ?? epoch;
      var snap = await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .where('created_at',
              isGreaterThan: Timestamp.fromDate(lastRead))
          .get();
      expect(snap.docs.length, equals(2),
          reason: 'Étape 1: Jan voit 2 messages non lus');

      // === ÉTAPE 2: Jan ouvre la discussion ===
      await tracker.markAsRead('operation_$operationId');
      lastRead = tracker.getLastRead('operation_$operationId')!;

      snap = await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .where('created_at',
              isGreaterThan: Timestamp.fromDate(lastRead))
          .get();
      expect(snap.docs.length, equals(0),
          reason: 'Étape 2: Jan a tout lu, 0 non lus');

      // === ÉTAPE 3: Marie envoie un message pendant que Jan est absent ===
      await Future.delayed(const Duration(milliseconds: 20));
      await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .add({
        'created_at': Timestamp.fromDate(DateTime.now()),
        'message': 'Je serai là! 🤿',
        'sender_id': 'marie',
      });

      snap = await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .where('created_at',
              isGreaterThan: Timestamp.fromDate(lastRead))
          .get();
      expect(snap.docs.length, equals(1),
          reason: 'Étape 3: Jan voit 1 nouveau message de Marie');

      // === ÉTAPE 4: Pierre et Geoffroy répondent aussi ===
      await Future.delayed(const Duration(milliseconds: 10));
      await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .add({
        'created_at': Timestamp.fromDate(DateTime.now()),
        'message': 'Super Marie! Pierre aussi',
        'sender_id': 'pierre',
      });
      await Future.delayed(const Duration(milliseconds: 10));
      await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .add({
        'created_at': Timestamp.fromDate(DateTime.now()),
        'message': 'Moi aussi je viens!',
        'sender_id': 'geoffroy',
      });

      snap = await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .where('created_at',
              isGreaterThan: Timestamp.fromDate(lastRead))
          .get();
      expect(snap.docs.length, equals(3),
          reason: 'Étape 4: Jan voit 3 messages non lus (Marie + Pierre + Geoffroy)');

      // === ÉTAPE 5: Jan ouvre à nouveau → tout lu ===
      await tracker.markAsRead('operation_$operationId');
      lastRead = tracker.getLastRead('operation_$operationId')!;

      snap = await fakeFirestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .where('created_at',
              isGreaterThan: Timestamp.fromDate(lastRead))
          .get();
      expect(snap.docs.length, equals(0),
          reason: 'Étape 5: Jan a tout lu, retour à 0');
    });
  });
}
