import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../utils/permission_helper.dart';
import '../utils/member_directory_visibility.dart';
import '../models/member_profile.dart';
import '../widgets/formation/formation_navigation.dart';

/// Same administrative fields as CalyCompta. Never grants a brevet, records an
/// exam, scans attendance or rewrites an exercise result.
class ScubaEnrollmentService {
  final FirebaseFirestore db;
  final String? Function() currentUid;
  ScubaEnrollmentService(
      {FirebaseFirestore? firestore, String? Function()? uid})
      : db = firestore ?? FirebaseFirestore.instance,
        currentUid = uid ?? (() => FirebaseAuth.instance.currentUser?.uid);

  Future<void> save(String clubId, MemberProfile expected,
      {required bool active, required String target}) async {
    final uid = currentUid();
    if (uid == null || !scubaFormationLevels.containsKey(target))
      throw StateError('Authentification et brevet requis.');
    final club = db.collection('clubs').doc(clubId);
    final ref = club.collection('members').doc(expected.id);
    final audit = club.collection('audit_logs').doc();
    await db.runTransaction((tx) async {
      final actor = await tx.get(club.collection('members').doc(uid));
      final member = await tx.get(ref);
      final directory =
          await tx.get(club.collection('member_directory').doc(expected.id));
      final before = member.data();
      if (!PermissionHelper.isAppAdmin(actor.data()?['app_role']) ||
          !actor.exists ||
          !MemberProfile.fromDirectoryData(uid, actor.data()!).isActive ||
          !member.exists ||
          !directory.exists ||
          excludedFromMemberDirectory(directory.data()!) ||
          !MemberProfile.fromDirectoryData(expected.id, directory.data()!)
              .isActive)
        throw StateError('Administrateur et membre actif requis.');
      if ((before?['formation_active'] == true) != expected.formationActive ||
          before?['target_formation_level'] != expected.targetFormationLevel)
        throw StateError('Formation modifiée. Rechargez avant de réessayer.');
      final after = {
        'formation_active': active,
        'target_formation_level': target
      };
      tx.update(ref, {...after, 'updated_at': FieldValue.serverTimestamp()});
      tx.set(audit, {
        'action': 'formation_enrollment',
        'entity_type': 'member',
        'entity_id': expected.id,
        'actor_uid': uid,
        'before': {
          'formation_active': before?['formation_active'],
          'target_formation_level': before?['target_formation_level']
        },
        'after': after,
        'source': 'calymob',
        'created_at': FieldValue.serverTimestamp()
      });
    });
  }
}
