import 'dart:async';
import 'dart:convert';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:app_badge_plus/app_badge_plus.dart';
import 'crashlytics_service.dart';

// Import dart:io only on non-web platforms
import 'notification_service_io.dart' if (dart.library.html) 'notification_service_web.dart' as platform_helper;

/// Service de gestion des notifications push
class NotificationService {
  static final NotificationService _instance = NotificationService._internal();

  factory NotificationService() => _instance;

  NotificationService._internal();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();

  /// Subscription pour FCM token refresh events
  StreamSubscription<String>? _tokenRefreshSubscription;

  /// Callback pour quand l'utilisateur tape sur une notification locale
  void Function(String? payload)? onLocalNotificationTap;

  /// Initialiser les notifications
  Future<void> initialize({void Function(String? payload)? onNotificationTap}) async {
    onLocalNotificationTap = onNotificationTap;
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
      await _localNotifications.initialize(
        initSettings,
        onDidReceiveNotificationResponse: (NotificationResponse response) {
          debugPrint('🔔 Local notification tapped, payload: ${response.payload}');
          if (onLocalNotificationTap != null && response.payload != null) {
            onLocalNotificationTap!(response.payload);
          }
        },
      );

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
    } catch (e, stack) {
      debugPrint('❌ Erreur initialisation notifications: $e');
      CrashlyticsService.notificationError(e, stack, 'initialize failed');
    }
  }

  /// Configurer les handlers pour les messages foreground
  /// Doit être appelé après initialize()
  void setupForegroundNotifications() {
    // Écouter les messages quand l'app est au premier plan
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    debugPrint('✅ Foreground notification handler configuré');
  }

  /// Écouter les rafraîchissements de token FCM et sauvegarder automatiquement
  /// Quand iOS/Android rotent le token (après update OS, app update, ou périodiquement),
  /// le nouveau token doit être sauvegardé dans Firestore sinon les notifications arrêtent.
  void listenForTokenRefresh(String clubId, String userId) {
    if (kIsWeb) return;

    // Annuler l'ancienne subscription si elle existe
    _tokenRefreshSubscription?.cancel();

    _tokenRefreshSubscription = _messaging.onTokenRefresh.listen((newToken) async {
      debugPrint('🔄 FCM Token refreshed, saving to Firestore...');
      try {
        final memberRef = _firestore.collection('clubs/$clubId/members').doc(userId);
        await memberRef.update({
          'fcm_tokens': FieldValue.arrayUnion([newToken]),
          'fcm_token': newToken,
          'fcm_token_updated_at': FieldValue.serverTimestamp(),
        });
        debugPrint('✅ Refreshed FCM token saved to Firestore');
      } catch (e, stack) {
        debugPrint('❌ Error saving refreshed FCM token: $e');
        CrashlyticsService.notificationError(e, stack, 'onTokenRefresh save failed');
      }
    });

    debugPrint('✅ FCM token refresh listener actif');
  }

  /// Arrêter d'écouter les rafraîchissements de token
  void stopListeningForTokenRefresh() {
    _tokenRefreshSubscription?.cancel();
    _tokenRefreshSubscription = null;
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
    } else if (type == 'piscine_task_assigned') {
      channelId = 'piscine_tasks';
      channelName = 'Tâches de piscine';
    } else if (type == 'session_reminder') {
      channelId = 'piscine_reminders';
      channelName = 'Rappels piscine';
    } else if (type == 'exercice_declared' || type == 'exercice_digest') {
      channelId = 'exercise_declarations';
      channelName = 'Déclarations d\'exercices';
    } else if (type == 'new_operation') {
      channelId = 'event_messages';
      channelName = 'Nouvelles sorties';
    } else {
      channelId = 'announcements';
      channelName = 'Annonces du club';
    }

    // Encoder toute la data du message comme JSON pour la navigation au tap
    final payloadJson = jsonEncode(message.data);

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
      payload: payloadJson,
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

      // Canal pour les tâches de piscine (assignation accueil, gonflage, encadrant)
      const piscineTasksChannel = AndroidNotificationChannel(
        'piscine_tasks',
        'Tâches de piscine',
        description: 'Notifications quand tu es assigné(e) à une tâche de piscine',
        importance: Importance.high,
        playSound: true,
        enableVibration: true,
      );
      await androidPlugin.createNotificationChannel(piscineTasksChannel);

      // Canal pour les rappels de piscine
      const piscineRemindersChannel = AndroidNotificationChannel(
        'piscine_reminders',
        'Rappels piscine',
        description: 'Notifications de rappel pour les séances de piscine',
        importance: Importance.high,
        playSound: true,
        enableVibration: true,
      );
      await androidPlugin.createNotificationChannel(piscineRemindersChannel);

      // Canal pour les déclarations d'exercices
      const exerciseDeclarationsChannel = AndroidNotificationChannel(
        'exercise_declarations',
        'Déclarations d\'exercices',
        description: 'Notifications pour les exercices à valider',
        importance: Importance.high,
        playSound: true,
        enableVibration: true,
      );
      await androidPlugin.createNotificationChannel(exerciseDeclarationsChannel);

      debugPrint('✅ Canaux de notification Android créés');
    } catch (e, stack) {
      debugPrint('❌ Erreur création canaux notification: $e');
      CrashlyticsService.notificationError(e, stack, 'createNotificationChannel failed');
    }
  }

  /// Obtenir le token FCM actuel
  Future<String?> getToken() async {
    try {
      return await _messaging.getToken();
    } catch (e, stack) {
      debugPrint('❌ Erreur récupération token FCM: $e');
      CrashlyticsService.notificationError(e, stack, 'getToken failed');
      return null;
    }
  }

  /// Sauvegarder le token FCM et les infos de l'appareil dans Firestore
  /// Supporte plusieurs appareils en utilisant un array de tokens
  /// Note: app_installed et device info worden ALTIJD gezet, ook zonder FCM token.
  /// Zo tellen gebruikers die notificaties weigeren toch mee in de adoptiecijfers.
  Future<void> saveTokenToFirestore(String clubId, String userId) async {
    // Hijs updateData buiten de try-scope zodat het catch-block de veldnamen
    // kan loggen (diagnose voor Firestore-rules whitelist drift).
    final updateData = <String, dynamic>{};
    try {
      // Récupérer les informations de l'appareil et de l'app (altijd nodig)
      final deviceInfo = await _getDeviceInfo();
      final appInfo = await _getAppInfo();

      final memberRef = _firestore.collection('clubs/$clubId/members').doc(userId);

      // Vérifier si c'est la première installation (app_first_installed n'existe pas)
      final doc = await memberRef.get();
      final existingData = doc.data();
      final isFirstInstall = existingData?['app_first_installed'] == null;

      // Fix #5: detecteer een app-update door de vorige version/build te
      // vergelijken met de huidige. iOS APNs tokens blijven soms "plakken"
      // aan een oude build en leveren stille delivery failures op. Bij een
      // versie-change forceren we een volledige token-rotatie: oude token
      // uit het fcm_tokens array verwijderen, deleteToken() bij FCM, dan
      // een verse getToken() hieronder.
      final previousVersion = existingData?['app_version'] as String?;
      final previousBuild = existingData?['app_build_number'] as String?;
      final isVersionChange = previousVersion != null &&
          (previousVersion != appInfo['version'] ||
              previousBuild != appInfo['buildNumber']);

      if (isVersionChange) {
        debugPrint(
            '🔄 App-versie gewijzigd ($previousVersion+$previousBuild → ${appInfo['version']}+${appInfo['buildNumber']}) — force token rotatie');
        try {
          final oldToken = await _messaging.getToken();
          if (oldToken != null) {
            // Verwijder oude token uit het array zodat we geen dode
            // duplicate bijhouden naast de verse token straks.
            try {
              await memberRef.update({
                'fcm_tokens': FieldValue.arrayRemove([oldToken]),
              });
            } catch (e) {
              debugPrint('⚠️ arrayRemove oude token faalde (niet erg): $e');
            }
          }
          await _messaging.deleteToken();
          debugPrint('✅ Oude FCM token ingetrokken — verse getToken() volgt');
        } catch (e, stack) {
          // Non-fatal: als rotatie faalt gebruiken we gewoon de bestaande
          // token en loggen het naar Crashlytics voor diagnose.
          debugPrint('⚠️ Force token rotatie faalde (non-fatal): $e');
          CrashlyticsService.notificationError(
            e,
            stack,
            'force token rotation failed on version change',
          );
        }
      }

      // Préparer les données de base (ALTIJD gezet, onafhankelijk van FCM)
      updateData.addAll(<String, dynamic>{
        // App installation tracking — altijd zetten
        'app_installed': true,
        'app_platform': deviceInfo['platform'],
        'app_version': appInfo['version'],
        'app_build_number': appInfo['buildNumber'],
        'device_model': deviceInfo['model'],
        'device_os_version': deviceInfo['osVersion'],
        'app_last_opened': FieldValue.serverTimestamp(),
        // Device debug velden
        'device_brand': deviceInfo['brand'],
        'device_is_physical': deviceInfo['isPhysicalDevice'],
        'device_locale': deviceInfo['locale'],
        'device_timezone': deviceInfo['timezone'],
        'device_screen_width': deviceInfo['screenWidth'],
        'device_screen_height': deviceInfo['screenHeight'],
        'device_pixel_ratio': deviceInfo['pixelRatio'],
      });

      // Ajouter app_first_installed uniquement si c'est la première installation
      if (isFirstInstall) {
        updateData['app_first_installed'] = FieldValue.serverTimestamp();
      }

      // FCM token: alleen toevoegen als beschikbaar
      final token = await getToken();
      if (token != null) {
        updateData['fcm_tokens'] = FieldValue.arrayUnion([token]);
        updateData['fcm_token'] = token; // Garder pour compatibilité
        updateData['fcm_token_updated_at'] = FieldValue.serverTimestamp();
        updateData['notifications_enabled'] = true;
      } else {
        debugPrint('⚠️  Aucun token FCM disponible — app_installed quand même mis à jour');
      }

      await memberRef.update(updateData);

      debugPrint('OK saveTokenToFirestore (${updateData.keys.length} fields)${token != null ? " + FCM token" : ""}');
      debugPrint('   Platform: ${deviceInfo['platform']}, Model: ${deviceInfo['model']}');
      debugPrint('   App version: ${appInfo['version']} (${appInfo['buildNumber']})');
    } catch (e, stack) {
      // LOUD failure: typically Firestore rules whitelist drift — a field in
      // updateData is not in the members whitelist, so the rule's hasOnly()
      // check rejects the entire write. Silent in the old code, which is how
      // we ended up with 25 users showing as "Non installée" in the dashboard
      // while the app had in fact been opened. Dump the field list so this
      // failure mode is immediately diagnosable.
      final fields = updateData.keys.join(', ');
      debugPrint('CRITICAL saveTokenToFirestore FAILED: $e');
      debugPrint('         Fields attempted: $fields');
      debugPrint('         Likely Firestore rules whitelist drift: one of these');
      debugPrint('         fields is not in the /clubs/{clubId}/members/{memberId}');
      debugPrint('         whitelist, so hasOnly() rejects the whole write.');
      debugPrint('         => app_installed NOT set. App-adoption dashboard will');
      debugPrint('            show stale data for this user until rules are fixed');
      debugPrint('            and the user reopens the app.');
      CrashlyticsService.notificationError(
        e,
        stack,
        'saveTokenToFirestore FAILED fields=[$fields]',
      );
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
    } catch (e, stack) {
      debugPrint('❌ Erreur récupération device info: $e');
      CrashlyticsService.notificationError(e, stack, 'getDeviceInfo failed');
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
    } catch (e, stack) {
      debugPrint('❌ Erreur récupération app info: $e');
      CrashlyticsService.notificationError(e, stack, 'getAppInfo failed');
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
    } catch (e, stack) {
      debugPrint('❌ Erreur suppression token FCM: $e');
      CrashlyticsService.notificationError(e, stack, 'removeTokenFromFirestore failed');
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
    } catch (e, stack) {
      debugPrint('❌ Erreur souscription topic: $e');
      CrashlyticsService.notificationError(e, stack, 'subscribeToTopic $topic');
    }
  }

  /// Se désabonner d'un topic
  Future<void> unsubscribeFromTopic(String topic) async {
    try {
      await _messaging.unsubscribeFromTopic(topic);
      debugPrint('✅ Désabonné du topic: $topic');
    } catch (e, stack) {
      debugPrint('❌ Erreur désabonnement topic: $e');
      CrashlyticsService.notificationError(e, stack, 'unsubscribeFromTopic $topic');
    }
  }

  /// Vérifier si les notifications sont autorisées
  Future<bool> areNotificationsEnabled() async {
    try {
      final settings = await _messaging.getNotificationSettings();
      return settings.authorizationStatus == AuthorizationStatus.authorized;
    } catch (e, stack) {
      debugPrint('❌ Erreur vérification permissions: $e');
      CrashlyticsService.notificationError(e, stack, 'areNotificationsEnabled check failed');
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
    } catch (e, stack) {
      debugPrint('❌ Erreur demande permission: $e');
      CrashlyticsService.notificationError(e, stack, 'requestPermission failed');
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

  /// Mettre à jour le badge depuis le compteur Firestore unread_counts.
  ///
  /// We sommeren de per-categorie velden — het server-side beheerde `total`
  /// veld werd in het verleden enkel ge-increment (de bijbehorende decrement
  /// werd nooit aangeroepen vanuit een trigger), waardoor het monotoon dreef
  /// en opgeblazen badge-getallen gaf in APNs payloads. Single source of
  /// truth = de per-categorie velden, die door UnreadCountProvider correct
  /// worden gereset via _syncCountsToFirestore.
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
      for (final key in const [
        'announcements',
        'event_messages',
        'team_messages',
        'session_messages',
        'medical_certificates',
      ]) {
        final value = unreadCounts[key];
        if (value is num && value > 0) total += value.toInt();
      }

      await setBadge(total.clamp(0, 9999));
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
