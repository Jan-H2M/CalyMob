import 'dart:async';
import 'package:calymob/models/member_profile.dart';
import 'package:calymob/widgets/profile/directory_birthday.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

MemberProfile profile({
  String id = 'synthetic-member',
  bool shared = true,
  int? day = 7,
  int? month = 7,
}) =>
    MemberProfile(
      id: id,
      nom: 'Fictif',
      prenom: 'QA',
      email: '',
      shareBirthday: shared,
      birthDay: day,
      birthMonth: month,
      birthDate: DateTime(1991, 7, 7),
    );

void main() {
  final birthday = find.textContaining('Anniversaire :');
  Future<void> pump(WidgetTester tester, Stream<MemberProfile?> stream) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
      body: DirectoryBirthday(profiles: stream),
    )));
    await tester.pump();
  }

  testWidgets('an open birthday follows opt-out and later opt-in',
      (tester) async {
    final states = StreamController<MemberProfile?>.broadcast(sync: true);
    addTearDown(() {
      if (!states.isClosed) return states.close();
    });
    await pump(tester, states.stream);
    expect(birthday, findsNothing);
    states.add(profile());
    await tester.pump();
    expect(find.text('Anniversaire : 7 juillet'), findsOneWidget);
    states.add(profile(shared: false));
    await tester.pump();
    expect(birthday, findsNothing);
    states.add(profile(day: 8, month: 8));
    await tester.pump();
    expect(find.text('Anniversaire : 8 août'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    expect(states.hasListener, isFalse);
  });

  testWidgets('read failure, deletion and stream completion discard the date',
      (tester) async {
    final states = StreamController<MemberProfile?>.broadcast(sync: true);
    addTearDown(() {
      if (!states.isClosed) return states.close();
    });
    await pump(tester, states.stream);
    states.add(profile());
    await tester.pump();
    expect(birthday, findsOneWidget);
    states.addError(FirebaseException(
        plugin: 'cloud_firestore', code: 'permission-denied'));
    await tester.pump();
    expect(birthday, findsNothing);
    expect(tester.takeException(), isNull);
    states.add(profile());
    await tester.pump();
    expect(birthday, findsOneWidget);
    states.add(null);
    await tester.pump();
    expect(birthday, findsNothing);
    states.add(profile());
    await tester.pump();
    final closed = states.close();
    await tester.pump();
    expect(birthday, findsNothing);
    await tester.pumpWidget(const SizedBox());
    await closed;
  });

  testWidgets('a replacement stream hides the previous member while waiting',
      (tester) async {
    final old = StreamController<MemberProfile?>.broadcast(sync: true);
    final next = StreamController<MemberProfile?>.broadcast(sync: true);
    addTearDown(old.close);
    addTearDown(next.close);
    await pump(tester, old.stream);
    old.add(profile());
    await tester.pump();
    expect(birthday, findsOneWidget);
    await pump(tester, next.stream);
    expect(birthday, findsNothing);
    expect(old.hasListener, isFalse);
    old.add(profile(day: 1));
    await tester.pump();
    expect(birthday, findsNothing);
    next.add(profile(id: 'other-member', day: 9, month: 9));
    await tester.pump();
    expect(find.text('Anniversaire : 9 septembre'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    expect(next.hasListener, isFalse);
  });

  testWidgets('only consented public fragments are displayed, never a year',
      (tester) async {
    final states = StreamController<MemberProfile?>.broadcast(sync: true);
    addTearDown(() {
      if (!states.isClosed) return states.close();
    });
    await pump(tester, states.stream);
    states.add(profile(day: null, month: null));
    await tester.pump();
    expect(birthday, findsNothing);
    states.add(profile());
    await tester.pump();
    expect(find.text('Anniversaire : 7 juillet'), findsOneWidget);
    expect(find.textContaining('1991'), findsNothing);
    states.add(profile(shared: false));
    await tester.pump();
    expect(birthday, findsNothing);
    await tester.pumpWidget(const SizedBox());
  });
}
