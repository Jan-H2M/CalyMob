import '../models/member_profile.dart';
import 'formation_enrollment_service.dart';

/// Same server-owned command as CalyCompta and Apnée. Official results and
/// awards remain distinct from administrative current enrollment.
class ScubaEnrollmentService {
  final FormationEnrollmentService service;
  ScubaEnrollmentService({FormationEnrollmentService? enrollment})
      : service = enrollment ?? FormationEnrollmentService();
  Future<void> save(String clubId, MemberProfile expected,
          {required bool active, required String target}) =>
      service.save(clubId,
          memberId: expected.id,
          track: 'scuba',
          active: active,
          expectedRevision: expected.formationRevision,
          targetLevel: target);
}
