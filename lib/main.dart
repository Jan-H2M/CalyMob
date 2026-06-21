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
import 'services/deep_link_service.dart';
import 'services/local_read_tracker.dart';
import 'services/app_update_service.dart';

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

// Models (pour la navigation depuis les notifications)
import 'models/announcement.dart';
import 'models/team_channel.dart';
import 'models/piscine_session.dart';
import 'models/session_message.dart';

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
            event.exceptions
                ?.map((e) => '${e.type} ${e.value}')
                .join(' ') ??
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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _setupDeepLinkListener();
    _setupNotificationTapHandlers();
    // Connecter le callback pour les taps sur notifications locales (foreground)
    _notificationService.onLocalNotificationTap = _handleLocalNotificationTap;
    // Mettre à jour le badge au démarrage avec le nombre réel de non-lus
    // (post-frame car le Provider n'est pas encore prêt dans initState)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _updateBadgeFromUnreadCounts();
    });
  }

  /// Configure les handlers pour la navigation quand l'utilisateur tape sur une notification
  void _setupNotificationTapHandlers() {
    // Handler quand l'app est en arrière-plan et l'utilisateur tape sur la notification
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);

    // Handler quand l'app est complètement fermée et ouverte via une notification
    FirebaseMessaging.instance.getInitialMessage().then((message) {
      if (message != null) {
        // Petit délai pour s'assurer que le navigator est prêt
        Future.delayed(const Duration(milliseconds: 500), () {
          _handleNotificationTap(message);
        });
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
  void _handleLocalNotificationTap(String? payload) {
    if (payload == null || payload.isEmpty) return;

    try {
      final data = jsonDecode(payload) as Map<String, dynamic>;
      final type = data['type'] as String?;

      debugPrint('🔔 Local notification tap - type: $type, data: $data');

      if (type == null || _navigatorKey.currentState == null) return;

      // Construire un RemoteMessage avec les mêmes data pour réutiliser _handleNotificationTap
      final message = RemoteMessage(
        data: data.map((k, v) => MapEntry(k, v.toString())),
      );
      _handleNotificationTap(message);
    } catch (e) {
      debugPrint('❌ Error handling local notification tap: $e');
    }
  }

  /// Timeout for Firestore reads during notification tap handling.
  /// Prevents ANR if network is slow or Firestore is unresponsive.
  static const Duration _notificationTapTimeout = Duration(seconds: 5);

  /// Gère la navigation quand l'utilisateur tape sur une notification push.
  /// Uses timeouts on all Firestore reads to prevent ANR.
  Future<void> _handleNotificationTap(RemoteMessage message) async {
    final data = message.data;
    final type = data['type'] as String?;
    final clubId = data['club_id'] as String? ?? FirebaseConfig.defaultClubId;

    debugPrint('🔔 Notification tap - type: $type, data: $data');

    if (type == null || _navigatorKey.currentState == null) {
      debugPrint(
          '⚠️ Cannot handle notification tap: type=$type, navigator=${_navigatorKey.currentState != null}');
      return;
    }

    try {
      switch (type) {
        case 'event_message':
        case 'new_operation':
          final operationId = data['operation_id'] as String?;
          if (operationId != null) {
            _navigatorKey.currentState!.push(
              MaterialPageRoute(
                builder: (_) => OperationDetailScreen(
                  operationId: operationId,
                  clubId: clubId,
                ),
              ),
            );
          }
          break;

        case 'announcement':
        case 'announcement_reply':
          final announcementId = data['announcement_id'] as String?;
          if (announcementId != null) {
            final doc = await FirebaseFirestore.instance
                .collection('clubs')
                .doc(clubId)
                .collection('announcements')
                .doc(announcementId)
                .get()
                .timeout(_notificationTapTimeout);
            if (doc.exists) {
              final announcement = Announcement.fromFirestore(doc);
              _navigatorKey.currentState!.push(
                MaterialPageRoute(
                  builder: (_) => AnnouncementDetailScreen(
                    announcement: announcement,
                    clubId: clubId,
                  ),
                ),
              );
            }
          }
          break;

        case 'team_message':
          final channelId = data['channel_id'] as String?;
          if (channelId != null) {
            final doc = await FirebaseFirestore.instance
                .collection('clubs')
                .doc(clubId)
                .collection('team_channels')
                .doc(channelId)
                .get()
                .timeout(_notificationTapTimeout);
            if (doc.exists) {
              final channel = TeamChannel.fromFirestore(doc);
              _navigatorKey.currentState!.push(
                MaterialPageRoute(
                  builder: (_) => TeamChatScreen(channel: channel),
                ),
              );
            }
          }
          break;

        case 'session_message':
          final sessionId = data['session_id'] as String?;
          final groupType = data['group_type'] as String?;
          final groupLevel = data['group_level'] as String?;
          if (sessionId != null) {
            final doc = await FirebaseFirestore.instance
                .collection('clubs')
                .doc(clubId)
                .collection('piscine_sessions')
                .doc(sessionId)
                .get()
                .timeout(_notificationTapTimeout);
            if (doc.exists) {
              final session = PiscineSession.fromFirestore(doc);
              // Déterminer le type de groupe
              SessionGroupType sessionGroupType = SessionGroupType.encadrants;
              String displayName = 'Encadrants';
              if (groupType == 'accueil') {
                sessionGroupType = SessionGroupType.accueil;
                displayName = 'Accueil';
              } else if (groupType == 'niveau' &&
                  groupLevel != null &&
                  groupLevel.isNotEmpty) {
                sessionGroupType = SessionGroupType.niveau;
                displayName = 'Niveau $groupLevel';
              }
              final chatGroup = SessionChatGroup(
                type: sessionGroupType,
                level: groupType == 'niveau' ? groupLevel : null,
                displayName: displayName,
              );
              _navigatorKey.currentState!.push(
                MaterialPageRoute(
                  builder: (_) => SessionChatScreen(
                    session: session,
                    chatGroup: chatGroup,
                  ),
                ),
              );
            }
          }
          break;

        case 'piscine_task_assigned':
        case 'session_reminder':
          final sessionId = data['session_id'] as String?;
          if (sessionId != null) {
            final doc = await FirebaseFirestore.instance
                .collection('clubs')
                .doc(clubId)
                .collection('piscine_sessions')
                .doc(sessionId)
                .get()
                .timeout(_notificationTapTimeout);
            if (doc.exists) {
              final session = PiscineSession.fromFirestore(doc);
              _navigatorKey.currentState!.push(
                MaterialPageRoute(
                  builder: (_) => SessionDetailScreen(session: session),
                ),
              );
            }
          }
          break;

        case 'exercice_declared':
        case 'exercice_digest':
          _navigatorKey.currentState!.push(
            MaterialPageRoute(
              builder: (_) => const CommunicationHubScreen(),
            ),
          );
          break;

        // Fix #9: medical certificate status change
        // De Cloud Function `onMedicalCertStatusChange` stuurt type='medical_certificate'.
        case 'medical_certificate':
          final medUserId = FirebaseAuth.instance.currentUser?.uid;
          if (medUserId != null) {
            _navigatorKey.currentState?.push(
              MaterialPageRoute(
                builder: (_) => MedicalCertificationScreen(userId: medUserId),
              ),
            );
          }
          break;

        case 'logbook_dive_confirmation':
        case 'logbook_dive_confirmation_result':
          final confirmationId = data['confirmation_id'] as String?;
          if (confirmationId != null && confirmationId.isNotEmpty) {
            _navigatorKey.currentState!.push(
              MaterialPageRoute(
                builder: (_) => LogbookDiveConfirmationScreen(
                  confirmationId: confirmationId,
                  clubId: clubId,
                ),
              ),
            );
          }
          break;

        default:
          debugPrint('⚠️ Unknown notification type: $type');
      }
    } on TimeoutException {
      debugPrint(
          '⚠️ Notification tap: Firestore read timed out for type=$type');
    } catch (e) {
      debugPrint('❌ Error handling notification tap: $e');
    }
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
