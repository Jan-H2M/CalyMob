import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/member_profile.dart';
import 'package:intl/intl.dart';

/// Severity of the alarm overlay.
///
/// * [critical] — blocks entry (red, "ACCÈS REFUSÉ"). Used for expired / missing
///   cotisation or certificat médical.
/// * [warning] — non-blocking caution (orange, "ATTENTION"). Used when a
///   certificate or cotisation expires soon (within 30 days). The operator can
///   still confirm and register the member.
enum AlarmSeverity { critical, warning }

/// Alarm overlay shown when member validation yields a warning or blocks entry.
///
/// Shows member name and what's wrong (expired/expiring certificate, unpaid
/// cotisation). Colour and copy adapt to [AlarmSeverity].
class AlarmOverlay extends StatefulWidget {
  final MemberProfile member;
  final AlarmSeverity severity;
  final VoidCallback onConfirm;
  final VoidCallback? onCancel;

  const AlarmOverlay({
    super.key,
    required this.member,
    required this.onConfirm,
    this.onCancel,
    this.severity = AlarmSeverity.critical,
  });

  @override
  State<AlarmOverlay> createState() => _AlarmOverlayState();

  /// Show the alarm overlay as a full-screen dialog.
  ///
  /// Returns:
  /// * `true` when the operator confirms (critical: acknowledges the block;
  ///   warning: chooses "Continuer" to register anyway).
  /// * `false` when the operator cancels (warning only — tap "Annuler").
  static Future<bool?> show(
    BuildContext context,
    MemberProfile member, {
    AlarmSeverity severity = AlarmSeverity.critical,
  }) {
    return showDialog<bool>(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.transparent,
      builder: (context) => AlarmOverlay(
        member: member,
        severity: severity,
        onConfirm: () => Navigator.of(context).pop(true),
        onCancel: severity == AlarmSeverity.warning
            ? () => Navigator.of(context).pop(false)
            : null,
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

    // Play alert feedback (stronger for critical, lighter for warning)
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
    if (widget.severity == AlarmSeverity.warning) {
      // Light, non-alarming feedback for an expiring — not expired — state.
      HapticFeedback.mediumImpact();
      SystemSound.play(SystemSoundType.click);
      return;
    }

    // Critical: strong repeated haptic + alert sound.
    HapticFeedback.heavyImpact();

    Future.delayed(const Duration(milliseconds: 200), () {
      HapticFeedback.heavyImpact();
    });
    Future.delayed(const Duration(milliseconds: 400), () {
      HapticFeedback.heavyImpact();
    });

    SystemSound.play(SystemSoundType.alert);
    Future.delayed(const Duration(milliseconds: 300), () {
      SystemSound.play(SystemSoundType.alert);
    });
  }

  // ---- severity-dependent visuals ----

  MaterialColor get _accent => widget.severity == AlarmSeverity.warning
      ? Colors.orange
      : Colors.red;

  String get _title => widget.severity == AlarmSeverity.warning
      ? 'ATTENTION'
      : 'ACCÈS REFUSÉ';

  IconData get _headerIcon => widget.severity == AlarmSeverity.warning
      ? Icons.warning_amber_rounded
      : Icons.warning_amber_rounded;

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cotisationStatus = widget.member.cotisationStatus;
    final certificatStatus = widget.member.certificatStatus;
    final assuranceStatus = widget.member.assuranceStatus;
    final dateFormat = DateFormat('dd/MM/yyyy');

    final isWarning = widget.severity == AlarmSeverity.warning;

    return AnimatedBuilder(
      animation: _pulseAnimation,
      builder: (context, child) {
        return Container(
          color: _accent.withOpacity(0.9 * _pulseAnimation.value),
          child: SafeArea(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Warning icon
                Icon(
                  _headerIcon,
                  size: 120 * _pulseAnimation.value,
                  color: Colors.white,
                ),

                const SizedBox(height: 24),

                // Title
                Text(
                  _title,
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
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                          color: _accent,
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

                // Error / warning messages
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

                      if (assuranceStatus != ValidationStatus.valid &&
                          (cotisationStatus != ValidationStatus.valid ||
                              certificatStatus != ValidationStatus.valid))
                        const SizedBox(height: 16),

                      // Assurance status
                      if (assuranceStatus != ValidationStatus.valid)
                        _buildErrorRow(
                          icon: Icons.shield,
                          message: _getAssuranceMessage(
                            assuranceStatus,
                            widget.member.assuranceValiditeEffective,
                            dateFormat,
                          ),
                        ),
                    ],
                  ),
                ),

                const SizedBox(height: 48),

                // Buttons: warning shows Annuler + Continuer, critical shows OK
                if (isWarning)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      OutlinedButton(
                        onPressed: widget.onCancel ?? widget.onConfirm,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: Colors.white, width: 2),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 28,
                            vertical: 18,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(30),
                          ),
                        ),
                        child: const Text(
                          'ANNULER',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      ElevatedButton(
                        onPressed: widget.onConfirm,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: _accent,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 32,
                            vertical: 18,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(30),
                          ),
                          elevation: 8,
                        ),
                        child: const Text(
                          'CONTINUER',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  )
                else
                  ElevatedButton(
                    onPressed: widget.onConfirm,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: _accent,
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
    final prefix = widget.severity == AlarmSeverity.warning ? '⚠️' : '❌';
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: _accent.withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(
            icon,
            color: _accent,
            size: 28,
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Text(
            '$prefix $message',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: _accent,
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

  String _getAssuranceMessage(
    ValidationStatus status,
    DateTime? validite,
    DateFormat dateFormat,
  ) {
    switch (status) {
      case ValidationStatus.expired:
        final dateStr = validite != null ? dateFormat.format(validite) : '';
        return 'Assurance expirée ($dateStr)';
      case ValidationStatus.warning:
        final dateStr = validite != null ? dateFormat.format(validite) : '';
        return 'Assurance expire bientôt ($dateStr)';
      case ValidationStatus.missing:
        return 'Assurance manquante';
      default:
        return 'Assurance non valide';
    }
  }
}
