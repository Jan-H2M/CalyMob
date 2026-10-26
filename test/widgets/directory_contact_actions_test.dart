import 'dart:async';
import 'package:calymob/models/member_profile.dart';
import 'package:calymob/widgets/profile/directory_contact_actions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxdart/rxdart.dart';

MemberProfile profile(
        {bool email = true,
        bool phone = true,
        String emailValue = ' qa@example.invalid ',
        String phoneValue = ' +3200000000 '}) =>
    MemberProfile(
        id: 'qa-member',
        nom: 'Fictif',
        prenom: 'QA',
        email: emailValue,
        phoneNumber: phoneValue,
        shareEmail: email,
        sharePhone: phone);

void main() {
  final buttons = find.byWidgetPredicate((widget) => widget is ElevatedButton);
  Future<void> drain(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));
  }

  testWidgets('only current consented values launch a contact action',
      (tester) async {
    final states = BehaviorSubject<MemberProfile?>.seeded(profile());
    addTearDown(states.close);
    final calls = <String>[];
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DirectoryContactActions(
                profiles: states.stream,
                onEmail: (v) => calls.add('email:$v'),
                onPhone: (v) => calls.add('phone:$v')))));
    await tester.pump();
    await tester.tap(find.byKey(const Key('directory-contact-email')));
    await tester.tap(find.byKey(const Key('directory-contact-phone')));
    expect(calls, ['email:qa@example.invalid', 'phone:+3200000000']);
    states.add(profile(email: false, phone: false));
    await drain(tester);
    expect(buttons, findsNothing);
    expect(find.text('Aucune coordonnée disponible dans l’annuaire.'),
        findsOneWidget);
    states.add(
        profile(emailValue: 'new@example.invalid', phoneValue: '+3200000001'));
    await drain(tester);
    expect(buttons, findsNWidgets(2));
    await tester.tap(find.byKey(const Key('directory-contact-email')));
    await tester.tap(find.byKey(const Key('directory-contact-phone')));
    expect(
        calls.sublist(2), ['email:new@example.invalid', 'phone:+3200000001']);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
      'pending directory and read errors never show cached or private contacts',
      (tester) async {
    final states = StreamController<MemberProfile?>();
    addTearDown(states.close);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DirectoryContactActions(
                profiles: states.stream,
                onEmail: (_) => fail('Unexpected action'),
                onPhone: (_) => fail('Unexpected action')))));
    expect(buttons, findsNothing);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    states.add(profile());
    await drain(tester);
    expect(buttons, findsNWidgets(2));
    states.addError(StateError('synthetic read error'));
    await drain(tester);
    expect(buttons, findsNothing);
    expect(
        find.text('Coordonnées momentanément indisponibles.'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
      'empty contacts, missing records and phone-only consent behave independently',
      (tester) async {
    final states = BehaviorSubject<MemberProfile?>.seeded(
        profile(emailValue: ' ', phoneValue: ' '));
    addTearDown(states.close);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DirectoryContactActions(
                profiles: states.stream,
                onEmail: (_) => fail('Unexpected email'),
                onPhone: (_) {}))));
    await drain(tester);
    expect(buttons, findsNothing);
    states.add(null);
    await drain(tester);
    expect(buttons, findsNothing);
    states.add(profile(email: false));
    await drain(tester);
    expect(find.byKey(const Key('directory-contact-email')), findsNothing);
    expect(find.byKey(const Key('directory-contact-phone')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('390px contact layout remains usable with large text',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final states = BehaviorSubject<MemberProfile?>.seeded(profile());
    addTearDown(states.close);
    await tester.pumpWidget(MaterialApp(
        home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(1.8)),
            child: Scaffold(
                body: SingleChildScrollView(
                    child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: DirectoryContactActions(
                            profiles: states.stream,
                            onEmail: (_) {},
                            onPhone: (_) {},
                            hasPreviousAction: true)))))));
    await drain(tester);
    expect(buttons, findsNWidgets(2));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a replacement directory stream never reuses old contact actions',
      (tester) async {
    final previous = BehaviorSubject<MemberProfile?>.seeded(profile());
    final next = StreamController<MemberProfile?>();
    addTearDown(previous.close);
    addTearDown(next.close);
    Widget view(Stream<MemberProfile?> stream) => MaterialApp(
        home: Scaffold(
            body: DirectoryContactActions(
                profiles: stream, onEmail: (_) {}, onPhone: (_) {})));
    await tester.pumpWidget(view(previous.stream));
    await drain(tester);
    expect(buttons, findsNWidgets(2));
    await tester.pumpWidget(view(next.stream));
    expect(buttons, findsNothing);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    next.add(null);
    await drain(tester);
    expect(buttons, findsNothing);
    await tester.pumpWidget(const SizedBox());
  });
}
