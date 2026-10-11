import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/utils/live_qa_session_resume.dart';

void main() {
  test(
      'autostart is off in normal builds and only explicit loopback preview can opt in',
      () {
    expect(liveQaAutostart, false);
    for (final origin in [
      'https://caly.club/',
      'http://localhost:7357/',
      'http://127.0.0.1:7359/',
      'http://localhost.evil.invalid:7359/'
    ]) {
      expect(
          isLiveQaPreviewOrigin(
              enabled: true, isWeb: true, uri: Uri.parse(origin)),
          false);
    }
    final local = Uri.parse('http://localhost:7359/');
    expect(isLiveQaPreviewOrigin(enabled: true, isWeb: true, uri: local), true);
    expect(
        isLiveQaPreviewOrigin(enabled: false, isWeb: true, uri: local), false);
    expect(
        isLiveQaPreviewOrigin(enabled: true, isWeb: false, uri: local), false);
  });
  test(
      'no UI role spoofing: genuine fixed identity and real hidden MC member required',
      () {
    final member = <String, dynamic>{
      'email': 'qa.roles@calypsodc.be',
      'qa_managed_by': 'QA-002',
      'is_test_account': true,
      'exclude_from_directory': true,
      'app_role': 'user',
      'app_status': 'active',
      'has_app_access': true,
      'plongeur_code': 'MC',
      'clubStatuten': ['Membre', 'Encadrant']
    };
    bool valid(Map<String, dynamic>? data, [String? uid = 'calymob-qa-jan']) =>
        canResumeLiveQaSession(authenticatedUid: uid, member: data);
    expect(valid(member), true);
    expect(valid(null), false);
    expect(valid(member, null), false);
    expect(valid(member, 'real-member'), false);
    for (final patch in <Map<String, dynamic>>[
      {'email': 'other'},
      {'qa_managed_by': null},
      {'is_test_account': false},
      {'exclude_from_directory': false},
      {'app_role': 'admin'},
      {'app_status': 'blocked'},
      {'has_app_access': false},
      {'plongeur_code': 'AM'},
      {
        'clubStatuten': ['Membre']
      },
      {'clubStatuten': null},
    ]) {
      expect(valid({...member, ...patch}), false, reason: patch.toString());
    }
  });
}
