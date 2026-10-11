import 'package:calymob/models/pool_student_history.dart';
import 'package:calymob/services/pool_student_history_reader.dart';
import 'package:calymob/services/member_observation_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('mixed instructor and pupil hours count only the recorded pupil lesson',
      () async {
    final db = FakeFirebaseFirestore();
    final date = Timestamp.fromDate(DateTime(2026, 10, 6));
    final sessions = db.collection('clubs/club/piscine_sessions');
    await sessions.doc('mixed').set({'date': date});
    await sessions.doc('mixed').collection('attendees').doc('pupil').set({
      'scannedAt': date,
      'outcome': 'encadrant',
      'hoursReport': {
        '1ere_heure': {
          'role': 'eleve',
          'group': {'level': '3*', 'groupNumber': 1}
        },
        '2eme_heure': {
          'role': 'encadrant',
          'group': {'level': '2*', 'groupNumber': 1}
        }
      }
    });
    await sessions.doc('planned').set({'date': date});
    await sessions.doc('planned').collection('attendees').doc('pupil').set({
      'scannedAt': Timestamp.fromDate(DateTime(2026, 10, 7)),
      'assignedLevel': '3*'
    });
    final history =
        await PoolStudentHistoryReader(firestore: db).load('club', 'pupil');
    final mixed = history.singleWhere((s) => s.id == 'mixed');
    expect(mixed.participation, 'encadrant');
    expect(mixed.lessons.single.level, '3*');
    expect(mixed.lessons.single.participationReported, isTrue);
    expect(mixed.lessons.single.isPlanned, isFalse);
    expect(
        history.singleWhere((s) => s.id == 'planned').lessons.single.isPlanned,
        isTrue);
    expect(
        poolTrainingVisits(history)
            .map((c) => [c.level, c.reported, c.toConfirm]),
        [
          ['3*', 1, 0]
        ]);
  });

  test(
      'training visits count each date once per level and distinguish planning',
      () {
    PoolStudentSession visit(String id, int day, String participation,
            List<PoolStudentLesson> lessons) =>
        PoolStudentSession(
            id: id,
            date: DateTime(2026, 10, day),
            location: 'Piscine',
            participation: participation,
            lessons: lessons);
    const three = PoolStudentLesson(
        level: '3*', group: '1', hour: '1ere_heure', theme: 'Synthétique');
    const threeLater = PoolStudentLesson(
        level: '3*', group: '2', hour: '2eme_heure', theme: 'Synthétique');
    const planned = PoolStudentLesson(
        level: '3*',
        group: '',
        hour: '2eme_heure',
        theme: 'Planning',
        isPlanned: true);
    const two = PoolStudentLesson(
        level: '2*', group: '1', hour: '1ere_heure', theme: 'Synthétique');
    final counts = poolTrainingVisits([
      visit('a', 6, 'training', [three, threeLater]),
      visit('duplicate', 6, 'training', [three]),
      visit('planning-same-day', 6, '', [planned]),
      visit('b', 7, 'training', [three, two]),
      visit('planning', 8, '', [planned]),
      visit('qr-only', 9, '', []),
      visit('service', 10, 'service_only', [three]),
      const PoolStudentSession(
          id: 'undated',
          date: null,
          location: 'Piscine',
          participation: 'training',
          lessons: [three],
          hasLessonDate: false),
    ]);
    expect(counts.map((c) => [c.level, c.reported, c.toConfirm]), [
      ['2*', 1, 0],
      ['3*', 2, 1],
    ]);
  });

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
  test(
      'web automatic grouping resolves unique scheduled lesson, not validation',
      () {
    final planned = {
      'niveaux': {
        '3*': {
          'courses_by_hour': {
            '1ere_heure': [
              {'id': 'earlier', 'theme': 'Autre heure'}
            ],
            '2eme_heure': [
              {
                'id': 'unique',
                'theme': 'Remontée assistée au gilet',
                'encadrants': [
                  {'membre_prenom': 'Romain', 'membre_nom': 'Test'}
                ]
              }
            ],
          }
        }
      }
    };
    expect(poolAutomaticFormationLevel('2', true), '3*');
    expect(poolAutomaticFormationLevel('2', false), isNull);
    final history = PoolStudentSession.fromRecords(
        's',
        planned,
        [
          {'memberId': 'pupil'}
        ],
        automaticLevel: '3*');
    expect(history.lessons.single.level, '3*');
    expect(history.lessons.single.hour, '2eme_heure');
    expect(history.lessons.single.theme, 'Remontée assistée au gilet');
    expect(history.lessons.single.monitorNames, ['Romain Test']);
    expect(history.lessons.single.sourceLabel, contains('profil actuel'));
    expect(history.trainingReported, isFalse);
    final explicit = PoolStudentSession.fromRecords(
        's',
        planned,
        [
          {'assignedLevel': '3*'}
        ],
        automaticLevel: '1*');
    expect(explicit.lessons.single.level, '3*');
    expect(
        explicit.lessons.single.sourceLabel, isNot(contains('profil actuel')));
  });
  test(
      'automatic level never chooses arbitrary parallel course or overwrites report',
      () {
    final ambiguous = PoolStudentSession.fromRecords('s', session, [{}],
        automaticLevel: '1*');
    expect(ambiguous.lessons.single.theme, isEmpty);
    final saved = PoolStudentSession.fromRecords(
        's',
        session,
        [
          {
            'groupAssignment': {'level': '1*', 'themeSnapshot': 'Historique'}
          }
        ],
        automaticLevel: '3*');
    expect(saved.lessons.single.level, '1*');
    expect(saved.lessons.single.theme, 'Historique');
    final reserve = PoolStudentSession.fromRecords(
        's',
        session,
        [
          {'sentToReserve': true}
        ],
        automaticLevel: '1*');
    expect(reserve.lessons, isEmpty);
  });
  test('general monitor remark has server audit and is not a pool or result',
      () async {
    final db = FakeFirebaseFirestore();
    final service = MemberObservationService(firestore: db);
    await service.addFormationRemark(
        clubId: 'club',
        memberId: 'pupil',
        memberName: 'Test',
        memberNiveau: '3*',
        observerId: 'monitor',
        note: ' Progrès synthétiques ');
    final note = (await db.collection('clubs/club/member_observations').get())
        .docs
        .single
        .data();
    expect(note['note'], 'Progrès synthétiques');
    expect(note['contextType'], 'autre');
    expect(note['observerId'], 'monitor');
    expect(note['contextDate'], isA<Timestamp>());
    // The fake resolves serverTimestamp separately per field. Exact request
    // time equality is verified against the real emulator in the rules test.
    expect(note['createdAt'], isA<Timestamp>());
    expect(note['updatedAt'], isA<Timestamp>());
    expect(note.containsKey('result'), isFalse);
    await expectLater(
        service.addFormationRemark(
            clubId: 'club',
            memberId: 'pupil',
            memberName: 'Test',
            memberNiveau: '3*',
            observerId: 'monitor',
            note: ' '),
        throwsArgumentError);
    expect(
        (await db.collection('clubs/club/member_observations').get()).size, 1);
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
