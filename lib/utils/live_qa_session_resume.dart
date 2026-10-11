/// Local QA-002 startup only. Never enabled in ordinary app/store builds.
const liveQaAutostart = bool.fromEnvironment('CALYMOB_LIVE_QA_AUTOSTART');

bool isLiveQaPreviewOrigin(
        {required bool enabled, required bool isWeb, required Uri uri}) =>
    enabled &&
    isWeb &&
    uri.scheme == 'http' &&
    uri.host == 'localhost' &&
    uri.port == 7359;

/// UI continuation of genuine Firebase authentication, not a role override.
bool canResumeLiveQaSession({
  required String? authenticatedUid,
  required Map<String, dynamic>? member,
}) =>
    authenticatedUid == 'calymob-qa-jan' &&
    member != null &&
    member['email'] == 'qa.roles@calypsodc.be' &&
    member['qa_managed_by'] == 'QA-002' &&
    member['is_test_account'] == true &&
    member['exclude_from_directory'] == true &&
    member['app_role'] == 'user' &&
    member['app_status'] == 'active' &&
    member['has_app_access'] == true &&
    member['plongeur_code'] == 'MC' &&
    member['clubStatuten'] is List &&
    (member['clubStatuten'] as List).contains('Encadrant');
