import 'dart:async';

import 'package:calymob/providers/member_provider.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('late member load cannot replace a newer authenticated identity',
      () async {
    final memberA = Completer<Map<String, dynamic>?>();
    final memberB = Completer<Map<String, dynamic>?>();
    final provider = MemberProvider(
      memberLoader: (clubId, userId) {
        if (userId == 'member-a') return memberA.future;
        if (userId == 'member-b') return memberB.future;
        throw StateError('unexpected identity');
      },
    );

    final oldA = provider.loadMemberData('club', 'member-a');
    final currentB = provider.loadMemberData('club', 'member-b');
    expect(provider.isLoaded, isFalse);

    memberB.complete({
      'prenom': 'Member',
      'nom': 'B',
      'clubStatuten': ['M'],
    });
    await currentB;
    expect(provider.isLoadedFor('club', 'member-b'), isTrue);
    expect(provider.isLoadedFor('club', 'member-a'), isFalse);
    expect(provider.displayName, contains('B'));

    memberA.complete({
      'prenom': 'Member',
      'nom': 'A stale',
      'clubStatuten': ['CA'],
    });
    await oldA;
    expect(provider.isLoadedFor('club', 'member-b'), isTrue);
    expect(provider.displayName, contains('B'));
    expect(provider.clubStatuten, ['M']);
  });

  test('clear invalidates an in-flight member load', () async {
    final pending = Completer<Map<String, dynamic>?>();
    final provider = MemberProvider(
      memberLoader: (_, __) => pending.future,
    );

    final load = provider.loadMemberData('club', 'member-a');
    provider.clear();
    pending.complete({'nom': 'Stale'});
    await load;

    expect(provider.isLoaded, isFalse);
    expect(provider.isLoading, isFalse);
    expect(provider.isLoadedFor('club', 'member-a'), isFalse);
  });
}
