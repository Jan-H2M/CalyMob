import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:firebase_auth/firebase_auth.dart';
import '../models/calendar_feed.dart';

/// Service pour la gestion du calendrier iCal
class CalendarService {
  static const String _baseUrl = 'https://caly.club';

  final FirebaseAuth _auth = FirebaseAuth.instance;

  /// Récupère le token d'authentification Firebase
  Future<String?> _getAuthToken() async {
    final user = _auth.currentUser;
    if (user == null) {
      debugPrint('❌ [CalendarService] Utilisateur non connecté');
      return null;
    }
    return await user.getIdToken();
  }

  /// Récupère l'URL du calendrier pour l'utilisateur connecté
  /// Crée un token si aucun n'existe
  Future<CalendarFeed> getMyFeedUrl() async {
    debugPrint('📅 [CalendarService] Récupération URL calendrier...');

    final token = await _getAuthToken();
    if (token == null) {
      throw Exception('Utilisateur non connecté');
    }

    final response = await http.get(
      Uri.parse('$_baseUrl/api/calendar/my-feed-url'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final feed = CalendarFeed.fromJson(data);
      debugPrint('✅ [CalendarService] URL récupérée: ${feed.feedUrl}');
      return feed;
    } else {
      debugPrint('❌ [CalendarService] Erreur ${response.statusCode}: ${response.body}');
      throw Exception('Erreur lors de la récupération de l\'URL du calendrier: ${response.statusCode}');
    }
  }

  /// Régénère le token du calendrier (invalide l'ancien lien)
  Future<CalendarFeed> regenerateToken() async {
    debugPrint('🔄 [CalendarService] Régénération du token calendrier...');

    final token = await _getAuthToken();
    if (token == null) {
      throw Exception('Utilisateur non connecté');
    }

    final response = await http.post(
      Uri.parse('$_baseUrl/api/calendar/regenerate-token'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final feed = CalendarFeed.fromJson(data);
      debugPrint('✅ [CalendarService] Nouveau token généré: ${feed.token.substring(0, 8)}...');
      return feed;
    } else {
      debugPrint('❌ [CalendarService] Erreur ${response.statusCode}: ${response.body}');
      throw Exception('Erreur lors de la régénération du token: ${response.statusCode}');
    }
  }
}
