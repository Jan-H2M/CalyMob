import 'dart:async';

import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

typedef Doc = DocumentSnapshot<Map<String, dynamic>>;

class _Firestore extends Fake implements FirebaseFirestore {
  final streams = <String, StreamController<Doc>>{};
  @override
  CollectionReference<Map<String, dynamic>> collection(String path) =>
      _Collection(this, path);
}

class _Collection extends Fake
    implements CollectionReference<Map<String, dynamic>> {
  final _Firestore db;
  final String path;
  _Collection(this.db, this.path);
  @override
  DocumentReference<Map<String, dynamic>> doc([String? path]) =>
      _Document(db, '${this.path}/$path');
}

class _Document extends Fake
    implements DocumentReference<Map<String, dynamic>> {
  final _Firestore db;
  final String path;
  _Document(this.db, this.path);
  @override
  CollectionReference<Map<String, dynamic>> collection(String path) =>
      _Collection(db, '${this.path}/$path');
  @override
  Stream<Doc> snapshots(
          {bool includeMetadataChanges = false,
          ListenSource source = ListenSource.defaultSource}) =>
      db.streams[path]!.stream;
}

class _Operations extends BoutiqueOperationsService {
  final assignments = StreamController<bool>.broadcast();
  @override
  Stream<bool> watchHasAssignment(String clubId) => assignments.stream;
}

void main() {
  test('Boutique entry restores true after an error and same-UID token refresh',
      () async {
    final db = _Firestore();
    final flags = StreamController<Doc>.broadcast();
    final member = StreamController<Doc>.broadcast();
    db.streams['clubs/club/settings/feature_flags'] = flags;
    db.streams['clubs/club/members/owner'] = member;
    final fixtures = FakeFirebaseFirestore();
    final flagsRef = fixtures.doc('clubs/club/settings/feature_flags');
    final memberRef = fixtures.doc('clubs/club/members/owner');
    await flagsRef.set({'boutiqueEnabled': true, 'boutiqueAccess': 'tous'});
    await memberRef.set({'member_status': 'active'});
    final auth = StreamController<String?>();
    final events = <Object>[];
    final subscription =
        BoutiqueAccessService(firestore: db, authUserIds: () => auth.stream)
            .watchCanAccessBoutique(clubId: 'club', userId: 'owner')
            .listen(events.add, onError: events.add);
    Future<void> flush() => Future<void>.delayed(Duration.zero);
    auth.add('owner');
    await flush();
    flags.add(await flagsRef.get());
    member.add(await memberRef.get());
    await flush();
    expect(events, [true]);
    flags.addError(FirebaseException(
        plugin: 'cloud_firestore', code: 'permission-denied'));
    await flush();
    expect(events.last, isA<FirebaseException>());
    auth.add('owner');
    await flush();
    flags.add(await flagsRef.get());
    member.add(await memberRef.get());
    await flush();
    expect(events, [true, isA<FirebaseException>(), true]);
    await subscription.cancel();
    await auth.close();
    await flags.close();
    await member.close();
  });

  test(
      'permission loss cancels both documents and assignment permissions; auth retries',
      () async {
    final db = _Firestore();
    final flags = StreamController<Doc>.broadcast();
    final member = StreamController<Doc>.broadcast();
    db.streams['clubs/club/settings/feature_flags'] = flags;
    db.streams['clubs/club/members/owner'] = member;
    final fixtures = FakeFirebaseFirestore();
    final flagsRef = fixtures.doc('clubs/club/settings/feature_flags');
    final memberRef = fixtures.doc('clubs/club/members/owner');
    await flagsRef.set({'boutiqueQrEnabled': true, 'boutiqueEnabled': true});
    await memberRef.set({'member_status': 'active'});
    final operations = _Operations();
    final auth = StreamController<String?>();
    final service = BoutiqueAccessService(
        firestore: db, operations: operations, authUserIds: () => auth.stream);
    final states = <BoutiqueAccessState>[];
    final errors = <Object>[];
    final subscription = service
        .watchBoutiqueAccess(clubId: 'club', userId: 'owner')
        .listen(states.add, onError: errors.add);
    Future<void> flush() => Future<void>.delayed(Duration.zero);
    auth.add(null);
    await flush();
    expect(flags.hasListener, isFalse);
    auth.add('owner');
    await flush();
    flags.add(await flagsRef.get());
    member.add(await memberRef.get());
    await flush();
    operations.assignments.add(true);
    await flush();
    expect(states.last.canOpenEntry, isTrue);
    final before = states.length;
    flags.addError(FirebaseException(
        plugin: 'cloud_firestore', code: 'permission-denied'));
    await flush();
    expect((errors.last as FirebaseException).code, 'permission-denied');
    expect(operations.assignments.hasListener, isFalse);
    expect(flags.hasListener, isFalse);
    expect(member.hasListener, isFalse);
    operations.assignments.add(true);
    await flush();
    expect(states, hasLength(before));

    auth.add('owner');
    await flush();
    expect(flags.hasListener, isTrue);
    flags.add(await flagsRef.get());
    member.add(await memberRef.get());
    await flush();
    expect(operations.assignments.hasListener, isTrue);
    auth.add('other');
    await flush();
    expect(flags.hasListener, isFalse);
    expect(member.hasListener, isFalse);
    expect(operations.assignments.hasListener, isFalse);
    await subscription.cancel();
    expect(auth.hasListener, isFalse);
    await auth.close();
    await flags.close();
    await member.close();
    await operations.assignments.close();
  });
}
