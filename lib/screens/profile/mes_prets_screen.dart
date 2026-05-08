import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../utils/epc_qr_code.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../boutique/boutique_feature_guard.dart';

/// Écran affichant les prêts de matériel du membre
///
/// Affiche la liste des prêts d'inventaire (inventory_loans)
/// avec leur statut (actif, rendu, en retard) et les informations
/// de caution.
class MesPretsScreen extends StatefulWidget {
  const MesPretsScreen({super.key});

  @override
  State<MesPretsScreen> createState() => _MesPretsScreenState();
}

class _MesPretsScreenState extends State<MesPretsScreen> {
  static const String _clubIban = 'BE59 0019 2378 3012';
  static const String _clubBeneficiary = 'Calypso Diving Club';
  String? _selectedLoanId;
  bool _showCautionQr = false;
  String? _cautionEpcPayload;

  void _generateCautionQr(String loanId, double cautionMontant) {
    final ogm = _generateOgm(loanId);
    final cleanIban = _clubIban.replaceAll(RegExp(r'\s'), '');
    final payload = generateEpcPayload(EpcQrCodeData(
      iban: cleanIban,
      beneficiaryName: _clubBeneficiary,
      amount: cautionMontant,
      reference: ogm,
    ));
    setState(() {
      _cautionEpcPayload = payload;
      _showCautionQr = true;
    });
  }

  String _generateOgm(String loanId) {
    final hash = loanId.hashCode.abs();
    final base = (hash % 10000000000).toString().padLeft(10, '0');
    final check = base.hashCode % 97 == 0 ? 97 : base.hashCode % 97;
    final checkStr = check.toString().padLeft(2, '0');
    final raw = '$base$checkStr';
    return '${raw.substring(0, 3)}/${raw.substring(3, 7)}/${raw.substring(7, 12)}';
  }

  @override
  Widget build(BuildContext context) {
    final userId = context.watch<AuthProvider>().currentUser?.uid ?? '';

    return BoutiqueFeatureGuard(
      child: Scaffold(
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          title: const Text('Mes prêts'),
          backgroundColor: Colors.transparent,
          elevation: 0,
        ),
        body: OceanGradientBackground(
          creatures: CreatureSet.fishAndBubbles,
          child: SafeArea(
            child: _buildLoansList(userId),
          ),
        ),
      ),
    );
  }

  Widget _buildLoansList(String userId) {
    if (userId.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.white),
      );
    }

    return RefreshIndicator(
      onRefresh: () async {
        setState(() {});
      },
      child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance
            .collection('clubs/${FirebaseConfig.defaultClubId}/inventory_loans')
            .where('memberId', isEqualTo: userId)
            .orderBy('createdAt', descending: true)
            .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(color: Colors.white),
            );
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline, size: 48, color: Colors.white70),
                    const SizedBox(height: 16),
                    Text(
                      'Erreur de chargement: ${snapshot.error}',
                      style: const TextStyle(color: Colors.white70),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            );
          }

          final loans = snapshot.data?.docs
                  .map((doc) => <String, dynamic>{
                        'id': doc.id,
                        ...doc.data(),
                      })
                  .toList() ??
              <Map<String, dynamic>>[];

          if (loans.isEmpty) {
            return const Center(
              child: Text(
                'Aucun prêt en cours.',
                style: TextStyle(color: Colors.white),
              ),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: loans.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final loan = loans[index];
              final isExpanded = _selectedLoanId == loan['id'];
              return _buildLoanCard(loan, isExpanded);
            },
          );
        },
      ),
    );
  }

  Widget _buildLoanCard(Map<String, dynamic> loan, bool isExpanded) {
    final status = loan['statut']?.toString() ?? 'actif';
    final cautionMontant = _asDouble(
      loan['montant_caution'] ?? loan['caution_montant'],
    );
    final cautionPayee = loan['caution_payee'] == true;
    final cautionRemboursee = loan['caution_remboursee'] == true;
    final dateDebut = _timestampToDate(
      loan['date_pret'] ?? loan['date_debut'],
    );
    final dateFinPrevue = _timestampToDate(
      loan['date_retour_prevue'] ?? loan['date_fin_prevue'],
    );
    final dateFinReelle = _timestampToDate(
      loan['date_retour_reel'] ?? loan['date_fin_reelle'],
    );
    final memberName = loan['memberName']?.toString() ?? '';
    final notes = loan['notes']?.toString();

    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          ListTile(
            contentPadding: const EdgeInsets.all(16),
            leading: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: _statusColor(status).withOpacity(0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                _statusIcon(status),
                color: _statusColor(status),
              ),
            ),
            title: Text(
              _statusLabel(status),
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: _statusColor(status),
              ),
            ),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (dateDebut != null)
                    Text(
                      'Du ${_formatDate(dateDebut)}',
                      style: const TextStyle(fontSize: 14),
                    ),
                  if (dateFinPrevue != null)
                    Text(
                      'Jusqu\'au ${_formatDate(dateFinPrevue)}',
                      style: const TextStyle(fontSize: 14),
                    ),
                  if (cautionMontant > 0) ...[
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Text(
                          'Caution: ${cautionMontant.toStringAsFixed(2)} €',
                          style: TextStyle(
                            fontSize: 13,
                            color: cautionPayee ? Colors.green : Colors.orange,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Icon(
                          cautionPayee
                              ? Icons.check_circle
                              : Icons.hourglass_empty,
                          size: 14,
                          color: cautionPayee ? Colors.green : Colors.orange,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          cautionPayee
                              ? (cautionRemboursee ? 'Remboursée' : 'Payée')
                              : 'Non payée',
                          style: TextStyle(
                            fontSize: 12,
                            color: cautionPayee ? Colors.green : Colors.orange,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            trailing: IconButton(
              icon: Icon(
                isExpanded ? Icons.expand_less : Icons.expand_more,
              ),
              onPressed: () {
                setState(() {
                  _selectedLoanId = isExpanded ? null : loan['id'] as String?;
                  _showCautionQr = false;
                });
              },
            ),
          ),
          if (isExpanded) ...[
            const Divider(height: 1, indent: 16, endIndent: 16),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Loan details
                  if (dateDebut != null)
                    _detailRow('Début', _formatDate(dateDebut)),
                  if (dateFinPrevue != null)
                    _detailRow('Retour prévu', _formatDate(dateFinPrevue)),
                  if (dateFinReelle != null)
                    _detailRow('Retour effectif', _formatDate(dateFinReelle)),
                  if (notes != null && notes.isNotEmpty)
                    _detailRow('Notes', notes),
                  const SizedBox(height: 12),

                  // Caution section
                  if (cautionMontant > 0) ...[
                    const Text(
                      'Caution',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 8),
                    _detailRow(
                      'Montant',
                      '${cautionMontant.toStringAsFixed(2)} €',
                    ),
                    _detailRow(
                      'Statut',
                      cautionPayee
                          ? (cautionRemboursee
                              ? 'Payée et remboursée'
                              : 'Payée')
                          : 'Non payée',
                    ),
                    if (!cautionPayee && _showCautionQr && _selectedLoanId == loan['id']) ...[
                      const SizedBox(height: 16),
                      _buildCautionQrCard(loan['id'] as String, cautionMontant),
                    ],
                    if (!cautionPayee && !_showCautionQr)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: () => _generateCautionQr(
                              loan['id'] as String,
                              cautionMontant,
                            ),
                            icon: const Icon(Icons.qr_code, size: 20),
                            label: const Text('Payer la caution'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildCautionQrCard(String loanId, double montant) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        children: [
          const Text(
            'Scannez pour payer la caution',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 12),
          if (_cautionEpcPayload != null && _cautionEpcPayload!.isNotEmpty)
            QrImageView(
              data: _cautionEpcPayload!,
              version: QrVersions.auto,
              size: 180,
              eyeStyle: const QrEyeStyle(
                eyeShape: QrEyeShape.square,
                color: Colors.black,
              ),
              dataModuleStyle: const QrDataModuleStyle(
                dataModuleShape: QrDataModuleShape.square,
                color: Colors.black,
              ),
            ),
          const SizedBox(height: 12),
          Text(
            '${montant.toStringAsFixed(2)} €',
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: () => setState(() => _showCautionQr = false),
            child: const Text('Fermer'),
          ),
        ],
      ),
    );
  }

  Widget _detailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey.shade600,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 14),
            ),
          ),
        ],
      ),
    );
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'actif':
      case 'en_cours':
        return Icons.swap_horiz;
      case 'rendu':
      case 'termine':
        return Icons.check_circle;
      case 'en_retard':
        return Icons.warning_amber_rounded;
      default:
        return Icons.inventory_2;
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'actif':
      case 'en_cours':
        return Colors.blue;
      case 'rendu':
      case 'termine':
        return Colors.green;
      case 'en_retard':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'actif':
      case 'en_cours':
        return 'Prêt en cours';
      case 'rendu':
      case 'termine':
        return 'Prêt terminé';
      case 'en_retard':
        return 'Prêt en retard';
      default:
        return status;
    }
  }

  double _asDouble(Object? value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  DateTime? _timestampToDate(Object? value) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    if (value is String) return DateTime.tryParse(value);
    return null;
  }

  String _formatDate(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}/'
        '${date.month.toString().padLeft(2, '0')}/'
        '${date.year}';
  }
}
