import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../config/app_colors.dart';
import '../../models/member_profile.dart';

/// Widget displaying member validation status for attendance check-in
class MemberValidationCard extends StatelessWidget {
  final MemberProfile member;
  final VoidCallback? onCheckIn;
  final bool isLoading;
  final bool alreadyCheckedIn;

  const MemberValidationCard({
    Key? key,
    required this.member,
    this.onCheckIn,
    this.isLoading = false,
    this.alreadyCheckedIn = false,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Member info header
            _buildMemberHeader(),
            const SizedBox(height: 16),

            // Validation status cards
            Row(
              children: [
                Expanded(
                  child: _buildStatusCard(
                    'Cotisation',
                    member.cotisationStatus,
                    member.cotisationValidite,
                    Icons.card_membership,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildStatusCard(
                    'Certificat',
                    member.certificatStatus,
                    member.certificatMedicalValidite,
                    Icons.medical_services,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 16),

            // Check-in button
            if (onCheckIn != null) _buildCheckInButton(),
          ],
        ),
      ),
    );
  }

  Widget _buildMemberHeader() {
    return Row(
      children: [
        // Profile photo
        CircleAvatar(
          radius: 32,
          backgroundColor: AppColors.surfaceGrey,
          backgroundImage: member.photoUrl != null
              ? CachedNetworkImageProvider(member.photoUrl!)
              : null,
          child: member.photoUrl == null
              ? Icon(Icons.person, size: 32, color: AppColors.textSecondary)
              : null,
        ),
        const SizedBox(width: 16),

        // Name and level
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                member.fullName,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textPrimary,
                ),
              ),
              if (member.plongeurCode != null) ...[
                const SizedBox(height: 4),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.middenblauw.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    member.plongeurCode!,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.middenblauw,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStatusCard(
    String title,
    ValidationStatus status,
    DateTime? validUntil,
    IconData icon,
  ) {
    final colors = _getStatusColors(status);
    final statusText = _getStatusText(status);
    final daysText = _getDaysText(status, validUntil);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.border, width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: colors.text),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: colors.text.withOpacity(0.8),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(_getStatusIcon(status), size: 20, color: colors.text),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  statusText,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: colors.text,
                  ),
                ),
              ),
            ],
          ),
          if (daysText != null) ...[
            const SizedBox(height: 4),
            Text(
              daysText,
              style: TextStyle(
                fontSize: 11,
                color: colors.text.withOpacity(0.7),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildCheckInButton() {
    if (alreadyCheckedIn) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.surfaceGrey,
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.check_circle, color: AppColors.success),
            SizedBox(width: 8),
            Text(
              'Déjà enregistré aujourd\'hui',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.success,
              ),
            ),
          ],
        ),
      );
    }

    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: isLoading ? null : onCheckIn,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.middenblauw,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        icon: isLoading
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                ),
              )
            : const Icon(Icons.how_to_reg),
        label: Text(
          isLoading ? 'Enregistrement...' : 'Enregistrer Présence',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }

  IconData _getStatusIcon(ValidationStatus status) {
    switch (status) {
      case ValidationStatus.valid:
        return Icons.check_circle;
      case ValidationStatus.warning:
        return Icons.warning;
      case ValidationStatus.expired:
        return Icons.cancel;
      case ValidationStatus.missing:
        return Icons.help_outline;
    }
  }

  String _getStatusText(ValidationStatus status) {
    switch (status) {
      case ValidationStatus.valid:
        return 'Valide';
      case ValidationStatus.warning:
        return 'Expire bientôt';
      case ValidationStatus.expired:
        return 'Expiré';
      case ValidationStatus.missing:
        return 'Non défini';
    }
  }

  String? _getDaysText(ValidationStatus status, DateTime? validUntil) {
    if (validUntil == null) return null;

    final now = DateTime.now();
    final days = validUntil.difference(now).inDays;

    if (status == ValidationStatus.expired) {
      return 'Expiré depuis ${-days} jour${-days > 1 ? 's' : ''}';
    } else if (status == ValidationStatus.warning ||
        status == ValidationStatus.valid) {
      return 'Expire dans $days jour${days > 1 ? 's' : ''}';
    }
    return null;
  }

  _StatusColors _getStatusColors(ValidationStatus status) {
    switch (status) {
      case ValidationStatus.valid:
        return _StatusColors(
          background: Colors.green[50]!,
          border: Colors.green[300]!,
          text: Colors.green[800]!,
        );
      case ValidationStatus.warning:
        return _StatusColors(
          background: Colors.orange[50]!,
          border: Colors.orange[300]!,
          text: Colors.orange[800]!,
        );
      case ValidationStatus.expired:
        return _StatusColors(
          background: Colors.red[50]!,
          border: Colors.red[300]!,
          text: Colors.red[800]!,
        );
      case ValidationStatus.missing:
        return _StatusColors(
          background: Colors.grey[100]!,
          border: Colors.grey[300]!,
          text: Colors.grey[600]!,
        );
    }
  }
}

class _StatusColors {
  final Color background;
  final Color border;
  final Color text;

  _StatusColors({
    required this.background,
    required this.border,
    required this.text,
  });
}
