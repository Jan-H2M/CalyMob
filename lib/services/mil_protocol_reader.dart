import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// A published MIL protocol is identified by environment + MIL exercise code.
/// Firestore exercise document IDs are deliberately not used here.
class MilProtocol {
  final String key;
  final String? code;
  final String medium;
  final String sectionId;
  final String title;
  final String body;
  final String sourceUrl;
  final String? sourceVersion;
  final List<String> referenceUrls;

  const MilProtocol({
    required this.key,
    required this.code,
    required this.medium,
    required this.sectionId,
    required this.title,
    required this.body,
    required this.sourceUrl,
    required this.sourceVersion,
    required this.referenceUrls,
  });

  factory MilProtocol.fromMap(Map<String, dynamic> data) => MilProtocol(
        key: data['key']?.toString() ?? '',
        code: data['code']?.toString(),
        medium: data['medium']?.toString() ?? '',
        sectionId: data['section_id']?.toString() ?? '',
        title: data['title']?.toString() ?? '',
        body: data['body']?.toString() ?? '',
        sourceUrl: data['source_url']?.toString() ?? '',
        sourceVersion: data['source_version']?.toString(),
        referenceUrls: (data['references'] as List<dynamic>? ?? const [])
            .whereType<Map>()
            .map((ref) => ref['url']?.toString() ?? '')
            .where((url) => url.isNotEmpty)
            .toList(growable: false),
      );
}

class MilProtocolReader {
  final FirebaseFirestore? _injectedFirestore;
  FirebaseFirestore get _firestore =>
      _injectedFirestore ?? FirebaseFirestore.instance;

  MilProtocolReader({FirebaseFirestore? firestore})
      : _injectedFirestore = firestore;

  // Only the explicitly enabled localhost web preview reads this public MIL
  // snapshot. Normal builds always use the server's published catalogue.
  @visibleForTesting
  static bool previewSnapshotAllowed(
          {required bool enabled, required bool web, required Uri origin}) =>
      enabled &&
      web &&
      origin.scheme == 'http' &&
      const {'localhost', '127.0.0.1', '::1'}.contains(origin.host);

  static bool get usesPreviewSnapshot => previewSnapshotAllowed(
      enabled: const bool.fromEnvironment('CALYMOB_MIL_PREVIEW_SNAPSHOT'),
      web: kIsWeb,
      origin: Uri.base);

  static Future<List<MilProtocol>>? _previewCatalog;
  static Future<List<MilProtocol>> _loadPreviewCatalog() =>
      _previewCatalog ??= rootBundle
          .loadString('assets/mil/preview_protocols.json')
          .then((text) => (jsonDecode(text)['records'] as List)
              .map((record) =>
                  MilProtocol.fromMap(Map<String, dynamic>.from(record as Map)))
              .toList(growable: false));

  static String keyFor(String code, {required bool pool}) =>
      '${pool ? 'pool' : 'mn'}__${code.trim().toUpperCase()}';

  Future<MilProtocol?> load(
    String clubId,
    String code, {
    required bool pool,
  }) =>
      loadByKey(clubId, keyFor(code, pool: pool));

  Future<String?> _activeHash(String clubId) async {
    final pointer = await _firestore
        .doc('clubs/$clubId/mil_protocol_catalog/current')
        .get();
    return pointer.data()?['catalog_hash']?.toString();
  }

  Future<MilProtocol?> loadByKey(String clubId, String key) async {
    if (usesPreviewSnapshot) {
      final matches = (await _loadPreviewCatalog()).where((p) => p.key == key);
      return matches.isEmpty ? null : matches.single;
    }
    final hash = await _activeHash(clubId);
    if (hash == null || hash.isEmpty) return null;
    return _loadFromHash(clubId, hash, key);
  }

  Future<MilProtocol?> _loadFromHash(
      String clubId, String hash, String key) async {
    final item = await _firestore
        .doc('clubs/$clubId/mil_protocol_catalog_versions/$hash/items/$key')
        .get();
    if (!item.exists || item.data() == null) return null;
    final protocol = MilProtocol.fromMap(item.data()!);
    return protocol.key == key && protocol.body.isNotEmpty ? protocol : null;
  }

  Future<List<MilProtocol>> loadCandidates(String clubId, String code) async {
    if (usesPreviewSnapshot) {
      final keys = {keyFor(code, pool: false), keyFor(code, pool: true)};
      return (await _loadPreviewCatalog())
          .where((p) => keys.contains(p.key))
          .toList(growable: false);
    }
    final hash = await _activeHash(clubId);
    if (hash == null || hash.isEmpty) return const [];
    final candidates = await Future.wait([
      _loadFromHash(clubId, hash, keyFor(code, pool: false)),
      _loadFromHash(clubId, hash, keyFor(code, pool: true)),
    ]);
    return candidates.whereType<MilProtocol>().toList(growable: false);
  }

  Future<List<MilProtocol>> list(String clubId, {required bool pool}) async {
    if (usesPreviewSnapshot) {
      return (await _loadPreviewCatalog())
          .where((p) => p.medium == (pool ? 'pool' : 'mn'))
          .toList(growable: false);
    }
    final hash = await _activeHash(clubId);
    if (hash == null || hash.isEmpty) return const [];
    final medium = pool ? 'pool' : 'mn';
    final snapshot = await _firestore
        .collection('clubs/$clubId/mil_protocol_catalog_versions/$hash/items')
        .where('medium', isEqualTo: medium)
        .get();
    final records = snapshot.docs
        .map((doc) => MilProtocol.fromMap(doc.data()))
        .where((protocol) => protocol.key.isNotEmpty)
        .toList();
    records.sort(
        (a, b) => (a.code ?? a.sectionId).compareTo(b.code ?? b.sectionId));
    return records;
  }
}
