/// Phase C.7 (2026-05-13) — Fullscreen QR scan mode.
///
/// Dedicated screen used when a member needs to flash his QR at the
/// pool gate. Per §3.1.10 / §13 C.7:
///
///   - Auto-brightness boost to 100% on open via `screen_brightness`,
///     previous brightness restored on close. Best-effort: on platforms
///     where the package fails (web), we render normally without boost.
///   - QR fills ≥80% of screen width, minimum 280 pt.
///   - Name + member identifier displayed underneath as visual fallback
///     for the gate keeper.
///   - Close via: X button top-right, swipe-down gesture, or system back.
///
/// Note re: screenshot blocking — Android FlagSecure / iOS privacy
/// screenshot guards are deferred. They require native channel plumbing
/// that isn't worth the extra risk for this iteration; spec §3.1.10 marks
/// the boost as the core feature, the FlagSecure as a hardening pass.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:screen_brightness/screen_brightness.dart';
import '../../models/member_profile.dart';

class FullscreenQrScreen extends StatefulWidget {
  final MemberProfile profile;
  const FullscreenQrScreen({super.key, required this.profile});

  @override
  State<FullscreenQrScreen> createState() => _FullscreenQrScreenState();
}

class _FullscreenQrScreenState extends State<FullscreenQrScreen> {
  double? _previousBrightness;
  bool _brightnessBoosted = false;

  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(
      SystemUiMode.immersiveSticky,
    );
    _boostBrightness();
  }

  Future<void> _boostBrightness() async {
    try {
      _previousBrightness = await ScreenBrightness.instance.application;
      await ScreenBrightness.instance.setApplicationScreenBrightness(1.0);
      if (mounted) setState(() => _brightnessBoosted = true);
    } catch (_) {
      // Web or unsupported platform — render normally.
    }
  }

  Future<void> _restoreBrightness() async {
    try {
      if (_previousBrightness != null) {
        await ScreenBrightness.instance
            .setApplicationScreenBrightness(_previousBrightness!);
      } else {
        await ScreenBrightness.instance.resetApplicationScreenBrightness();
      }
    } catch (_) {/* best effort */}
  }

  @override
  void dispose() {
    SystemChrome.setEnabledSystemUIMode(
      SystemUiMode.edgeToEdge,
    );
    _restoreBrightness();
    super.dispose();
  }

  void _close() {
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    // QR fills ≥80% of the shorter screen side, minimum 280 pt.
    final qrSize =
        (size.shortestSide * 0.80).clamp(280.0, 540.0).toDouble();
    final profile = widget.profile;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: GestureDetector(
          onVerticalDragEnd: (details) {
            // Swipe down to close.
            if ((details.primaryVelocity ?? 0) > 200) _close();
          },
          child: Stack(
            children: [
              // Close button (top-right)
              Positioned(
                top: 8,
                right: 8,
                child: IconButton(
                  iconSize: 28,
                  icon: const Icon(Icons.close, color: Colors.black87),
                  tooltip: 'Fermer',
                  onPressed: _close,
                ),
              ),
              Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 16,
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const SizedBox(height: 24),
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.18),
                              blurRadius: 18,
                              offset: const Offset(0, 6),
                            ),
                          ],
                        ),
                        child: QrImageView(
                          data: profile.id,
                          version: QrVersions.auto,
                          size: qrSize,
                          backgroundColor: Colors.white,
                          errorCorrectionLevel: QrErrorCorrectLevel.H,
                        ),
                      ),
                      const SizedBox(height: 24),
                      Text(
                        profile.fullName,
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          color: Colors.black87,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        profile.id,
                        style: TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 13,
                          color: Colors.grey.shade700,
                          letterSpacing: 0.8,
                        ),
                      ),
                      if (profile.plongeurNiveau != null) ...[
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.blue.shade50,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: Colors.blue.shade200),
                          ),
                          child: Text(
                            profile.plongeurNiveau!,
                            style: TextStyle(
                              color: Colors.blue.shade800,
                              fontWeight: FontWeight.bold,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 28),
                      if (_brightnessBoosted)
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.wb_sunny_outlined,
                                size: 14, color: Colors.grey.shade600),
                            const SizedBox(width: 4),
                            Text(
                              'Luminosité au maximum',
                              style: TextStyle(
                                fontSize: 11,
                                color: Colors.grey.shade600,
                              ),
                            ),
                          ],
                        ),
                      const SizedBox(height: 4),
                      Text(
                        'Glisse vers le bas pour quitter',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey.shade500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
