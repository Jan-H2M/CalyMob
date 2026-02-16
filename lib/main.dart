import 'dart:async';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:syncfusion_flutter_core/core.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:syncfusion_localizations/syncfusion_localizations.dart';

// Firebase options
import 'firebase_options.dart';

// Services
import 'services/notification_service.dart';
import 'services/deep_link_service.dart';

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

// Screens
import 'screens/auth/login_screen.dart';
import 'screens/auth/reset_password_screen.dart';
import 'screens/operations/operation_detail_screen.dart';
import 'screens/announcements/announcement_detail_screen.dart';
import 'screens/teams/team_chat_screen.dart';
import 'screens/piscine/session_chat_screen.dart';

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

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Register Syncfusion license
  SyncfusionLicense.registerLicense(
    'Ngo9BigBOggjHTQxAR8/V1JFaF1cXGFCf1FpRGpGfV5ycUVHYVZQRXxeQE0SNHVRdkdmWH1fcnVUR2FdU0J+W0pWYEg='
  );

  try {
    // Initialiser Firebase avec les options de configuration
    // Si déjà initialisé (par exemple après app restart), ne pas réinitialiser
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
      // Envoyer les erreurs Flutter non-attrapées à Crashlytics
      FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
      debugPrint('✅ Crashlytics initialisé');
    }

    // Initialiser les données de locale pour le français
    await initializeDateFormatting('fr_FR', null);
    Intl.defaultLocale = 'fr_FR';
    debugPrint('✅ Locale initialisée (fr_FR)');

    // Initialiser le service de notifications (pas sur web)
    // Note: Le handler en arrière-plan doit être enregistré avant runApp
    if (!kIsWeb) {
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    }

    final notificationService = NotificationService();
    await notificationService.initialize();
    // Configurer les handlers pour les notifications en foreground
    if (!kIsWeb) {
      notificationService.setupForegroundNotifications();
      // Note: le badge est mis à jour (pas effacé) dans _MyAppState.initState()
      // et NON ici, car la platform channel n'est pas encore prête avant runApp()
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

  // Wrapper runApp dans runZonedGuarded pour capturer les erreurs async
  // non-attrapées et les envoyer à Crashlytics
  if (kIsWeb) {
    runApp(const MyApp());
  } else {
    runZonedGuarded<Future<void>>(() async {
      runApp(const MyApp());
    }, (error, stack) {
      FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    });
  }
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
  }

  /// Gère la navigation quand l'utilisateur tape sur une notification push
  Future<void> _handleNotificationTap(RemoteMessage message) async {
    final data = message.data;
    final type = data['type'] as String?;
    final clubId = data['club_id'] as String? ?? FirebaseConfig.defaultClubId;

    debugPrint('🔔 Notification tap - type: $type, data: $data');

    if (type == null || _navigatorKey.currentState == null) {
      debugPrint('⚠️ Cannot handle notification tap: type=$type, navigator=${_navigatorKey.currentState != null}');
      return;
    }

    try {
      switch (type) {
        case 'event_message':
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
                .get();
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
                .get();
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
                .get();
            if (doc.exists) {
              final session = PiscineSession.fromFirestore(doc);
              // Déterminer le type de groupe
              SessionGroupType sessionGroupType = SessionGroupType.encadrants;
              String displayName = 'Encadrants';
              if (groupType == 'accueil') {
                sessionGroupType = SessionGroupType.accueil;
                displayName = 'Accueil';
              } else if (groupType == 'niveau' && groupLevel != null && groupLevel.isNotEmpty) {
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

        default:
          debugPrint('⚠️ Unknown notification type: $type');
      }
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
    } else if (state == AppLifecycleState.paused) {
      // Badge updaten bij vertrek uit app
      _updateBadgeFromUnreadCounts();
    }
  }

  /// Refresh de unread counts wanneer de app resumed wordt
  void _refreshUnreadCounts() {
    try {
      final unreadProvider = _navigatorKey.currentContext != null
          ? Provider.of<UnreadCountProvider>(_navigatorKey.currentContext!, listen: false)
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
    try {
      final unreadProvider = _navigatorKey.currentContext != null
          ? Provider.of<UnreadCountProvider>(_navigatorKey.currentContext!, listen: false)
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
    return MultiProvider(
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
      ],
      child: MaterialApp(
        navigatorKey: _navigatorKey,
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
              backgroundColor: AppColors.middenblauw,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
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
              borderSide: BorderSide(color: AppColors.middenblauw, width: 2),
            ),
          ),
        ),
        home: const LoginScreen(),
      ),
    );
  }
}
