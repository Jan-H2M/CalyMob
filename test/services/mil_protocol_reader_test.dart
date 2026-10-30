import 'dart:convert';
import 'package:calymob/services/mil_protocol_reader.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('preview snapshot never activates on production or native builds', () {
    bool allowed(String url, {bool enabled = true, bool web = true}) =>
        MilProtocolReader.previewSnapshotAllowed(
            enabled: enabled, web: web, origin: Uri.parse(url));
    expect(allowed('http://localhost:7359/'), isTrue);
    expect(allowed('https://caly.club/'), isFalse);
    expect(allowed('http://localhost:7359/', enabled: false), isFalse);
    expect(allowed('http://localhost:7359/', web: false), isFalse);
    expect(allowed('http://localhost.example.invalid/'), isFalse);
    expect(MilProtocolReader.usesPreviewSnapshot, isFalse);
  });
  test('published lookup is exact by code medium club and catalog version',
      () async {
    final db = FakeFirebaseFirestore();
    await db
        .doc('clubs/calypso/mil_protocol_catalog/current')
        .set({'catalog_hash': 'a'});
    for (final medium in ['mn', 'pool']) {
      await db
          .doc(
              'clubs/calypso/mil_protocol_catalog_versions/a/items/${medium}__P2.REA')
          .set({
        'key': '${medium}__P2.REA',
        'code': 'P2.REA',
        'medium': medium,
        'body': 'Test $medium'
      });
    }
    final reader = MilProtocolReader(firestore: db);
    expect((await reader.load('calypso', ' p2.rea ', pool: true))?.body,
        'Test pool');
    expect((await reader.loadCandidates('calypso', 'P2.REA')).map((p) => p.key),
        ['mn__P2.REA', 'pool__P2.REA']);
    expect(await reader.load('other', 'P2.REA', pool: true), isNull);
    expect(await reader.load('calypso', 'P3.PL', pool: false), isNull);
  });
  test('local public source snapshot retains 77 exact protocol records',
      () async {
    final data = jsonDecode(
        await rootBundle.loadString('assets/mil/preview_protocols.json'));
    final records = (data['records'] as List)
        .map((r) => MilProtocol.fromMap(Map<String, dynamic>.from(r)))
        .toList();
    expect(records.length, 77);
    expect(records.map((r) => r.key).toSet().length, 77);
    expect(records.where((r) => r.medium == 'mn').length, 46);
    expect(records.where((r) => r.medium == 'pool').length, 31);
    final rt = records.singleWhere((r) => r.key == 'mn__P3.RT');
    expect(rt.body, isNotEmpty);
    expect(rt.sourceUrl, startsWith('https://mil.amb-lifras.be/#'));
    expect(rt.sourceVersion, 'v2026-8');
    expect(records.any((r) => r.key == 'mn__P3.PL'), isFalse);
  });
}
