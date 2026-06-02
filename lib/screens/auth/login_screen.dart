import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../config/firebase_config.dart';
import '../../config/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/biometric_service.dart';
import '../../widgets/ocean_background.dart';
import '../home/landing_screen.dart';
import 'forgot_password_screen.dart';
import 'force_password_change_screen.dart';

/// Écran de login avec fond océan animé
class LoginScreen extends StatefulWidget {
  const LoginScreen({Key? key}) : super(key: key);

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  static const _lastLoginEmailKey = 'calymob_last_login_email';
  static const _defaultLoginEmail = 'jan@andriessens.be';

  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController(text: _defaultLoginEmail);
  final _passwordController = TextEditingController();
  final String _clubId = FirebaseConfig.defaultClubId;
  final BiometricService _biometricService = BiometricService();

  bool _obscurePassword = true;
  bool _biometricAvailable = false;
  bool _hasStoredCredentials = false;
  bool _biometricDeclined = false;
  String _biometricTypeName = 'Biométrie';

  @override
  void initState() {
    super.initState();
    _loadLastLoginEmail();
    _checkBiometricAvailability();
  }

  Future<void> _loadLastLoginEmail() async {
    final emailFromUrl = Uri.base.queryParameters['loginEmail']?.trim();
    if (emailFromUrl != null && emailFromUrl.isNotEmpty) {
      _emailController.text = emailFromUrl;
      return;
    }

    final prefs = await SharedPreferences.getInstance();
    final lastEmail = prefs.getString(_lastLoginEmailKey);
    if (!mounted) return;

    _emailController.text =
        lastEmail == null || lastEmail.isEmpty ? _defaultLoginEmail : lastEmail;
  }

  Future<void> _saveLastLoginEmail(String email) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_lastLoginEmailKey, email);
  }

  Future<void> _checkBiometricAvailability() async {
    final available = await _biometricService.isBiometricAvailable();
    final hasCredentials = await _biometricService.hasStoredCredentials();
    final declined = await _biometricService.hasExplicitlyDeclinedBiometric();
    final typeName = await _biometricService.getBiometricTypeName();

    if (mounted) {
      setState(() {
        _biometricAvailable = available;
        _hasStoredCredentials = hasCredentials;
        _biometricDeclined = declined;
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
    final memberProvider = context.read<MemberProvider>();
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    try {
      await authProvider.login(
        email: email,
        password: password,
        clubId: _clubId,
      );

      await _saveLastLoginEmail(email);

      if (authProvider.currentUser != null) {
        await memberProvider.loadMemberData(
          _clubId,
          authProvider.currentUser!.uid,
        );
      }

      if (saveBiometric && _biometricAvailable) {
        await _biometricService.saveCredentials(email, password);
      }

      if (memberProvider.requirePasswordChange) {
        if (mounted) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(
                builder: (_) => const ForcePasswordChangeScreen()),
          );
        }
        return;
      }

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
    final authProvider = context.read<AuthProvider>();
    final memberProvider = context.read<MemberProvider>();

    final authenticated = await _biometricService.authenticate(
      reason: 'Authentifiez-vous pour accéder à CalyMob',
    );

    if (!authenticated) return;

    final credentials = await _biometricService.getCredentials();
    if (credentials == null) return;

    try {
      await authProvider.login(
        email: credentials['email']!,
        password: credentials['password']!,
        clubId: _clubId,
      );

      if (authProvider.currentUser != null) {
        await memberProvider.loadMemberData(
          _clubId,
          authProvider.currentUser!.uid,
        );
      }

      if (memberProvider.requirePasswordChange) {
        await _biometricService.clearCredentials();
        setState(() {
          _hasStoredCredentials = false;
        });

        if (mounted) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(
                builder: (_) => const ForcePasswordChangeScreen()),
          );
        }
        return;
      }

      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const LandingScreen()),
        );
      }
    } catch (e) {
      if (mounted) {
        await _biometricService.clearCredentials();
        if (!mounted) return;
        setState(() {
          _hasStoredCredentials = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Session expirée. Veuillez vous reconnecter.'),
            backgroundColor: Colors.orange,
          ),
        );
      }
    }
  }

  void _handleForgotPassword() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const ForgotPasswordScreen()),
    );
  }

  Future<void> _handleLoginWithBiometricSetup() async {
    if (!_formKey.currentState!.validate()) return;

    if (_biometricAvailable && !_hasStoredCredentials && !_biometricDeclined) {
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

      if (enableBiometric == false) {
        await _biometricService.declineBiometric();
        setState(() {
          _biometricDeclined = true;
        });
      }

      await _handleLogin(saveBiometric: enableBiometric ?? false);
    } else {
      await _handleLogin();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: OceanBackground(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24.0),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Logo is now rendered as sun/moon in the ocean shader layer
                    const SizedBox(height: 200),

                    // Biometric login button
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
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            side: const BorderSide(
                                color: Colors.white54, width: 2),
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                      const Row(
                        children: [
                          Expanded(child: Divider(color: Colors.white38)),
                          Padding(
                            padding: EdgeInsets.symmetric(horizontal: 16),
                            child: Text('ou',
                                style: TextStyle(color: Colors.white60)),
                          ),
                          Expanded(child: Divider(color: Colors.white38)),
                        ],
                      ),
                      const SizedBox(height: 24),
                    ],

                    // Email field
                    AutofillGroup(
                      child: Column(
                        children: [
                          TextFormField(
                            controller: _emailController,
                            keyboardType: TextInputType.emailAddress,
                            autofillHints: const [
                              AutofillHints.email,
                              AutofillHints.username
                            ],
                            textInputAction: TextInputAction.next,
                            style: const TextStyle(color: Colors.black87),
                            decoration: InputDecoration(
                              hintText: 'Email',
                              prefixIcon: const Icon(Icons.email),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              filled: true,
                              fillColor: Colors.white.withValues(alpha: 0.9),
                            ),
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Email requis';
                              }
                              if (!value.contains('@')) return 'Email invalide';
                              return null;
                            },
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _passwordController,
                            obscureText: _obscurePassword,
                            autofillHints: const [AutofillHints.password],
                            textInputAction: TextInputAction.done,
                            onFieldSubmitted: (_) =>
                                _handleLoginWithBiometricSetup(),
                            style: const TextStyle(color: Colors.black87),
                            decoration: InputDecoration(
                              hintText: 'Mot de passe',
                              prefixIcon: const Icon(Icons.lock),
                              suffixIcon: IconButton(
                                icon: Icon(_obscurePassword
                                    ? Icons.visibility
                                    : Icons.visibility_off),
                                onPressed: () => setState(
                                    () => _obscurePassword = !_obscurePassword),
                              ),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              filled: true,
                              fillColor: Colors.white.withValues(alpha: 0.9),
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

                    // Login button
                    Consumer<AuthProvider>(
                      builder: (context, authProvider, child) {
                        return SizedBox(
                          width: double.infinity,
                          height: 50,
                          child: ElevatedButton(
                            onPressed: authProvider.isLoading
                                ? null
                                : _handleLoginWithBiometricSetup,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.middenblauw,
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

                    TextButton(
                      onPressed: _handleForgotPassword,
                      style:
                          TextButton.styleFrom(foregroundColor: Colors.white),
                      child: const Text(
                        'Mot de passe oublié ?',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w500,
                          shadows: [
                            Shadow(
                                offset: Offset(0, 1),
                                blurRadius: 2,
                                color: Colors.black38),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
