import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/cotisation/cotisation_models.dart';
import '../../models/member_profile.dart';
import '../../providers/auth_provider.dart';
import '../../services/cotisation/cotisation_service.dart';
import '../../services/profile_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class MaCotisationScreen extends StatefulWidget {
  final MemberProfile? profile;

  const MaCotisationScreen({
    super.key,
    this.profile,
  });

  @override
  State<MaCotisationScreen> createState() => _MaCotisationScreenState();
}

class _MaCotisationScreenState extends State<MaCotisationScreen> {
  final CotisationService _service = CotisationService();
  final ProfileService _profileService = ProfileService();
  bool _creating = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title:
            const Text('Ma cotisation', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.bubbles,
        child: SafeArea(
          child: widget.profile == null
              ? _buildProfileLoader()
              : _buildWithProfile(widget.profile!),
        ),
      ),
    );
  }

  Widget _buildProfileLoader() {
    final userId = context.watch<AuthProvider>().currentUser?.uid ?? '';

    if (userId.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.white),
      );
    }

    return StreamBuilder<MemberProfile?>(
      stream:
          _profileService.watchProfile(FirebaseConfig.defaultClubId, userId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(
            child: CircularProgressIndicator(color: Colors.white),
          );
        }

        final profile = snapshot.data;
        if (profile == null) {
          return const _CenteredNotice(
            title: 'Profil indisponible',
            message: 'Impossible de charger votre fiche membre.',
          );
        }

        return _buildWithProfile(profile);
      },
    );
  }

  Widget _buildWithProfile(MemberProfile profile) {
    return StreamBuilder<MembershipSeason?>(
      stream: _service.watchActiveSeason(FirebaseConfig.defaultClubId),
      builder: (context, seasonSnapshot) {
        if (seasonSnapshot.connectionState == ConnectionState.waiting) {
          return const Center(
            child: CircularProgressIndicator(color: Colors.white),
          );
        }

        final season = seasonSnapshot.data;
        if (season == null) {
          return const _CenteredNotice(
            title: 'Aucun tarif actif',
            message: 'Les cotisations ne sont pas encore configurées.',
          );
        }

        return StreamBuilder<List<CotisationPayment>>(
          stream: _service.watchMyPayments(
            clubId: FirebaseConfig.defaultClubId,
            memberId: profile.id,
          ),
          builder: (context, paymentSnapshot) {
            final payments = paymentSnapshot.data ?? const [];
            final activePayments = payments
                .where(
                  (payment) =>
                      payment.seasonId == season.id &&
                      (payment.status == 'awaiting_payment' ||
                          payment.status == 'paid'),
                )
                .toList();
            final activePayment =
                activePayments.isEmpty ? null : activePayments.first;

            return _buildContent(profile, season, activePayment);
          },
        );
      },
    );
  }

  Widget _buildContent(
    MemberProfile profile,
    MembershipSeason season,
    CotisationPayment? payment,
  ) {
    final formatter = NumberFormat.currency(
      locale: 'fr_BE',
      symbol: '€',
      decimalDigits: 2,
    );
    final period = profile.membershipPeriod ?? 'jan_dec';
    final tariff = season.tariffs.firstWhere(
      (entry) => entry.code == profile.membershipCategoryCode,
      orElse: () => const MembershipTariff(id: '', code: '', label: ''),
    );
    final price = tariff.priceForPeriod(period);
    final isOpen = season.paymentStatus == 'open';
    final canPay = isOpen &&
        tariff.code.isNotEmpty &&
        price != null &&
        price > 0 &&
        payment == null;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profile.fullName,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Saison ${season.label}',
                  style: TextStyle(
                    color: Colors.grey.shade700,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 18),
                _InfoLine(label: 'Type de membre', value: tariff.label),
                _InfoLine(label: 'Période', value: _periodLabel(period)),
                if (profile.cotisationValidite != null)
                  _InfoLine(
                    label: 'Cotisation actuelle',
                    value:
                        'valable jusqu’au ${DateFormat('dd/MM/yyyy').format(profile.cotisationValidite!)}',
                  ),
                _InfoLine(
                  label: 'Montant',
                  value: price == null
                      ? 'Non disponible'
                      : formatter.format(price),
                  highlight: true,
                ),
                if (profile.lifrasId?.isNotEmpty == true)
                  _InfoLine(label: 'ID LIFRAS', value: profile.lifrasId!),
                if (payment?.validityUntil != null)
                  _InfoLine(
                    label: 'Validité',
                    value: DateFormat('dd/MM/yyyy')
                        .format(payment!.validityUntil!),
                  ),
                const SizedBox(height: 18),
                if (!isOpen)
                  _StatusBox(
                    color: Colors.amber.shade50,
                    textColor: Colors.amber.shade900,
                    icon: Icons.lock_clock,
                    title: 'Cotisations fermées',
                    text: _closedPaymentMessage(season),
                  )
                else if (tariff.code.isEmpty)
                  const _StatusBox(
                    color: Color(0xFFFFEBEE),
                    textColor: Color(0xFFB71C1C),
                    icon: Icons.error_outline,
                    text: 'Votre type de membre n’est pas configuré.',
                  )
                else if (price == null || price <= 0)
                  const _StatusBox(
                    color: Color(0xFFFFEBEE),
                    textColor: Color(0xFFB71C1C),
                    icon: Icons.error_outline,
                    text: 'Aucun montant n’est disponible pour votre période.',
                  )
                else if (payment?.status == 'paid')
                  const _StatusBox(
                    color: Color(0xFFE8F5E9),
                    textColor: Color(0xFF1B5E20),
                    icon: Icons.check_circle_outline,
                    text: 'Votre cotisation est payée.',
                  )
                else if (payment != null)
                  _PaymentQr(payment: payment, formatter: formatter),
                if (canPay) ...[
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.middenblauw,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      onPressed: _creating ? null : _createPayment,
                      icon: _creating
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.qr_code_2),
                      label: Text(
                        _creating ? 'Création...' : 'Payer ma cotisation',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _createPayment() async {
    setState(() => _creating = true);
    try {
      await _service.createPayment(FirebaseConfig.defaultClubId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('QR de paiement créé')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Impossible de créer le paiement: $error')),
      );
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  String _periodLabel(String period) {
    return period == 'sept_dec' ? 'Sept → Déc+1' : 'Jan → Déc';
  }

  String _closedPaymentMessage(MembershipSeason season) {
    if (season.paymentMessage.trim().isNotEmpty) {
      return season.paymentMessage.trim();
    }
    return 'Les cotisations ${season.label} ne sont pas encore ouvertes aux membres. '
        'Le paiement sera disponible ici dès que le club aura ouvert la période.';
  }
}

class _PaymentQr extends StatelessWidget {
  final CotisationPayment payment;
  final NumberFormat formatter;

  const _PaymentQr({
    required this.payment,
    required this.formatter,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Center(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: QrImageView(
              data: payment.epcPayload ?? payment.communication,
              version: QrVersions.auto,
              size: 230,
            ),
          ),
        ),
        const SizedBox(height: 14),
        _InfoLine(
          label: 'À payer',
          value: formatter.format(payment.amount),
          highlight: true,
        ),
        _CopyLine(label: 'Communication', value: payment.communication),
        if (payment.iban?.isNotEmpty == true)
          _CopyLine(label: 'IBAN', value: payment.iban!),
      ],
    );
  }
}

class _InfoLine extends StatelessWidget {
  final String label;
  final String value;
  final bool highlight;

  const _InfoLine({
    required this.label,
    required this.value,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          SizedBox(
            width: 122,
            child: Text(
              label,
              style: TextStyle(
                color: Colors.grey.shade700,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value.isEmpty ? '-' : value,
              style: TextStyle(
                color: highlight ? AppColors.oranje : AppColors.donkerblauw,
                fontWeight: highlight ? FontWeight.w900 : FontWeight.w700,
                fontSize: highlight ? 18 : 15,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CopyLine extends StatelessWidget {
  final String label;
  final String value;

  const _CopyLine({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(child: _InfoLine(label: label, value: value)),
          IconButton(
            icon: const Icon(Icons.copy, size: 20),
            onPressed: () {
              Clipboard.setData(ClipboardData(text: value));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Copié')),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _StatusBox extends StatelessWidget {
  final Color color;
  final Color textColor;
  final IconData icon;
  final String? title;
  final String text;

  const _StatusBox({
    required this.color,
    required this.textColor,
    required this.icon,
    required this.text,
    this.title,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, color: textColor),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (title != null) ...[
                  Text(
                    title!,
                    style: TextStyle(
                      color: textColor,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 3),
                ],
                Text(
                  text,
                  style: TextStyle(
                    color: textColor,
                    fontWeight: FontWeight.w700,
                    height: 1.25,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CenteredNotice extends StatelessWidget {
  final String title;
  final String message;

  const _CenteredNotice({
    required this.title,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.card_membership_outlined,
                    color: AppColors.middenblauw, size: 42),
                const SizedBox(height: 10),
                Text(
                  title,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w900,
                    fontSize: 18,
                  ),
                ),
                const SizedBox(height: 6),
                Text(message, textAlign: TextAlign.center),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
