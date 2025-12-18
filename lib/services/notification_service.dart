import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Service de gestion des notifications push
class NotificationService {
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();

  /// Initialiser les notifications
  Future<void> initialize() async {
    try {
      // Créer le canal de notification pour Android 8+
      if (Platform.isAndroid) {
        await _createNotificationChannel();
      }

      // Initialiser flutter_local_notifications pour afficher les notifications en foreground
      const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
      const iosSettings = DarwinInitializationSettings();
      const initSettings = InitializationSettings(android: androidSettings, iOS: iosSettings);
      await _localNotifications.initialize(initSettings);

      // Demander la permission (iOS uniquement, Android 13+ demande aussi)
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

  /// Créer les canaux de notification pour Android 8+ (API 26+)
  Future<void> _createNotificationChannel() async {
    try {
      final androidPlugin = _localNotifications
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();

      if (androidPlugin == null) return;

      // Canal pour les annonces du club
      const announcementsChannel = AndroidNotificationChannel(
        'announcements',
        'Annonces du club',
        description: 'Notifications pour les annonces importantes du club',
        importance: Importance.high,
        playSound: true,
        enableVibration: true,
      );
      await androidPlugin.createNotificationChannel(announcementsChannel);

      // Canal pour les messages d'événements
      const eventMessagesChannel = AndroidNotificationChannel(
        'event_messages',
        'Messages d\'événements',
        description: 'Notifications pour les nouveaux messages dans les événements',
        importance: Importance.high,
        playSound: true,
        enableVibration: true,
      );
      await androidPlugin.createNotificationChannel(eventMessagesChannel);

      debugPrint('✅ Canaux de notification Android créés');
    } catch (e) {
      debugPrint('❌ Erreur création canaux notification: $e');
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

  /// Sauvegarder le token FCM et les infos de l'appareil dans Firestore
  /// Supporte plusieurs appareils en utilisant un array de tokens
  Future<void> saveTokenToFirestore(String clubId, String userId) async {
    try {
      final token = await getToken();
      if (token == null) {
        debugPrint('⚠️  Aucun token FCM disponible');
        return;
      }

      // Récupérer les informations de l'appareil et de l'app
      final deviceInfo = await _getDeviceInfo();
      final appInfo = await _getAppInfo();

      final memberRef = _firestore.collection('clubs/$clubId/members').doc(userId);

      // Vérifier si c'est la première installation (app_first_installed n'existe pas)
      final doc = await memberRef.get();
      final isFirstInstall = doc.data()?['app_first_installed'] == null;

      // Préparer les données à mettre à jour
      final updateData = <String, dynamic>{
        // FCM tokens
        'fcm_tokens': FieldValue.arrayUnion([token]),
        'fcm_token': token, // Garder pour compatibilité
        'fcm_token_updated_at': FieldValue.serverTimestamp(),
        'notifications_enabled': true,
        // App installation tracking
        'app_installed': true,
        'app_platform': deviceInfo['platform'],
        'app_version': appInfo['version'],
        'app_build_number': appInfo['buildNumber'],
        'device_model': deviceInfo['model'],
        'device_os_version': deviceInfo['osVersion'],
        'app_last_opened': FieldValue.serverTimestamp(),
      };

      // Ajouter app_first_installed uniquement si c'est la première installation
      if (isFirstInstall) {
        updateData['app_first_installed'] = FieldValue.serverTimestamp();
      }

      await memberRef.update(updateData);

      debugPrint('✅ Token FCM et infos appareil sauvegardés dans Firestore');
      debugPrint('   Platform: ${deviceInfo['platform']}, Model: ${deviceInfo['model']}');
      debugPrint('   App version: ${appInfo['version']} (${appInfo['buildNumber']})');
    } catch (e) {
      debugPrint('❌ Erreur sauvegarde token FCM: $e');
    }
  }

  /// Récupérer les informations de l'appareil
  Future<Map<String, String>> _getDeviceInfo() async {
    final deviceInfoPlugin = DeviceInfoPlugin();
    String platform;
    String model;
    String osVersion;

    try {
      if (Platform.isIOS) {
        final iosInfo = await deviceInfoPlugin.iosInfo;
        platform = 'ios';
        model = iosInfo.utsname.machine; // Ex: "iPhone14,2"
        osVersion = 'iOS ${iosInfo.systemVersion}';
      } else if (Platform.isAndroid) {
        final androidInfo = await deviceInfoPlugin.androidInfo;
        platform = 'android';
        model = androidInfo.model; // Ex: "Pixel 7"
        osVersion = 'Android ${androidInfo.version.release}';
      } else {
        platform = 'unknown';
        model = 'unknown';
        osVersion = 'unknown';
      }
    } catch (e) {
      debugPrint('❌ Erreur récupération device info: $e');
      platform = Platform.isIOS ? 'ios' : (Platform.isAndroid ? 'android' : 'unknown');
      model = 'unknown';
      osVersion = 'unknown';
    }

    return {
      'platform': platform,
      'model': model,
      'osVersion': osVersion,
    };
  }

  /// Récupérer les informations de l'application
  Future<Map<String, String>> _getAppInfo() async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      return {
        'version': packageInfo.version, // Ex: "1.0.6"
        'buildNumber': packageInfo.buildNumber, // Ex: "22"
      };
    } catch (e) {
      debugPrint('❌ Erreur récupération app info: $e');
      return {
        'version': 'unknown',
        'buildNumber': 'unknown',
      };
    }
  }

  /// Supprimer le token FCM de Firestore
  Future<void> removeTokenFromFirestore(String clubId, String userId) async {
    try {
      final token = await getToken();

      final updates = <String, dynamic>{
        'fcm_token': FieldValue.delete(),
        'fcm_token_updated_at': FieldValue.delete(),
      };

      // Retirer ce token spécifique de l'array
      if (token != null) {
        updates['fcm_tokens'] = FieldValue.arrayRemove([token]);
      }

      await _firestore.collection('clubs/$clubId/members').doc(userId).update(updates);

      // Vérifier si c'était le dernier token
      final doc = await _firestore.collection('clubs/$clubId/members').doc(userId).get();
      final data = doc.data();
      final tokens = data?['fcm_tokens'] as List<dynamic>?;
      if (tokens == null || tokens.isEmpty) {
        await _firestore.collection('clubs/$clubId/members').doc(userId).update({
          'notifications_enabled': false,
        });
      }

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

  /// Effacer le badge de l'icône de l'app
  /// Note: flutter_app_badger was removed due to incompatibility with AGP 8.9+
  /// Badge clearing is now handled by the OS when app is opened
  Future<void> clearBadge() async {
    // Badge is automatically cleared by iOS/Android when app opens
    debugPrint('ℹ️ Badge clearing handled by OS');
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
