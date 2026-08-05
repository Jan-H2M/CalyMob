import 'package:calymob/models/student_logbook_entry.dart';
import 'package:calymob/services/student_logbook_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late FakeFirebaseFirestore firestore;
  late StudentLogbookService service;

  setUp(() {
    firestore = FakeFirebaseFirestore();
    service = StudentLogbookService(firestore: firestore);
  });

  StudentLogbookEntry entry({String? country}) => StudentLogbookEntry(
        id: '',
        memberId: 'member-1',
        source: 'manual',
        date: DateTime(2026, 8, 3),
        locationName: 'Marsa Alam',
        country: country,
      );

  test('create and edit keep the country snapshot', () async {
    final id =
        await service.create(clubId: 'calypso', entry: entry(country: 'eg'));
    var snap = await firestore
        .collection('clubs/calypso/student_logbook_entries')
        .doc(id)
        .get();
    expect(snap.data()?['country'], 'EG');

    await service.update(
      clubId: 'calypso',
      entryId: id,
      entry: entry(country: 'FR'),
    );
    snap = await firestore
        .collection('clubs/calypso/student_logbook_entries')
        .doc(id)
        .get();
    expect(snap.data()?['country'], 'FR');
  });

  test('edit can explicitly clear country and old records still stream',
      () async {
    final collection =
        firestore.collection('clubs/calypso/student_logbook_entries');
    final old = await collection.add({
      'member_id': 'member-1',
      'source': 'manual',
      'date': Timestamp.fromDate(DateTime(2020, 1, 2)),
      'location_name': 'Ancienne plongée',
    });
    final id =
        await service.create(clubId: 'calypso', entry: entry(country: 'PT'));

    await service.update(
      clubId: 'calypso',
      entryId: id,
      entry: entry(),
      extras: {'country': FieldValue.delete()},
    );

    expect((await collection.doc(id).get()).data()?.containsKey('country'),
        isFalse);
    final rows = await service.streamUserEntries('calypso', 'member-1').first;
    expect(
        rows.any((row) => row['id'] == old.id && !row.containsKey('country')),
        isTrue);
  });
}
