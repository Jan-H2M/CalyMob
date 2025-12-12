import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lottie/lottie.dart';
import '../../config/firebase_config.dart';
import '../../config/app_assets.dart';
import '../../providers/auth_provider.dart';
import '../../services/biometric_service.dart';
import '../home/landing_screen.dart';

/// Écran de login
class LoginScreen extends StatefulWidget {
  const LoginScreen({Key? key}) : super(key: key);

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final String _clubId = FirebaseConfig.defaultClubId;
  final BiometricService _biometricService = BiometricService();

  bool _obscurePassword = true;
  bool _biometricAvailable = false;
  bool _hasStoredCredentials = false;
  String _biometricTypeName = 'Biométrie';

  @override
  void initState() {
    super.initState();
    _checkBiometricAvailability();
  }

  Future<void> _checkBiometricAvailability() async {
    final available = await _biometricService.isBiometricAvailable();
    final hasCredentials = await _biometricService.hasStoredCredentials();
    final typeName = await _biometricService.getBiometricTypeName();

    if (mounted) {
      setState(() {
        _biometricAvailable = available;
        _hasStoredCredentials = hasCredentials;
        _biometricTypeName = typeName;
      });

      // Auto-trigger biometric login if credentials are stored
      if (available && hasCredentials) {
        _handleBiometricLogin();
      }
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin({bool saveBiometric = false}) async {
    if (!_formKey.currentState!.validate()) return;

    final authProvider = context.read<AuthProvider>();
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    try {
      await authProvider.login(
        email: email,
        password: password,
        clubId: _clubId,
      );

      // Save credentials for biometric login if enabled
      if (saveBiometric && _biometricAvailable) {
        await _biometricService.saveCredentials(email, password);
      }

      // Navigation vers landing page
      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const LandingScreen()),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceFirst('Exception: ', '')),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _handleBiometricLogin() async {
    final authenticated = await _biometricService.authenticate(
      reason: 'Authentifiez-vous pour accéder à CalyMob',
    );

    if (!authenticated) return;

    final credentials = await _biometricService.getCredentials();
    if (credentials == null) return;

    final authProvider = context.read<AuthProvider>();

    try {
      await authProvider.login(
        email: credentials['email']!,
        password: credentials['password']!,
        clubId: _clubId,
      );

      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const LandingScreen()),
        );
      }
    } catch (e) {
      if (mounted) {
        // Clear stored credentials if login fails
        await _biometricService.clearCredentials();
        setState(() {
          _hasStoredCredentials = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Session expirée. Veuillez vous reconnecter.'),
            backgroundColor: Colors.orange,
          ),
        );
      }
    }
  }

  Future<void> _handleLoginWithBiometricSetup() async {
    if (!_formKey.currentState!.validate()) return;

    if (_biometricAvailable && !_hasStoredCredentials) {
      // Ask user if they want to enable biometric login
      final enableBiometric = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('Activer $_biometricTypeName ?'),
          content: Text(
            'Voulez-vous utiliser $_biometricTypeName pour vous connecter plus rapidement ?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Non merci'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Activer'),
            ),
          ],
        ),
      );

      await _handleLogin(saveBiometric: enableBiometric ?? false);
    } else {
      await _handleLogin();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Stack(
        children: [
          // Volledige blauwe ocean achtergrond
          Positioned.fill(
            child: Image.asset(
              AppAssets.backgroundFull,
              fit: BoxFit.cover,
            ),
          ),

          // Bubbles animatie
          Positioned.fill(
            child: IgnorePointer(
              child: Lottie.asset(
                'assets/animations/bubbles.json',
                fit: BoxFit.cover,
                repeat: true,
              ),
            ),
          ),

          // Swimming fish animatie onderaan
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: IgnorePointer(
              child: Opacity(
                opacity: 0.9,
                child: Lottie.asset(
                  'assets/animations/swimming_fish.json',
                  width: double.infinity,
                  height: 250,
                  fit: BoxFit.cover,
                  repeat: true,
                ),
              ),
            ),
          ),


          // Login formulier
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24.0),
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // Logo Calypso
                      Image.asset(
                        'assets/images/logo-vertical-transparent.png',
                        height: 180,
                        fit: BoxFit.contain,
                      ),

                      const SizedBox(height: 48),

                      // Biometric login button (if available and has stored credentials)
                      if (_biometricAvailable && _hasStoredCredentials) ...[
                        SizedBox(
                          width: double.infinity,
                          height: 56,
                          child: OutlinedButton.icon(
                            onPressed: _handleBiometricLogin,
                            icon: Icon(
                              _biometricTypeName == 'Face ID'
                                  ? Icons.face
                                  : Icons.fingerprint,
                              size: 28,
                            ),
                            label: Text(
                              'Se connecter avec $_biometricTypeName',
                              style: const TextStyle(fontSize: 16),
                            ),
                            style: OutlinedButton.styleFrom(
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              side: const BorderSide(color: Colors.blue, width: 2),
                            ),
                          ),
                        ),
                        const SizedBox(height: 24),
                        Row(
                          children: [
                            const Expanded(child: Divider()),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 16),
                              child: Text(
                                'ou',
                                style: TextStyle(color: Colors.grey[600]),
                              ),
                            ),
                            const Expanded(child: Divider()),
                          ],
                        ),
                        const SizedBox(height: 24),
                      ],

                      // Champ email
                      AutofillGroup(
                        child: Column(
                          children: [
                            TextFormField(
                              controller: _emailController,
                              keyboardType: TextInputType.emailAddress,
                              autofillHints: const [AutofillHints.email, AutofillHints.username],
                              textInputAction: TextInputAction.next,
                              decoration: InputDecoration(
                                hintText: 'Email',
                                prefixIcon: const Icon(Icons.email),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                filled: true,
                                fillColor: Colors.white.withOpacity(0.9),
                              ),
                              validator: (value) {
                                if (value == null || value.isEmpty) {
                                  return 'Email requis';
                                }
                                if (!value.contains('@')) {
                                  return 'Email invalide';
                                }
                                return null;
                              },
                            ),

                            const SizedBox(height: 16),

                            // Champ mot de passe
                            TextFormField(
                              controller: _passwordController,
                              obscureText: _obscurePassword,
                              autofillHints: const [AutofillHints.password],
                              textInputAction: TextInputAction.done,
                              onFieldSubmitted: (_) => _handleLoginWithBiometricSetup(),
                              decoration: InputDecoration(
                                hintText: 'Mot de passe',
                                prefixIcon: const Icon(Icons.lock),
                                suffixIcon: IconButton(
                                  icon: Icon(_obscurePassword ? Icons.visibility : Icons.visibility_off),
                                  onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                                ),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                filled: true,
                                fillColor: Colors.white.withOpacity(0.9),
                              ),
                              validator: (value) {
                                if (value == null || value.isEmpty) {
                                  return 'Mot de passe requis';
                                }
                                return null;
                              },
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 24),

                      // Bouton login
                      Consumer<AuthProvider>(
                        builder: (context, authProvider, child) {
                          return SizedBox(
                            width: double.infinity,
                            height: 50,
                            child: ElevatedButton(
                              onPressed: authProvider.isLoading ? null : _handleLoginWithBiometricSetup,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.blue,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              child: authProvider.isLoading
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        color: Colors.white,
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Text(
                                      'Se connecter',
                                      style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.white,
                                      ),
                                    ),
                            ),
                          );
                        },
                      ),

                      const SizedBox(height: 16),

                      // Lien mot de passe oublié
                      TextButton(
                        onPressed: () {
                          // TODO: Implémenter reset password
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Fonctionnalité à venir')),
                          );
                        },
                        child: const Text('Mot de passe oublié ?'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
