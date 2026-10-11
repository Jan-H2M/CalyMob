import 'package:calymob/models/pool_student_history.dart';
import 'package:calymob/services/pool_student_history_reader.dart';
import 'package:calymob/services/member_observation_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final date = DateTime.utc(2025, 1, 7, 20);
  final session = <String, dynamic>{
    'date': Timestamp.fromDate(date),
    'niveaux': {
      '1*': {
        'courses_by_hour': {
          '1ere_heure': [
            {'id': 'a', 'order': 0, 'theme': 'Apnée', 'encadrants': []},
            {
              'id': 'b',
              'order': 1,
              'theme': 'Masque',
              'encadrants': [
                {'membre_prenom': 'Alice', 'membre_nom': 'Test'}
              ]
            },
          ],
          '2eme_heure': [
            {'id': 'c', 'order': 0, 'theme': 'Sauvetage'}
          ],
        }
      }
    },
  };
  test('two-hour report resolves exact group, theme snapshot and monitors', () {
    final history = PoolStudentSession.fromRecords('s', session, [
      {
        'scannedAt': Timestamp.fromDate(date),
        'hoursReport': {
          '1ere_heure': {
            'role': 'eleve',
            'group': {
              'level': '1*',
              'groupNumber': 2,
              'themeSnapshot': 'Masque pratiqué'
            }
          },
          '2eme_heure': {
            'role': 'eleve',
            'group': {'course_id': 'c'}
          },
        },
      }
    ]);
    expect(history.lessons.length, 2);
    expect(history.lessons.first.theme, 'Masque pratiqué');
    expect(history.lessons.first.group, '2');
    expect(history.lessons.first.monitorNames, ['Alice Test']);
    expect(history.lessons.last.theme, 'Sauvetage');
    expect(history.trainingReported, isTrue);
  });
  test('QR and planned level alone do not prove training or guess a group', () {
    final history = PoolStudentSession.fromRecords('s', session, [
      {'assignedLevel': '1*'}
    ]);
    expect(history.trainingReported, isFalse);
    expect(history.lessons.single.theme, isEmpty);
    expect(history.lessons.single.monitorNames, isEmpty);
  });
  test('contradictory course ID cannot rewrite saved hour, level or group', () {
    final history = PoolStudentSession.fromRecords('s', session, [
      {
        'hoursReport': {
          '1ere_heure': {
            'role': 'eleve',
            'group': {'level': '1*', 'groupNumber': 2, 'course_id': 'c'}
          }
        },
      }
    ]);
    expect(history.lessons.single.hour, '1ere_heure');
    expect(history.lessons.single.group, '2');
    expect(history.lessons.single.theme, isEmpty);
    expect(history.lessons.single.monitorNames, isEmpty);
  });
  test('unambiguous legacy direct level has theme and monitor, not group 2',
      () {
    final legacy = {
      'niveaux': {
        '1*': {
          'theme': 'Apnée ancienne',
          'encadrants': [
            {'membre_prenom': 'Alice', 'membre_nom': 'Test'}
          ]
        }
      }
    };
    final first = PoolStudentSession.fromRecords('s', legacy, [
      {
        'groupAssignment': {'level': '1*', 'groupNumber': 1}
      }
    ]);
    expect(first.lessons.single.theme, 'Apnée ancienne');
    expect(first.lessons.single.monitorNames, ['Alice Test']);
    final second = PoolStudentSession.fromRecords('s', legacy, [
      {
        'groupAssignment': {'level': '1*', 'groupNumber': 2}
      }
    ]);
    expect(second.lessons.single.theme, isEmpty);
    final conflict = PoolStudentSession.fromRecords('s', legacy, [
      {
        'groupAssignment': {
          'level': '1*',
          'groupNumber': 2,
          'course_id': '1*_legacy'
        }
      }
    ]);
    expect(conflict.lessons.single.theme, isEmpty);
  });
  test('explicit service outcome wins over stale pupil report', () {
    final history = PoolStudentSession.fromRecords('s', session, [
      {
        'outcome': 'service_only',
        'hoursReport': {
          '1ere_heure': {'role': 'eleve'}
        },
      }
    ]);
    expect(history.trainingReported, isFalse);
  });
  test('missing lesson date never becomes today or permits a historical note',
      () {
    final history = PoolStudentSession.fromRecords('s', {}, [{}]);
    expect(history.date, isNull);
    expect(history.hasLessonDate, isFalse);
  });
  test(
      'reader covers old and legacy QR, isolates student/club and deduplicates',
      () async {
    final db = FakeFirebaseFirestore();
    final sessions =
        db.collection('clubs').doc('club').collection('piscine_sessions');
    await sessions.doc('old').set(session);
    await sessions
        .doc('old')
        .collection('attendees')
        .doc('qr')
        .set({'memberId': 'pupil', 'scannedAt': Timestamp.fromDate(date)});
    await sessions
        .doc('old')
        .collection('attendees')
        .doc('pupil')
        .set({'scannedAt': Timestamp.fromDate(date), 'remarks': 'Bon travail'});
    await sessions
        .doc('old')
        .collection('attendees')
        .doc('other')
        .set({'memberId': 'other', 'scannedAt': Timestamp.fromDate(date)});
    await sessions
        .doc('legacy')
        .set({'date': Timestamp.fromDate(date.add(const Duration(days: 7)))});
    await sessions
        .doc('legacy')
        .collection('attendees')
        .doc('qr')
        .set({'membre_id': 'pupil', 'scannedAt': Timestamp.fromDate(date)});
    await sessions.doc('theory').set({...session, 'type': 'theorie'});
    await sessions
        .doc('theory')
        .collection('attendees')
        .doc('pupil')
        .set({'scannedAt': Timestamp.fromDate(date)});
    await sessions.doc('planned').set(session);
    await sessions
        .doc('planned')
        .collection('attendees')
        .doc('pupil')
        .set({'assignedLevel': '1*'});
    await db.doc('clubs/other/piscine_sessions/private').set(session);
    await db
        .doc('clubs/other/piscine_sessions/private/attendees/pupil')
        .set({'scannedAt': Timestamp.fromDate(date)});
    final history =
        await PoolStudentHistoryReader(firestore: db).load('club', 'pupil');
    expect(history.map((s) => s.id).toList(), ['legacy', 'old']);
    expect(history.last.instructorRemark, 'Bon travail');
  });
  test('lesson date and creation audit are separate, no validation payload',
      () async {
    final db = FakeFirebaseFirestore();
    await MemberObservationService(firestore: db).addPoolSessionRemark(
        clubId: 'club',
        memberId: 'pupil',
        memberName: 'Test',
        observerId: 'monitor',
        sessionId: 'old',
        sessionDate: date,
        note: 'Progrès');
    final note = (await db.collection('clubs/club/member_observations').get())
        .docs
        .single
        .data();
    expect(note['contextId'], 'old');
    expect(note['contextDate'], Timestamp.fromDate(date));
    expect(note['createdAt'], isA<Timestamp>());
    expect(note['createdAt'], isNot(note['contextDate']));
    expect(note['observerId'], 'monitor');
    expect(note.containsKey('result'), isFalse);
    expect(note.containsKey('exerciceCode'), isFalse);
  });
}
