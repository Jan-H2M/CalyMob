import 'package:calymob/services/piscine_session_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const clubId = 'club';
  const sessionId = 'session';
  const memberId = 'member-a';

  group('PiscineSessionService attendee identity', () {
    late FakeFirebaseFirestore firestore;
    late PiscineSessionService service;
    late CollectionReference<Map<String, dynamic>> attendees;

    setUp(() {
      firestore = FakeFirebaseFirestore();
      service = PiscineSessionService(firestore: firestore);
      attendees = firestore
          .collection('clubs')
          .doc(clubId)
          .collection('piscine_sessions')
          .doc(sessionId)
          .collection('attendees');
    });

    test('adds real members on their canonical attendee document', () async {
      await service.addAttendee(
        clubId: clubId,
        sessionId: sessionId,
        memberId: memberId,
        memberName: 'Alice Exemple',
        scannedBy: 'accueil',
      );

      final canonical = await attendees.doc(memberId).get();
      expect(canonical.exists, isTrue);
      expect(canonical.data()!['memberId'], memberId);
      expect(canonical.data()!['memberName'], 'Alice Exemple');
      expect((await attendees.get()).docs.map((doc) => doc.id), [memberId]);
    });

    test('keeps guests on independent generated documents', () async {
      await service.addAttendee(
        clubId: clubId,
        sessionId: sessionId,
        memberId: 'guest-a',
        memberName: 'Invité A',
        scannedBy: 'accueil',
        isGuest: true,
      );

      final all = await attendees.get();
      expect(all.docs, hasLength(1));
      expect(all.docs.single.id, isNot('guest-a'));
      expect(all.docs.single.data()['isGuest'], isTrue);
    });

    test('recognises canonical and French legacy member identities', () async {
      await attendees.doc(memberId).set({
        'memberName': '',
        'outcome': 'training',
      });
      await attendees.doc('legacy-french').set({
        'membre_id': 'member-b',
        'member_name': 'Bob Exemple',
      });

      expect(
        await service.isAttendeePresent(
          clubId: clubId,
          sessionId: sessionId,
          memberId: memberId,
        ),
        isTrue,
      );
      expect(
        await service.isAttendeePresent(
          clubId: clubId,
          sessionId: sessionId,
          memberId: 'member-b',
        ),
        isTrue,
      );
    });

    test('reads French legacy identity and display-name fields', () async {
      await attendees.doc('legacy-french').set({
        'membre_id': memberId,
        'member_name': 'Alice Héritage',
        'scannedAt': Timestamp.fromDate(DateTime.utc(2026, 9, 1, 19)),
      });

      final attendee = await service.getAttendeeByMemberId(
        clubId: clubId,
        sessionId: sessionId,
        memberId: memberId,
      );

      expect(attendee, isNotNull);
      expect(attendee!.id, 'legacy-french');
      expect(attendee.memberId, memberId);
      expect(attendee.memberName, 'Alice Héritage');
    });

    test(
      'deduplicates legacy random and canonical attendee documents',
      () async {
        await attendees.doc('legacy-random').set({
          'memberId': memberId,
          'memberName': 'Alice Exemple',
          'scannedAt': Timestamp.fromDate(DateTime.utc(2026, 9, 1, 19)),
          'scannedBy': 'accueil',
          'isGuest': false,
        });
        await attendees.doc(memberId).set({
          'memberId': memberId,
          'memberName': '',
          'scannedAt': Timestamp.fromDate(DateTime.utc(2026, 9, 1, 20)),
          'scannedBy': '',
          'isGuest': false,
        });

        final visible =
            await service.getAttendeesStream(clubId, sessionId).first;

        expect(visible, hasLength(1));
        expect(visible.single.id, 'legacy-random');
        expect(visible.single.memberId, memberId);
        expect(visible.single.memberName, 'Alice Exemple');
      },
    );

    test('removes all legacy duplicates for the same real member', () async {
      await attendees.doc('legacy-random').set({
        'memberId': memberId,
        'memberName': 'Alice Exemple',
        'scannedAt': Timestamp.fromDate(DateTime.utc(2026, 9, 1, 19)),
        'scannedBy': 'accueil',
        'isGuest': false,
      });
      await attendees.doc(memberId).set({
        'memberId': memberId,
        'memberName': '',
        'scannedAt': Timestamp.fromDate(DateTime.utc(2026, 9, 1, 20)),
        'isGuest': false,
      });
      await attendees.doc('legacy-french').set({
        'membre_id': memberId,
        'member_name': 'Alice Exemple',
        'scannedAt': Timestamp.fromDate(DateTime.utc(2026, 9, 1, 21)),
        'isGuest': false,
      });

      final removed = await service.removeAttendee(
        clubId: clubId,
        sessionId: sessionId,
        attendeeId: 'legacy-random',
      );

      expect(removed.documents.map((document) => document.id),
          ['legacy-french', 'legacy-random', memberId]);
      expect((await attendees.doc('legacy-random').get()).exists, isFalse);
      expect((await attendees.doc(memberId).get()).exists, isFalse);
      expect((await attendees.doc('legacy-french').get()).exists, isFalse);
    });

    test('undo restores every duplicate with completion evidence losslessly',
        () async {
      final completedAt = Timestamp.fromDate(DateTime.utc(2026, 9, 1, 21));
      await attendees.doc('legacy-random').set({
        'memberId': memberId,
        'memberName': 'Alice Exemple',
        'scannedAt': Timestamp.fromDate(DateTime.utc(2026, 9, 1, 19)),
        'outcome': 'training',
        'groupAssignment': {
          'level': '2*',
          'groupNumber': 2,
          'groupKey': '2star_groupe2',
          'validatorId': 'validator-2',
          'moniteurIds': ['monitor-2'],
        },
        'checkinCompletedAt': completedAt,
        'completion_proof': {'source': 'legacy-task', 'kept': true},
      });
      await attendees.doc(memberId).set({
        'memberId': memberId,
        'memberName': '',
        'scannedAt': Timestamp.fromDate(DateTime.utc(2026, 9, 1, 20)),
        'assignedLevel': '2*',
        'assignedCourseId': 'course-2',
      });
      await attendees.doc('legacy-french').set({
        'membre_id': memberId,
        'member_name': 'Alice Héritage',
        'scannedAt': Timestamp.fromDate(DateTime.utc(2026, 9, 1, 18)),
        'validator_override': 'validator-historical',
      });

      final before = {
        for (final document in (await attendees.get()).docs)
          document.id: document.data(),
      };
      final removed = await service.removeAttendee(
        clubId: clubId,
        sessionId: sessionId,
        attendeeId: 'legacy-random',
      );

      expect((await attendees.get()).docs, isEmpty);

      await service.restoreRemovedAttendee(
        clubId: clubId,
        sessionId: sessionId,
        snapshot: removed,
      );

      final after = {
        for (final document in (await attendees.get()).docs)
          document.id: document.data(),
      };
      expect(after, before);
      expect(
        (after['legacy-random']!['groupAssignment'] as Map)['validatorId'],
        'validator-2',
      );
      expect(after['legacy-random']!['checkinCompletedAt'], completedAt);
      expect(after['legacy-random']!['completion_proof'],
          {'source': 'legacy-task', 'kept': true});
    });
  });
}
