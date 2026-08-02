import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart' show kIsWeb, kDebugMode, kReleaseMode;
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart' hide TextDirection;
import 'package:intl/date_symbol_data_local.dart';
import 'package:syncfusion_flutter_core/core.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:syncfusion_localizations/syncfusion_localizations.dart';

// Firebase options
import 'firebase_options.dart';

// Services
import 'services/notification_service.dart';
import 'services/notification_navigation_service.dart';
import 'services/deep_link_service.dart';
import 'services/local_read_tracker.dart';
import 'services/app_update_service.dart';
import 'services/formation_task_service.dart';
import 'services/formation_task_navigation_service.dart';
import 'services/lifras_service.dart';

// Providers
import 'providers/auth_provider.dart';
import 'providers/member_provider.dart';
import 'providers/operation_provider.dart';
import 'providers/expense_provider.dart';
import 'providers/announcement_provider.dart';
import 'providers/event_message_provider.dart';
import 'providers/payment_provider.dart';
import 'providers/exercice_valide_provider.dart';
import 'providers/availability_provider.dart';
import 'providers/activity_provider.dart';
import 'providers/unread_count_provider.dart';
import 'providers/boutique_cart_provider.dart';

// Bug Report
import 'widgets/bug_report_widget.dart';

// Screens
import 'screens/auth/login_screen.dart';
import 'screens/auth/reset_password_screen.dart';
import 'screens/operations/operation_detail_screen.dart';
import 'screens/announcements/announcement_detail_screen.dart';
import 'screens/communication/communication_hub_screen.dart';
import 'screens/teams/team_chat_screen.dart';
import 'screens/piscine/session_chat_screen.dart';
import 'screens/piscine/session_detail_screen.dart';
import 'screens/profile/medical_certification_screen.dart';
import 'screens/training/logbook_dive_confirmation_screen.dart';
import 'screens/training/historical_validation_screen.dart';
import 'screens/exercises/validate_exercise_screen.dart';

// Models (pour la navigation depuis les notifications)
import 'models/announcement.dart';
import 'models/team_channel.dart';
import 'models/piscine_session.dart';
import 'models/session_message.dart';
import 'models/formation_task.dart';

// Config
import 'config/app_colors.dart';
import 'config/firebase_config.dart';

// Firestore (pour fetch depuis notifications)
import 'package:cloud_firestore/cloud_firestore.dart';
// hide AuthProvider — firebase_auth exports its own AuthProvider class which
// clashes with our providers/auth_provider.dart.
import 'package:firebase_auth/firebase_auth.dart' hide AuthProvider;

// Sentry
import 'package:sentry_flutter/sentry_flutter.dart';

void main() async {
  // Initialize Sentry FIRST — all other init happens inside appRunner
  // to ensure WidgetsFlutterBinding and runApp share the same zone.
  // SentryFlutter.init calls ensureInitialized() internally in its zone,
  // so we must NOT call it before — that causes a zone mismatch on web.
  await SentryFlutter.init(
    (options) {
      options.dsn = kDebugMode
          ? '' // Désactivé en debug — pas d'envoi vers Sentry
          : 'https://c6c7e5f63f5700bf5cb4f2b02a6ea0b5@o4510996349386752.ingest.de.sentry.io/4510996559429712';
      options.tracesSampleRate =
          kReleaseMode ? 0.2 : 0.0; // 20% en prod, 0 en debug
      options.environment = kReleaseMode
          ? const String.fromEnvironment('ENV', defaultValue: 'production')
          : 'debug';
      options.debug = kDebugMode;

      // Ne pas envoyer d'événements en debug mode (sécurité supplémentaire)
      options.beforeSend = (event, hint) {
        if (kDebugMode) return null; // drop l'événement

        // Filtrer le bruit réseau : pertes de connexion transitoires côté
        // appareil (pas d'internet, DNS qui échoue, captive portal…). Ces
        // erreurs ne sont pas des bugs de l'app et polluent Sentry.
        // On matche sur la string de l'exception pour rester compatible web
        // (dart:io / SocketException n'est pas dispo sur le web).
        final throwable = event.throwable?.toString() ??
            event.exceptions?.map((e) => '${e.type} ${e.value}').join(' ') ??
            '';
        const offlineSignatures = <String>[
          'Failed host lookup',
          'No address associated with hostname',
          'errno = 7',
          'SocketException',
          'HandshakeException',
          'Connection closed before full header was received',
          'Connection reset by peer',
          'Connection refused',
          'Network is unreachable',
          'Software caused connection abort',
          'Connection timed out',
          'Operation timed out',
        ];
        if (offlineSignatures.any(throwable.contains)) {
          return null; // drop : perte de connexion transitoire, pas un bug
        }

        return event;
      };

      // Session Replay — pour bug reporting (capture vidéo des sessions)
      options.replay.sessionSampleRate = 0.1; // 10% des sessions normales
      options.replay.onErrorSampleRate = 1.0; // 100% des sessions avec erreur
    },
    appRunner: () async {
      debugPrint('✅ Sentry initialisé');

      // Register Syncfusion license
      // ignore: deprecated_member_use
      SyncfusionLicense.registerLicense(
          'Ngo9BigBOggjHTQxAR8/V1JFaF1cXGFCf1FpRGpGfV5ycUVHYVZQRXxeQE0SNHVRdkdmWH1fcnVUR2FdU0J+W0pWYEg=');

      try {
        // Initialiser Firebase avec les options de configuration
        if (Firebase.apps.isEmpty) {
          await Firebase.initializeApp(
            options: DefaultFirebaseOptions.currentPlatform,
          );
          debugPrint('✅ Firebase initialisé');
        } else {
          debugPrint('ℹ️ Firebase déjà initialisé');
        }

        // Initialiser Firebase Crashlytics (pas sur web)
        if (!kIsWeb) {
          FlutterError.onError = (FlutterErrorDetails details) {
            FirebaseCrashlytics.instance.recordFlutterFatalError(details);
            Sentry.captureException(details.exception,
                stackTrace: details.stack);
          };
          debugPrint('✅ Crashlytics initialisé');
        }

        // Pré-initialiser LocalReadTracker (SharedPreferences) pour éviter ANR
        await LocalReadTracker().init();
        debugPrint('✅ LocalReadTracker pré-initialisé');

        // Initialiser les données de locale pour le français
        await initializeDateFormatting('fr_FR', null);
        Intl.defaultLocale = 'fr_FR';
        debugPrint('✅ Locale initialisée (fr_FR)');

        // Initialiser le service de notifications (pas sur web)
        if (!kIsWeb) {
          FirebaseMessaging.onBackgroundMessage(
              firebaseMessagingBackgroundHandler);
        }

        final notificationService = NotificationService();
        await notificationService.initialize();
        if (!kIsWeb) {
          notificationService.setupForegroundNotifications();
        }
        debugPrint('✅ Notifications initialisées');

        // Initialiser le service de deep links (pour les retours de paiement Mollie)
        final deepLinkService = DeepLinkService();
        await deepLinkService.initialize();
        debugPrint('✅ Deep links initialisés');
      } catch (e) {
        debugPrint('❌ Erreur initialisation: $e');
        debugPrint('Stack trace: ${StackTrace.current}');
      }

      // appRunner already executes inside Sentry's zone. Wrapping runApp in an
      // extra runZonedGuarded creates a different zone and triggers a web
      // "Zone mismatch" assertion at startup.
      runApp(const MyApp());
    },
  );
}

class MyApp extends StatefulWidget {
  const MyApp({Key? key}) : super(key: key);

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> with WidgetsBindingObserver {
  final NotificationService _notificationService = NotificationService();
  final DeepLinkService _deepLinkService = DeepLinkService();
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();
  final GlobalKey<ScaffoldMessengerState> _messengerKey =
      GlobalKey<ScaffoldMessengerState>();
  final NotificationNavigationQueue _notificationQueue =
      NotificationNavigationQueue();
  late final _NotificationNavigatorObserver _notificationNavigatorObserver;
  StreamSubscription<RemoteMessage>? _notificationOpenedSubscription;
  AuthProvider? _notificationAuthProvider;
  MemberProvider? _notificationMemberProvider;
  bool _notificationDrainScheduled = false;
  bool _notificationDrainInProgress = false;

  @override
  void initState() {
    super.initState();
    _notificationNavigatorObserver = _NotificationNavigatorObserver(
      onNavigationChanged: _scheduleNotificationDrain,
    );
    WidgetsBinding.instance.addObserver(this);
    _setupDeepLinkListener();
    _setupNotificationTapHandlers();
    // Connecter le callback pour les taps sur notifications locales (foreground)
    _notificationService.onLocalNotificationTap = _handleLocalNotificationTap;
    // Mettre à jour le badge au démarrage avec le nombre réel de non-lus
    // (post-frame car le Provider n'est pas encore prêt dans initState)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _attachNotificationReadinessListeners();
      final initialLocalPayload =
          _notificationService.takeInitialLocalNotificationPayload();
      if (initialLocalPayload != null) {
        _handleLocalNotificationTap(
          initialLocalPayload,
          origin: NotificationTapOrigin.terminated,
        );
      }
      _updateBadgeFromUnreadCounts();
    });
  }

  /// Configure les handlers pour la navigation quand l'utilisateur tape sur une notification
  void _setupNotificationTapHandlers() {
    // Handler quand l'app est en arrière-plan et l'utilisateur tape sur la notification
    _notificationOpenedSubscription = FirebaseMessaging.onMessageOpenedApp
        .listen((message) => _enqueueRemoteNotification(
              message,
              NotificationTapOrigin.background,
            ));

    // Handler quand l'app est complètement fermée et ouverte via une notification
    FirebaseMessaging.instance.getInitialMessage().then((message) {
      if (message != null) {
        _enqueueRemoteNotification(message, NotificationTapOrigin.terminated);
      }
    });

    // Handler pour les messages en foreground: rafraîchir les badges immédiatement
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      debugPrint('🔔 Foreground message received — scheduling badge refresh');
      // Petit délai pour laisser Firestore se mettre à jour côté serveur
      Future.delayed(const Duration(seconds: 2), () {
        _refreshUnreadCounts();
        // Mettre à jour le badge de l'icône app après refresh
        Future.delayed(const Duration(seconds: 1), () {
          _updateBadgeFromUnreadCounts();
        });
      });
    });
  }

  /// Handler quand l'utilisateur tape sur une notification locale (foreground)
  void _handleLocalNotificationTap(
    String? payload, {
    NotificationTapOrigin origin = NotificationTapOrigin.foreground,
  }) {
    if (payload == null || payload.isEmpty) return;

    try {
      final data = jsonDecode(payload) as Map<String, dynamic>;
      _enqueueNotificationRequest(
        NotificationNavigationRequest.fromData(
          data,
          origin: origin,
        ),
      );
    } catch (e) {
      debugPrint('❌ Invalid local notification payload');
      _showNotificationFeedback(
        'Cette notification ne peut plus être ouverte.',
      );
    }
  }

  void _enqueueRemoteNotification(
    RemoteMessage message,
    NotificationTapOrigin origin,
  ) {
    _enqueueNotificationRequest(
      NotificationNavigationRequest.fromData(
        message.data,
        origin: origin,
        messageId: message.messageId,
      ),
    );
  }

  void _enqueueNotificationRequest(NotificationNavigationRequest request) {
    if (request.type == null) {
      _showNotificationFeedback(
        'Cette notification ne contient pas de destination valide.',
      );
      return;
    }
    if (!_notificationQueue.enqueue(request)) {
      debugPrint(
          'ℹ️ Duplicate notification tap ignored (type=${request.type})');
      return;
    }
    debugPrint(
        '🔔 Notification queued (type=${request.type}, origin=${request.origin.name})');
    _scheduleNotificationDrain();
  }

  void _attachNotificationReadinessListeners() {
    final context = _navigatorKey.currentContext;
    if (context == null) return;
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final memberProvider = Provider.of<MemberProvider>(context, listen: false);
    if (!identical(_notificationAuthProvider, authProvider)) {
      _notificationAuthProvider?.removeListener(_scheduleNotificationDrain);
      _notificationAuthProvider = authProvider
        ..addListener(_scheduleNotificationDrain);
    }
    if (!identical(_notificationMemberProvider, memberProvider)) {
      _notificationMemberProvider?.removeListener(_scheduleNotificationDrain);
      _notificationMemberProvider = memberProvider
        ..addListener(_scheduleNotificationDrain);
    }
  }

  void _scheduleNotificationDrain() {
    if (!mounted || _notificationDrainScheduled) return;
    _notificationDrainScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _notificationDrainScheduled = false;
      _attachNotificationReadinessListeners();
      unawaited(_drainNotificationQueue());
    });
  }

  bool get _notificationNavigationIsReady {
    final authProvider = _notificationAuthProvider;
    final memberProvider = _notificationMemberProvider;
    final route = _notificationNavigatorObserver.currentRoute;
    return _navigatorKey.currentState != null &&
        authProvider?.currentUser != null &&
        memberProvider?.isLoaded == true &&
        memberProvider?.requirePasswordChange != true &&
        route != null &&
        route.settings.name != Navigator.defaultRouteName;
  }

  Future<void> _drainNotificationQueue() async {
    if (_notificationDrainInProgress || !_notificationNavigationIsReady) {
      return;
    }
    final request = _notificationQueue.takeNext();
    if (request == null) return;

    _notificationDrainInProgress = true;
    // Mark before pushing: while the destination is on the back stack, a
    // duplicate OS callback or double tap must not enqueue the same screen.
    _notificationQueue.markHandled(request);
    try {
      await _navigateForNotification(request);
    } finally {
      _notificationDrainInProgress = false;
      if (_notificationQueue.pendingCount > 0) {
        _scheduleNotificationDrain();
      }
    }
  }

  /// Timeout for Firestore reads during notification tap handling.
  /// Prevents ANR if network is slow or Firestore is unresponsive.
  static const Duration _notificationTapTimeout = Duration(seconds: 5);

  /// Routes every notification origin through the same normalised request.
  Future<void> _navigateForNotification(
    NotificationNavigationRequest request,
  ) async {
    final navigator = _navigatorKey.currentState;
    final context = _navigatorKey.currentContext;
    if (navigator == null || context == null) {
      _notificationQueue.putBack(request);
      return;
    }
    final clubId = request.clubId ?? FirebaseConfig.defaultClubId;
    debugPrint(
        '🔔 Opening notification destination (type=${request.type}, route=${request.routeKind.name})');

    try {
      switch (request.routeKind) {
        case NotificationRouteKind.operation:
          final operationId = request.operationId;
          if (operationId == null) return _showMissingNotificationTarget();
          await navigator.push(MaterialPageRoute(
            builder: (_) => OperationDetailScreen(
              operationId: operationId,
              clubId: clubId,
            ),
          ));
          break;

        case NotificationRouteKind.announcement:
          final announcementId = request.announcementId;
          if (announcementId == null) return _showMissingNotificationTarget();
          final doc = await FirebaseFirestore.instance
              .collection('clubs')
              .doc(clubId)
              .collection('announcements')
              .doc(announcementId)
              .get()
              .timeout(_notificationTapTimeout);
          if (!doc.exists) return _showMissingNotificationTarget();
          await navigator.push(MaterialPageRoute(
            builder: (_) => AnnouncementDetailScreen(
              announcement: Announcement.fromFirestore(doc),
              clubId: clubId,
            ),
          ));
          break;

        case NotificationRouteKind.teamChat:
          final channelId = request.channelId;
          if (channelId == null) return _showMissingNotificationTarget();
          final doc = await FirebaseFirestore.instance
              .collection('clubs')
              .doc(clubId)
              .collection('team_channels')
              .doc(channelId)
              .get()
              .timeout(_notificationTapTimeout);
          if (!doc.exists) return _showMissingNotificationTarget();
          await navigator.push(MaterialPageRoute(
            builder: (_) => TeamChatScreen(
              channel: TeamChannel.fromFirestore(doc),
            ),
          ));
          break;

        case NotificationRouteKind.sessionChat:
          final sessionId = request.sessionId;
          if (sessionId == null) return _showMissingNotificationTarget();
          final doc = await FirebaseFirestore.instance
              .collection('clubs')
              .doc(clubId)
              .collection('piscine_sessions')
              .doc(sessionId)
              .get()
              .timeout(_notificationTapTimeout);
          if (!doc.exists) return _showMissingNotificationTarget();
          final session = PiscineSession.fromFirestore(doc);
          final groupType = request.data['group_type'];
          final groupLevel = request.data['group_level'];
          var sessionGroupType = SessionGroupType.encadrants;
          var displayName = 'Encadrants';
          if (groupType == 'accueil') {
            sessionGroupType = SessionGroupType.accueil;
            displayName = 'Accueil';
          } else if (groupType == 'niveau' && groupLevel != null) {
            sessionGroupType = SessionGroupType.niveau;
            displayName = 'Niveau $groupLevel';
          }
          await navigator.push(MaterialPageRoute(
            builder: (_) => SessionChatScreen(
              session: session,
              chatGroup: SessionChatGroup(
                type: sessionGroupType,
                level: groupType == 'niveau' ? groupLevel : null,
                displayName: displayName,
              ),
            ),
          ));
          break;

        case NotificationRouteKind.sessionDetail:
          final sessionId = request.sessionId;
          if (sessionId == null) return _showMissingNotificationTarget();
          final doc = await FirebaseFirestore.instance
              .collection('clubs')
              .doc(clubId)
              .collection('piscine_sessions')
              .doc(sessionId)
              .get()
              .timeout(_notificationTapTimeout);
          if (!doc.exists) return _showMissingNotificationTarget();
          await navigator.push(MaterialPageRoute(
            builder: (_) => SessionDetailScreen(
              session: PiscineSession.fromFirestore(doc),
            ),
          ));
          break;

        case NotificationRouteKind.formationTask:
          await _openFormationTaskNotification(request, clubId, context);
          break;

        case NotificationRouteKind.exerciseDeclaration:
          await _openExerciseDeclarationNotification(request, clubId);
          break;

        case NotificationRouteKind.communicationInbox:
          await navigator.push(MaterialPageRoute(
            builder: (_) => const CommunicationHubScreen(),
          ));
          break;

        case NotificationRouteKind.medicalCertificate:
          final userId = FirebaseAuth.instance.currentUser?.uid;
          if (userId == null) return _showMissingNotificationTarget();
          await navigator.push(MaterialPageRoute(
            builder: (_) => MedicalCertificationScreen(userId: userId),
          ));
          break;

        case NotificationRouteKind.logbookConfirmation:
          final confirmationId = request.confirmationId;
          if (confirmationId == null) return _showMissingNotificationTarget();
          await navigator.push(MaterialPageRoute(
            builder: (_) => LogbookDiveConfirmationScreen(
              confirmationId: confirmationId,
              clubId: clubId,
            ),
          ));
          break;

        case NotificationRouteKind.unsupported:
          _showNotificationFeedback(
            'Cette notification ne peut plus être ouverte.',
          );
          break;
      }
    } on TimeoutException {
      debugPrint(
          '⚠️ Notification destination timed out (type=${request.type})');
      _showNotificationFeedback(
        'Connexion impossible. Réessaie depuis l’écran concerné.',
      );
    } on FirebaseException catch (error) {
      debugPrint(
          '⚠️ Notification destination unavailable (type=${request.type}, code=${error.code})');
      _showNotificationFeedback(
        error.code == 'permission-denied'
            ? 'Tu n’as plus accès à cet élément.'
            : 'Cet élément n’est plus disponible.',
      );
    } catch (error) {
      debugPrint('❌ Notification navigation failed (type=${request.type})');
      _showNotificationFeedback(
        'Impossible d’ouvrir cette notification pour le moment.',
      );
    }
  }

  Future<void> _openFormationTaskNotification(
    NotificationNavigationRequest request,
    String clubId,
    BuildContext context,
  ) async {
    final taskId = request.formationTaskId;
    final userId = FirebaseAuth.instance.currentUser?.uid;
    if (taskId == null || userId == null) {
      return _showMissingNotificationTarget();
    }
    final task = await FormationTaskService()
        .fetchAssignedTask(clubId, taskId, userId)
        .timeout(_notificationTapTimeout);
    if (task == null) return _showMissingNotificationTarget();
    if (task.status == FormationTaskStatus.done ||
        task.status == FormationTaskStatus.dismissed ||
        task.status == FormationTaskStatus.expired) {
      _showNotificationFeedback('Cette action a déjà été traitée.');
      return;
    }
    if (!context.mounted) return;
    openFormationTask(context, task);
  }

  Future<void> _openExerciseDeclarationNotification(
    NotificationNavigationRequest request,
    String clubId,
  ) async {
    final memberId = request.memberId;
    final declarationId = request.exerciceValideId;
    if (memberId == null || declarationId == null) {
      return _showMissingNotificationTarget();
    }

    final declaration = await FirebaseFirestore.instance
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .doc(memberId)
        .collection('exercices_valides')
        .doc(declarationId)
        .get()
        .timeout(_notificationTapTimeout);
    if (!declaration.exists) return _showMissingNotificationTarget();
    final declarationData = declaration.data() ?? const <String, dynamic>{};
    final exerciseId = declarationData['exercice_id']?.toString().trim();
    final exerciseCode = request.exerciseCode ??
        declarationData['exercice_code']?.toString().trim();

    var exercise = exerciseId == null || exerciseId.isEmpty
        ? null
        : await LifrasService().getExerciceById(clubId, exerciseId);
    if (exercise == null && exerciseCode != null && exerciseCode.isNotEmpty) {
      final catalog = await LifrasService().getAllExercices(clubId);
      for (final item in catalog) {
        if (item.code.toLowerCase() == exerciseCode.toLowerCase()) {
          exercise = item;
          break;
        }
      }
    }
    if (exercise == null) return _showMissingNotificationTarget();

    final directory = await FirebaseFirestore.instance
        .collection('clubs')
        .doc(clubId)
        .collection('member_directory')
        .doc(memberId)
        .get()
        .timeout(_notificationTapTimeout);
    if (!directory.exists) return _showMissingNotificationTarget();
    final directoryData = directory.data() ?? const <String, dynamic>{};
    final memberName = (directoryData['display_name'] ??
            directoryData['displayName'] ??
            'Membre')
        .toString()
        .trim();
    final navigator = _navigatorKey.currentState;
    if (navigator == null) return;
    await navigator.push(MaterialPageRoute(
      builder: (_) => ValidateExerciseScreen(
        memberId: memberId,
        memberName: memberName.isEmpty ? 'Membre' : memberName,
        preselectedExercise: exercise,
      ),
    ));
  }

  void _showMissingNotificationTarget() {
    _showNotificationFeedback(
      'Cet élément n’est plus disponible ou a déjà été traité.',
    );
  }

  void _showNotificationFeedback(String message) {
    _messengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  void _setupDeepLinkListener() {
    _deepLinkService.onPasswordReset.listen((data) {
      debugPrint('Main: Password reset deep link received');
      // Navigate to reset password screen
      _navigatorKey.currentState?.push(
        MaterialPageRoute(
          builder: (_) => ResetPasswordScreen(oobCode: data.oobCode),
        ),
      );
    });

    _deepLinkService.onHistoricalValidation.listen((data) {
      debugPrint('Main: Historical validation deep link received');
      _navigatorKey.currentState?.push(
        MaterialPageRoute(
          builder: (_) => HistoricalValidationScreen(batchId: data.batchId),
        ),
      );
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _notificationOpenedSubscription?.cancel();
    _notificationAuthProvider?.removeListener(_scheduleNotificationDrain);
    _notificationMemberProvider?.removeListener(_scheduleNotificationDrain);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Refresh unread counts bij terugkeer naar app
      _refreshUnreadCounts();
      _updateBadgeFromUnreadCounts();
      // Check voor app update (cache wordt gecleared zodat er opnieuw gecheckt wordt)
      AppUpdateService.clearCache();
      _checkForAppUpdate();
      // Re-save FCM token bij elke app resume (vangt geroteerde tokens op
      // die veranderd zijn terwijl de app in de achtergrond was)
      _refreshFcmToken();
    } else if (state == AppLifecycleState.paused) {
      // Badge updaten bij vertrek uit app
      _updateBadgeFromUnreadCounts();
    }
  }

  /// Re-save FCM token bij app resume om geroteerde tokens op te vangen
  void _refreshFcmToken() {
    try {
      final context = _navigatorKey.currentContext;
      if (context == null) return;
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      final user = authProvider.currentUser;
      if (user != null) {
        _notificationService.saveTokenToFirestore(
          FirebaseConfig.defaultClubId,
          user.uid,
        );
      }
    } catch (e) {
      debugPrint('⚠️ FCM token refresh on resume failed (non-fatal): $e');
    }
  }

  /// Check voor een app update en toon dialoog indien nodig.
  Future<void> _checkForAppUpdate() async {
    final context = _navigatorKey.currentContext;
    if (context == null) return;
    await AppUpdateService.showUpdateDialogIfNeeded(context);
  }

  /// Refresh de unread counts wanneer de app resumed wordt
  void _refreshUnreadCounts() {
    try {
      final unreadProvider = _navigatorKey.currentContext != null
          ? Provider.of<UnreadCountProvider>(_navigatorKey.currentContext!,
              listen: false)
          : null;
      if (unreadProvider != null && unreadProvider.isListening) {
        unreadProvider.refresh();
      }
    } catch (e) {
      debugPrint('⚠️ Could not refresh unread counts: $e');
    }
  }

  /// Met à jour le badge iOS/Android avec le total des non-lus depuis le provider
  void _updateBadgeFromUnreadCounts() {
    if (kIsWeb) return; // app_badge_plus not available on web (fixes CALYMOB-F)
    try {
      final unreadProvider = _navigatorKey.currentContext != null
          ? Provider.of<UnreadCountProvider>(_navigatorKey.currentContext!,
              listen: false)
          : null;
      if (unreadProvider != null) {
        _notificationService.setBadge(unreadProvider.total);
      }
    } catch (e) {
      debugPrint('⚠️ Could not update badge on pause: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    // Directionality wrapper ensures TextDirection is always available,
    // even during the warm-up frame before MaterialApp is fully built.
    // Fixes CALYMOB-A / CALYMOB-9 (AlignmentDirectional.resolve null check)
    return Directionality(
      textDirection: TextDirection.ltr,
      child: MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => AuthProvider()),
          ChangeNotifierProvider(create: (_) => MemberProvider()),
          ChangeNotifierProvider(create: (_) => OperationProvider()),
          ChangeNotifierProvider(create: (_) => ExpenseProvider()),
          ChangeNotifierProvider(create: (_) => AnnouncementProvider()),
          ChangeNotifierProvider(create: (_) => EventMessageProvider()),
          ChangeNotifierProvider(create: (_) => PaymentProvider()),
          ChangeNotifierProvider(create: (_) => ExerciceValideProvider()),
          ChangeNotifierProvider(create: (_) => AvailabilityProvider()),
          ChangeNotifierProvider(create: (_) => ActivityProvider()),
          ChangeNotifierProvider(create: (_) => UnreadCountProvider()),
          ChangeNotifierProvider(create: (_) => BoutiqueCartProvider()),
        ],
        child: MaterialApp(
          navigatorKey: _navigatorKey,
          scaffoldMessengerKey: _messengerKey,
          navigatorObservers: [_notificationNavigatorObserver],
          // BugReportOverlay est maintenant DANS le MaterialApp via builder,
          // pour avoir accès au Navigator, MediaQuery, et Theme.
          builder: (context, child) {
            return RepaintBoundary(
              key: repaintBoundaryKey,
              child: BugReportOverlay(
                navigatorKey: _navigatorKey,
                child: child ?? const SizedBox(),
              ),
            );
          },
          title: 'CalyMob',
          debugShowCheckedModeBanner: false,
          // Localisation française pour Syncfusion Calendar
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
            SfGlobalLocalizations.delegate,
          ],
          supportedLocales: const [
            Locale('fr', 'FR'),
          ],
          locale: const Locale('fr', 'FR'),
          theme: ThemeData(
            primarySwatch: Colors.blue,
            useMaterial3: true,
            colorScheme: ColorScheme.fromSeed(
              seedColor: AppColors.middenblauw, // Thème maritime
              brightness: Brightness.light,
            ),
            appBarTheme: const AppBarTheme(
              centerTitle: false,
              elevation: 0,
              backgroundColor: Colors.transparent,
              foregroundColor: Colors.white,
              iconTheme: IconThemeData(color: Colors.white),
            ),
            cardTheme: CardThemeData(
              elevation: 2,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            elevatedButtonTheme: ElevatedButtonThemeData(
              style: ElevatedButton.styleFrom(
                elevation: 0,
                backgroundColor: AppColors.lichtblauw,
                foregroundColor: AppColors.donkerblauw,
                disabledBackgroundColor:
                    AppColors.lichtblauw.withValues(alpha: 0.40),
                disabledForegroundColor:
                    AppColors.donkerblauw.withValues(alpha: 0.45),
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            filledButtonTheme: FilledButtonThemeData(
              style: FilledButton.styleFrom(
                elevation: 0,
                backgroundColor: AppColors.lichtblauw,
                foregroundColor: AppColors.donkerblauw,
                disabledBackgroundColor:
                    AppColors.lichtblauw.withValues(alpha: 0.40),
                disabledForegroundColor:
                    AppColors.donkerblauw.withValues(alpha: 0.45),
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            inputDecorationTheme: InputDecorationTheme(
              filled: true,
              fillColor: Colors.grey[50],
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.grey[300]!),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.grey[300]!),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide:
                    const BorderSide(color: AppColors.middenblauw, width: 2),
              ),
            ),
          ),
          home: const LoginScreen(),
        ),
      ),
    );
  }
}

class _NotificationNavigatorObserver extends NavigatorObserver {
  final VoidCallback onNavigationChanged;
  Route<dynamic>? currentRoute;

  _NotificationNavigatorObserver({required this.onNavigationChanged});

  void _changed(Route<dynamic>? route) {
    currentRoute = route;
    onNavigationChanged();
  }

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    super.didPush(route, previousRoute);
    _changed(route);
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    super.didReplace(newRoute: newRoute, oldRoute: oldRoute);
    _changed(newRoute);
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    super.didPop(route, previousRoute);
    _changed(previousRoute);
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    super.didRemove(route, previousRoute);
    _changed(previousRoute);
  }
}
