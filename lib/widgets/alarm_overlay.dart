import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../config/app_colors.dart';
import '../models/member_profile.dart';
import 'package:intl/intl.dart';

/// Red alarm overlay shown when member validation fails
/// Shows member name and what's wrong (expired certificate, unpaid cotisation)
class AlarmOverlay extends StatefulWidget {
  final MemberProfile member;
  final VoidCallback onDismiss;

  const AlarmOverlay({
    super.key,
    required this.member,
    required this.onDismiss,
  });

  @override
  State<AlarmOverlay> createState() => _AlarmOverlayState();

  /// Show the alarm overlay as a full-screen dialog
  static Future<void> show(BuildContext context, MemberProfile member) {
    return showDialog(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.transparent,
      builder: (context) => AlarmOverlay(
        member: member,
        onDismiss: () => Navigator.of(context).pop(),
      ),
    );
  }
}

class _AlarmOverlayState extends State<AlarmOverlay>
    with SingleTickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();

    // Play system alert sound
    _playAlarmSound();

    // Pulsing animation
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );

    _pulseAnimation = Tween<double>(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeInOut),
    );

    _animationController.repeat(reverse: true);
  }

  void _playAlarmSound() {
    // Use haptic feedback (vibration) as primary alert
    HapticFeedback.heavyImpact();
    
    // Play multiple times for alert effect
    Future.delayed(const Duration(milliseconds: 200), () {
      HapticFeedback.heavyImpact();
    });
    Future.delayed(const Duration(milliseconds: 400), () {
      HapticFeedback.heavyImpact();
    });
    
    // Also play system click sound repeatedly
    SystemSound.play(SystemSoundType.alert);
    Future.delayed(const Duration(milliseconds: 300), () {
      SystemSound.play(SystemSoundType.alert);
    });
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cotisationStatus = widget.member.cotisationStatus;
    final certificatStatus = widget.member.certificatStatus;
    final dateFormat = DateFormat('dd/MM/yyyy');

    return AnimatedBuilder(
      animation: _pulseAnimation,
      builder: (context, child) {
        return Container(
          color: Colors.red.withOpacity(0.9 * _pulseAnimation.value),
          child: SafeArea(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Warning icon
                Icon(
                  Icons.warning_amber_rounded,
                  size: 120 * _pulseAnimation.value,
                  color: Colors.white,
                ),

                const SizedBox(height: 24),

                // ACCÈS REFUSÉ title
                Text(
                  'ACCÈS REFUSÉ',
                  style: TextStyle(
                    fontSize: 36,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                    letterSpacing: 2,
                    shadows: [
                      Shadow(
                        color: Colors.black.withOpacity(0.3),
                        offset: const Offset(2, 2),
                        blurRadius: 4,
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 32),

                // Member name
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 24),
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    children: [
                      Text(
                        widget.member.fullName,
                        style: const TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                          color: Colors.red,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      if (widget.member.plongeurCode != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          widget.member.plongeurCode!,
                          style: TextStyle(
                            fontSize: 16,
                            color: Colors.grey[600],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),

                const SizedBox(height: 32),

                // Error messages
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 24),
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.95),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    children: [
                      // Certificat médical status
                      if (certificatStatus != ValidationStatus.valid)
                        _buildErrorRow(
                          icon: Icons.medical_services,
                          message: _getCertificatMessage(
                            certificatStatus,
                            widget.member.certificatMedicalValidite,
                            dateFormat,
                          ),
                        ),

                      if (cotisationStatus != ValidationStatus.valid &&
                          certificatStatus != ValidationStatus.valid)
                        const SizedBox(height: 16),

                      // Cotisation status
                      if (cotisationStatus != ValidationStatus.valid)
                        _buildErrorRow(
                          icon: Icons.euro,
                          message: _getCotisationMessage(
                            cotisationStatus,
                            widget.member.cotisationValidite,
                            dateFormat,
                          ),
                        ),
                    ],
                  ),
                ),

                const SizedBox(height: 48),

                // OK button
                ElevatedButton(
                  onPressed: widget.onDismiss,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: Colors.red,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 64,
                      vertical: 20,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(30),
                    ),
                    elevation: 8,
                  ),
                  child: const Text(
                    'OK',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildErrorRow({
    required IconData icon,
    required String message,
  }) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: Colors.red.withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(
            icon,
            color: Colors.red,
            size: 28,
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Text(
            '❌ $message',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: Colors.red,
            ),
          ),
        ),
      ],
    );
  }

  String _getCertificatMessage(
    ValidationStatus status,
    DateTime? validite,
    DateFormat dateFormat,
  ) {
    switch (status) {
      case ValidationStatus.expired:
        final dateStr = validite != null ? dateFormat.format(validite) : '';
        return 'Certificat médical expiré ($dateStr)';
      case ValidationStatus.warning:
        final dateStr = validite != null ? dateFormat.format(validite) : '';
        return 'Certificat médical expire bientôt ($dateStr)';
      case ValidationStatus.missing:
        return 'Certificat médical manquant';
      default:
        return 'Certificat médical non valide';
    }
  }

  String _getCotisationMessage(
    ValidationStatus status,
    DateTime? validite,
    DateFormat dateFormat,
  ) {
    switch (status) {
      case ValidationStatus.expired:
        final dateStr = validite != null ? dateFormat.format(validite) : '';
        return 'Cotisation non payée (expirée $dateStr)';
      case ValidationStatus.warning:
        final dateStr = validite != null ? dateFormat.format(validite) : '';
        return 'Cotisation expire bientôt ($dateStr)';
      case ValidationStatus.missing:
        return 'Cotisation non payée';
      default:
        return 'Cotisation non valide';
    }
  }
}
