import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/services/activity_service.dart';

void main() {
  const clubId = 'club-test';
  const userId = 'maker-uid';

  Future<void> addOperation(
    FakeFirebaseFirestore firestore,
    String id, {
    required String statut,
    String? creatorUserId,
    String? organiserId,
  }) {
    return firestore.doc('clubs/$clubId/operations/$id').set({
      'type': 'evenement',
      'event_category': 'plongee',
      'titre': id,
      'statut': statut,
      'date_debut': DateTime(2026, 8, 20),
      if (creatorUserId != null) 'creator_user_id': creatorUserId,
      if (organiserId != null) 'organisateur_id': organiserId,
    });
  }

  test('returns only drafts owned through creator_user_id', () async {
    final firestore = FakeFirebaseFirestore();
    await addOperation(firestore, 'own-draft',
        statut: 'brouillon', creatorUserId: userId);
    await addOperation(firestore, 'other-draft',
        statut: 'brouillon', creatorUserId: 'other-uid');
    await addOperation(firestore, 'open', statut: 'ouvert');

    final items = await ActivityService(firestore: firestore)
        .getAllActivitiesStream(clubId, currentUserId: userId)
        .first;

    expect(items.map((item) => item.id), containsAll(['own-draft', 'open']));
    expect(items.map((item) => item.id), isNot(contains('other-draft')));
  });

  test('uses organiser fallback only when creator_user_id is absent', () async {
    final firestore = FakeFirebaseFirestore();
    await addOperation(firestore, 'legacy-own',
        statut: 'brouillon', organiserId: userId);
    await addOperation(firestore, 'reassigned',
        statut: 'brouillon', creatorUserId: 'other-uid', organiserId: userId);

    final items = await ActivityService(firestore: firestore)
        .getAllActivitiesStream(clubId, currentUserId: userId)
        .first;

    expect(items.map((item) => item.id), contains('legacy-own'));
    expect(items.map((item) => item.id), isNot(contains('reassigned')));
  });

  test('draft has the distinct Brouillon status mapping', () async {
    final firestore = FakeFirebaseFirestore();
    await addOperation(firestore, 'own-draft',
        statut: 'brouillon', creatorUserId: userId);

    final item = (await ActivityService(firestore: firestore)
            .getAllActivitiesStream(clubId, currentUserId: userId)
            .first)
        .single;

    expect(item.isDraft, isTrue);
    expect(item.statusLabel, 'Brouillon');
  });
}
