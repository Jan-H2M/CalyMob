import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Service de gestion des notifications push
class NotificationService {
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Initialiser les notifications
  Future<void> initialize() async {
    try {
      // Demander la permission (iOS uniquement, Android l'accorde automatiquement)
      final settings = await _messaging.requestPermission(
        alert: true,
        announcement: false,
        badge: true,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
        sound: true,
      );

      debugPrint('✅ Permission notifications: ${settings.authorizationStatus}');

      if (settings.authorizationStatus == AuthorizationStatus.authorized) {
        // Obtenir le token FCM
        final token = await _messaging.getToken();
        if (token != null) {
          debugPrint('✅ FCM Token: $token');
          return;
        }
      }

      debugPrint('⚠️  Notifications non autorisées');
    } catch (e) {
      debugPrint('❌ Erreur initialisation notifications: $e');
    }
  }

  /// Obtenir le token FCM actuel
  Future<String?> getToken() async {
    try {
      return await _messaging.getToken();
    } catch (e) {
      debugPrint('❌ Erreur récupération token FCM: $e');
      return null;
    }
  }

  /// Sauvegarder le token FCM dans Firestore
  Future<void> saveTokenToFirestore(String clubId, String userId) async {
    try {
      final token = await getToken();
      if (token == null) {
        debugPrint('⚠️  Aucun token FCM disponible');
        return;
      }

      await _firestore.collection('clubs/$clubId/members').doc(userId).update({
        'fcm_token': token,
        'fcm_token_updated_at': FieldValue.serverTimestamp(),
        'notifications_enabled': true,
      });

      debugPrint('✅ Token FCM sauvegardé dans Firestore');
    } catch (e) {
      debugPrint('❌ Erreur sauvegarde token FCM: $e');
    }
  }

  /// Supprimer le token FCM de Firestore
  Future<void> removeTokenFromFirestore(String clubId, String userId) async {
    try {
      await _firestore.collection('clubs/$clubId/members').doc(userId).update({
        'fcm_token': FieldValue.delete(),
        'fcm_token_updated_at': FieldValue.delete(),
        'notifications_enabled': false,
      });

      debugPrint('✅ Token FCM supprimé de Firestore');
    } catch (e) {
      debugPrint('❌ Erreur suppression token FCM: $e');
    }
  }

  /// Configurer les handlers de messages
  void setupMessageHandlers({
    required Function(RemoteMessage) onMessageReceived,
    required Function(RemoteMessage) onMessageOpened,
  }) {
    // Message reçu quand l'app est au premier plan
    FirebaseMessaging.onMessage.listen(onMessageReceived);

    // Message ouvert quand l'app est en arrière-plan
    FirebaseMessaging.onMessageOpenedApp.listen(onMessageOpened);

    // Vérifier si l'app a été lancée depuis une notification
    FirebaseMessaging.instance.getInitialMessage().then((message) {
      if (message != null) {
        onMessageOpened(message);
      }
    });
  }

  /// Souscrire à un topic
  Future<void> subscribeToTopic(String topic) async {
    try {
      await _messaging.subscribeToTopic(topic);
      debugPrint('✅ Souscrit au topic: $topic');
    } catch (e) {
      debugPrint('❌ Erreur souscription topic: $e');
    }
  }

  /// Se désabonner d'un topic
  Future<void> unsubscribeFromTopic(String topic) async {
    try {
      await _messaging.unsubscribeFromTopic(topic);
      debugPrint('✅ Désabonné du topic: $topic');
    } catch (e) {
      debugPrint('❌ Erreur désabonnement topic: $e');
    }
  }

  /// Vérifier si les notifications sont autorisées
  Future<bool> areNotificationsEnabled() async {
    try {
      final settings = await _messaging.getNotificationSettings();
      return settings.authorizationStatus == AuthorizationStatus.authorized;
    } catch (e) {
      debugPrint('❌ Erreur vérification permissions: $e');
      return false;
    }
  }

  /// Demander la permission pour les notifications
  Future<bool> requestPermission() async {
    try {
      final settings = await _messaging.requestPermission(
        alert: true,
        announcement: false,
        badge: true,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
        sound: true,
      );

      return settings.authorizationStatus == AuthorizationStatus.authorized;
    } catch (e) {
      debugPrint('❌ Erreur demande permission: $e');
      return false;
    }
  }
}

/// Handler pour les messages en arrière-plan (doit être une fonction top-level)
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  debugPrint('📬 Message en arrière-plan: ${message.messageId}');
  debugPrint('Titre: ${message.notification?.title}');
  debugPrint('Corps: ${message.notification?.body}');
  debugPrint('Data: ${message.data}');
}
