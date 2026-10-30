import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

/// Asks the backend to confirm a pending email correction after Firebase has
/// established a session. The backend checks the signed token's auth_time,
/// current Auth email and member record before writing one audit event.
class MemberEmailLoginAuditService {
  static final Uri _endpoint = Uri.parse(
    'https://caly.club/api/confirm-member-email-login',
  );

  Future<void> confirm({required User user, required String clubId}) async {
    final token = await user.getIdToken();
    if (token == null) return;

    final response = await http
        .post(
          _endpoint,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
          },
          body: jsonEncode({'clubId': clubId}),
        )
        .timeout(const Duration(seconds: 5));
    if (response.statusCode != 200) {
      throw StateError('Email login audit unavailable: ${response.statusCode}');
    }
  }
}
