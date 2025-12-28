import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
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
import 'providers/operation_provider.dart';
import 'providers/expense_provider.dart';
import 'providers/announcement_provider.dart';
import 'providers/event_message_provider.dart';
import 'providers/payment_provider.dart';
import 'providers/exercice_valide_provider.dart';
import 'providers/availability_provider.dart';
import 'providers/activity_provider.dart';

// Screens
import 'screens/auth/login_screen.dart';
import 'screens/auth/reset_password_screen.dart';

// Config
import 'config/app_colors.dart';

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
      // Effacer le badge au démarrage de l'app
      await notificationService.clearBadge();
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

  runApp(const MyApp());
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
      // Effacer le badge quand l'app revient au premier plan
      _notificationService.clearBadge();
    }
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => OperationProvider()),
        ChangeNotifierProvider(create: (_) => ExpenseProvider()),
        ChangeNotifierProvider(create: (_) => AnnouncementProvider()),
        ChangeNotifierProvider(create: (_) => EventMessageProvider()),
        ChangeNotifierProvider(create: (_) => PaymentProvider()),
        ChangeNotifierProvider(create: (_) => ExerciceValideProvider()),
        ChangeNotifierProvider(create: (_) => AvailabilityProvider()),
        ChangeNotifierProvider(create: (_) => ActivityProvider()),
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
