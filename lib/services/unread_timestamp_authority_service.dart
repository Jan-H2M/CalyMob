import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../models/unread_cursor_feature_flag.dart';

/// Resolves the additive timestamp-v2 rollout. Cursor-v1 remains usable on its
/// established server-corrected legacy fields until both the flag and the
/// server-only completeness marker agree that every historical document has
/// `unread_*` authority.
class UnreadTimestampAuthorityService {
  UnreadTimestampAuthorityService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  Future<bool> shouldUseV2(String clubId, String memberId) async {
    try {
      final settings = _firestore.collection('clubs/$clubId/settings');
      final values = await Future.wait([
        settings.doc('feature_flags').get(),
        settings.doc('unread_timestamp_v2_migration').get(),
      ]);
      final flag = UnreadCursorFeatureFlag.fromFirestore(values[0].data());
      final marker = values[1].data();
      return flag.usesUnreadTimestampV2For(memberId) &&
          marker?['schema_version'] == 2 &&
          marker?['status'] == 'complete' &&
          marker?['missing_count'] == 0 &&
          marker?['writer_contract'] == 'required';
    } catch (error) {
      // Preserve the established cursor-v1 reader on config/marker failures;
      // callers still perform a full query and never substitute a zero.
      debugPrint('⚠️ unread timestamp v2 authority unresolved: $error');
      return false;
    }
  }
}
