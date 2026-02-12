import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:app_badge_plus/app_badge_plus.dart';

// Import dart:io only on non-web platforms
import 'notification_service_io.dart' if (dart.library.html) 'notification_service_web.dart' as platform_helper;

/// Service de gestion des notifications push
class NotificationService {
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();

  /// Initialiser les notifications
  Future<void> initialize() async {
    // Skip initialization on web - not supported
    if (kIsWeb) {
      debugPrint('⚠️ Notifications non supportées sur web');
      return;
    }

    try {
      // Créer le canal de notification pour Android 8+
      if (!kIsWeb && platform_helper.isAndroid) {
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

  /// Configurer les handlers pour les messages foreground
  /// Doit être appelé après initialize()
  void setupForegroundNotifications() {
    // Écouter les messages quand l'app est au premier plan
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    debugPrint('✅ Foreground notification handler configuré');
  }

  /// Afficher une notification quand l'app est au premier plan
  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    debugPrint('📬 Message reçu en foreground: ${message.messageId}');
    debugPrint('   Titre: ${message.notification?.title}');
    debugPrint('   Corps: ${message.notification?.body}');

    final notification = message.notification;
    if (notification == null) return;

    // Déterminer le canal en fonction du type de notification
    final type = message.data['type'];
    String channelId;
    String channelName;
    if (type == 'event_message') {
      channelId = 'event_messages';
      channelName = 'Messages d\'événements';
    } else if (type == 'medical_certificate') {
      channelId = 'medical_certificates';
      channelName = 'Certificats médicaux';
    } else if (type == 'team_message') {
      channelId = 'team_messages';
      channelName = 'Messages d\'équipe';
    } else if (type == 'session_message') {
      channelId = 'piscine_messages';
      channelName = 'Messages de piscine';
    } else {
      channelId = 'announcements';
      channelName = 'Annonces du club';
    }

    // Afficher la notification localement
    await _localNotifications.show(
      notification.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          channelId,
          channelName,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: message.data['operation_id'],
    );
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

      // Canal pour les certificats médicaux
      const medicalCertificatesChannel = AndroidNotificationChannel(
        'medical_certificates',
        'Certificats médicaux',
        description: 'Notifications pour les mises à jour de certificats médicaux',
        importance: Importance.high,
        playSound: true,
        enableVibration: true,
      );
      await androidPlugin.createNotificationChannel(medicalCertificatesChannel);

      // Canal pour les messages d'équipe (team channels)
      const teamMessagesChannel = AndroidNotificationChannel(
        'team_messages',
        'Messages d\'équipe',
        description: 'Notifications pour les nouveaux messages dans les canaux d\'équipe',
        importance: Importance.high,
        playSound: true,
        enableVibration: true,
      );
      await androidPlugin.createNotificationChannel(teamMessagesChannel);

      // Canal pour les messages de piscine (sessions)
      const piscineMessagesChannel = AndroidNotificationChannel(
        'piscine_messages',
        'Messages de piscine',
        description: 'Notifications pour les nouveaux messages dans les sessions de piscine',
        importance: Importance.high,
        playSound: true,
        enableVibration: true,
      );
      await androidPlugin.createNotificationChannel(piscineMessagesChannel);

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
        // Nieuwe debug velden
        'device_brand': deviceInfo['brand'],
        'device_is_physical': deviceInfo['isPhysicalDevice'],
        'device_locale': deviceInfo['locale'],
        'device_timezone': deviceInfo['timezone'],
        'device_screen_width': deviceInfo['screenWidth'],
        'device_screen_height': deviceInfo['screenHeight'],
        'device_pixel_ratio': deviceInfo['pixelRatio'],
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
  Future<Map<String, dynamic>> _getDeviceInfo() async {
    final deviceInfoPlugin = DeviceInfoPlugin();
    String platform;
    String model;
    String osVersion;
    String brand = 'unknown';
    bool isPhysicalDevice = true;

    try {
      if (platform_helper.isIOS) {
        final iosInfo = await deviceInfoPlugin.iosInfo;
        platform = 'ios';
        model = iosInfo.utsname.machine; // Ex: "iPhone14,2"
        osVersion = 'iOS ${iosInfo.systemVersion}';
        brand = 'Apple';
        isPhysicalDevice = iosInfo.isPhysicalDevice;
      } else if (platform_helper.isAndroid) {
        final androidInfo = await deviceInfoPlugin.androidInfo;
        platform = 'android';
        model = androidInfo.model; // Ex: "Pixel 7"
        osVersion = 'Android ${androidInfo.version.release}';
        brand = androidInfo.brand; // Ex: "Samsung", "Google"
        isPhysicalDevice = androidInfo.isPhysicalDevice;
      } else {
        platform = 'unknown';
        model = 'unknown';
        osVersion = 'unknown';
      }
    } catch (e) {
      debugPrint('❌ Erreur récupération device info: $e');
      platform = platform_helper.isIOS ? 'ios' : (platform_helper.isAndroid ? 'android' : 'unknown');
      model = 'unknown';
      osVersion = 'unknown';
    }

    // Récupérer locale et timezone (disponibles sans packages supplémentaires)
    final locale = platform_helper.getCurrentLocale();
    final timezone = DateTime.now().timeZoneName;

    // Récupérer taille d'écran via WidgetsBinding
    int screenWidth = 0;
    int screenHeight = 0;
    double pixelRatio = 1.0;
    try {
      final binding = WidgetsBinding.instance;
      final window = binding.platformDispatcher.views.first;
      pixelRatio = window.devicePixelRatio;
      screenWidth = (window.physicalSize.width / pixelRatio).round();
      screenHeight = (window.physicalSize.height / pixelRatio).round();
    } catch (e) {
      debugPrint('⚠️ Impossible de récupérer taille écran: $e');
    }

    return {
      'platform': platform,
      'model': model,
      'osVersion': osVersion,
      'brand': brand,
      'isPhysicalDevice': isPhysicalDevice,
      'locale': locale,
      'timezone': timezone,
      'screenWidth': screenWidth,
      'screenHeight': screenHeight,
      'pixelRatio': pixelRatio,
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
  /// IMPORTANT: ne PAS appeler avant runApp() — la platform channel n'est pas prête
  Future<void> clearBadge() async {
    try {
      final supported = await AppBadgePlus.isSupported();
      if (supported) {
        await AppBadgePlus.updateBadge(0);
        debugPrint('✅ Badge effacé');
      }
    } catch (e) {
      debugPrint('⚠️ Badge clear failed (non-fatal): $e');
    }
  }

  /// Mettre à jour le badge avec un nombre spécifique
  Future<void> setBadge(int count) async {
    try {
      final supported = await AppBadgePlus.isSupported();
      if (supported) {
        await AppBadgePlus.updateBadge(count);
        debugPrint('✅ Badge mis à jour: $count');
      }
    } catch (e) {
      debugPrint('⚠️ Badge update failed (non-fatal): $e');
    }
  }

  /// Mettre à jour le badge depuis le compteur Firestore unread_counts
  Future<void> updateBadgeFromFirestore(String clubId, String userId) async {
    try {
      final doc = await _firestore
          .collection('clubs/$clubId/members')
          .doc(userId)
          .get();
      final data = doc.data();
      if (data == null) return;

      final unreadCounts = data['unread_counts'] as Map<String, dynamic>? ?? {};
      int total = 0;
      for (final value in unreadCounts.values) {
        if (value is int) total += value;
      }

      await setBadge(total);
    } catch (e) {
      debugPrint('⚠️ Badge Firestore update failed (non-fatal): $e');
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
