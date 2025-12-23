#!/usr/bin/env dart
/// Test script to send a push notification directly via FCM HTTP v1 API
///
/// Usage:
///   1. First, get a valid access token:
///      cd CalyMob/functions && npx google-auth-library-nodejs-tool --scopes https://www.googleapis.com/auth/firebase.messaging
///
///      Or use gcloud:
///      gcloud auth application-default print-access-token
///
///   2. Run this script:
///      dart run scripts/test_push_notification.dart <FCM_TOKEN> <ACCESS_TOKEN>
///
///   To find your FCM token:
///   - Check Firestore: clubs/{clubId}/members/{memberId} -> fcm_tokens array
///   - Or check the app logs when it starts (prints "FCM Token received: ...")

import 'dart:convert';
import 'dart:io';

const String projectId = 'calycompta';

Future<void> main(List<String> args) async {
  if (args.length < 2) {
    print('''
Usage: dart run scripts/test_push_notification.dart <FCM_TOKEN> <ACCESS_TOKEN>

To get an access token, run:
  gcloud auth application-default print-access-token

To find your FCM token:
  - Check Firestore: clubs/{clubId}/members/{memberId} -> fcm_tokens
  - Or check app logs on startup
''');
    exit(1);
  }

  final fcmToken = args[0];
  final accessToken = args[1];

  print('📱 Sending test notification to FCM...\n');

  // This payload mirrors exactly what onNewEventMessage.js sends
  final payload = {
    'message': {
      'token': fcmToken,
      'notification': {
        'title': 'Test User - Test Event',
        'body': 'Dit is een test notificatie vanuit het Dart script!',
      },
      'data': {
        'type': 'event_message',
        'club_id': 'test_club',
        'operation_id': 'test_operation',
        'message_id': 'test_message',
        'click_action': 'FLUTTER_NOTIFICATION_CLICK',
      },
      'android': {
        'priority': 'high',
        'notification': {
          'channel_id': 'event_messages',
          'priority': 'high',
          'sound': 'default',
        },
      },
      'apns': {
        'headers': {
          'apns-priority': '10',
          'apns-expiration': '0',
        },
        'payload': {
          'aps': {
            'alert': {
              'title': 'Test User - Test Event',
              'body': 'Dit is een test notificatie vanuit het Dart script!',
            },
            'sound': 'default',
            'badge': 1,
            'content-available': 1,
          },
        },
      },
    },
  };

  print('📤 Payload:');
  print(const JsonEncoder.withIndent('  ').convert(payload));
  print('');

  final url = Uri.parse(
    'https://fcm.googleapis.com/v1/projects/$projectId/messages:send',
  );

  final client = HttpClient();

  try {
    final request = await client.postUrl(url);
    request.headers.set('Authorization', 'Bearer $accessToken');
    request.headers.set('Content-Type', 'application/json');
    request.write(jsonEncode(payload));

    final response = await request.close();
    final responseBody = await response.transform(utf8.decoder).join();

    print('📬 Response status: ${response.statusCode}');
    print('📬 Response body:');

    try {
      final jsonResponse = jsonDecode(responseBody);
      print(const JsonEncoder.withIndent('  ').convert(jsonResponse));
    } catch (_) {
      print(responseBody);
    }

    if (response.statusCode == 200) {
      print('\n✅ Notificatie succesvol verzonden!');
      print('   Check je iOS/Android toestel voor de notificatie.');
    } else {
      print('\n❌ Fout bij verzenden notificatie');
      if (response.statusCode == 401) {
        print('   → Access token is verlopen of ongeldig.');
        print('   → Genereer een nieuwe met: gcloud auth application-default print-access-token');
      } else if (response.statusCode == 404) {
        print('   → FCM token is ongeldig of niet geregistreerd.');
        print('   → Controleer of de app gestart is en het token up-to-date is.');
      }
    }
  } catch (e) {
    print('❌ Error: $e');
  } finally {
    client.close();
  }
}
