import 'dart:async';

import 'package:calymob/models/team_channel.dart';
import 'package:calymob/providers/auth_provider.dart';
import 'package:calymob/providers/unread_count_provider.dart';
import 'package:calymob/screens/teams/team_chat_screen.dart';
import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';

class _MockUser extends Mock implements User {
  @override
  String get uid => 'member-1';
}

class _MockAuthProvider extends Mock implements AuthProvider {
  final User user = _MockUser();

  @override
  User? get currentUser => user;

  @override
  void addListener(VoidCallback listener) {}

  @override
  void removeListener(VoidCallback listener) {}
}

class _MockUnreadCountProvider extends Mock implements UnreadCountProvider {
  @override
  bool hasResolvedAuthorityFor(String clubId, String userId) => false;

  @override
  bool get usesCursorReadState => false;

  @override
  void addListener(VoidCallback listener) {}

  @override
  void removeListener(VoidCallback listener) {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
  });

  testWidgets('keeps one message stream across ordinary provider rebuilds', (
    tester,
  ) async {
    final rebuild = ValueNotifier<int>(0);
    final channel = TeamChannel.defaultForType(TeamChannelType.bureau);
    var streamCreations = 0;

    Stream<List<TeamMessage>> streamFactory(String clubId, String channelId) {
      streamCreations++;
      return const Stream<List<TeamMessage>>.empty();
    }

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthProvider>.value(
            value: _MockAuthProvider(),
          ),
          ChangeNotifierProvider<UnreadCountProvider>.value(
            value: _MockUnreadCountProvider(),
          ),
        ],
        child: MaterialApp(
          home: ValueListenableBuilder<int>(
            valueListenable: rebuild,
            builder: (context, value, child) => TeamChatScreen(
              channel: channel,
              messageStreamFactory: streamFactory,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(streamCreations, 1);

    rebuild.value++;
    await tester.pump();

    expect(streamCreations, 1);

    await tester.pumpWidget(const SizedBox.shrink());
    rebuild.dispose();
  });
}
