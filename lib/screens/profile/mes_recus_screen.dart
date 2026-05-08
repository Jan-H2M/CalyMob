import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../boutique/boutique_feature_guard.dart';

/// Écran affichant les reçus/preuves de paiement du membre
class MesRecusScreen extends StatefulWidget {
  const MesRecusScreen({super.key});

  @override
  State<MesRecusScreen> createState() => _MesRecusScreenState();
}

enum _RecuFilter { tous, boutique, cotisation }

class _MesRecusScreenState extends State<MesRecusScreen> {
  _RecuFilter _filter = _RecuFilter.tous;

  @override
  Widget build(BuildContext context) {
    final userId = context.watch<AuthProvider>().currentUser?.uid ?? '';

    return BoutiqueFeatureGuard(
      child: Scaffold(
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          title: const Text('Mes reçus'),
          backgroundColor: Colors.transparent,
          elevation: 0,
        ),
        body: OceanGradientBackground(
          creatures: CreatureSet.fishAndBubbles,
          child: SafeArea(
            child: _buildContent(userId),
          ),
        ),
      ),
    );
  }

  Widget _buildContent(String userId) {
    if (userId.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.white),
      );
    }

    return RefreshIndicator(
      onRefresh: () async {
        setState(() {});
      },
      child: Column(
        children: [
          _buildFilterTabs(),
          Expanded(child: _buildRecusList(userId)),
        ],
      ),
    );
  }

  Widget _buildFilterTabs() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Row(
        children: [
          _buildFilterChip('Tous', _RecuFilter.tous),
          const SizedBox(width: 8),
          _buildFilterChip('Boutique', _RecuFilter.boutique),
          const SizedBox(width: 8),
          _buildFilterChip('Cotisation', _RecuFilter.cotisation),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String label, _RecuFilter filter) {
    final isSelected = _filter == filter;
    return FilterChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) => setState(() => _filter = filter),
      selectedColor: AppColors.primary.withOpacity(0.2),
      checkmarkColor: AppColors.primary,
      labelStyle: TextStyle(
        color: isSelected ? AppColors.primary : Colors.white,
        fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
      ),
      backgroundColor: Colors.white.withOpacity(0.15),
      side: BorderSide(
        color: isSelected ? AppColors.primary : Colors.white30,
      ),
    );
  }

  Widget _buildRecusList(String userId) {
    final clubPath = 'clubs/${FirebaseConfig.defaultClubId}';

    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _fetchRecus(clubPath, userId),
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

        var recus = snapshot.data ?? [];

        // Apply filter
        if (_filter == _RecuFilter.boutique) {
          recus = recus.where((r) => r['type'] == 'boutique').toList();
        } else if (_filter == _RecuFilter.cotisation) {
          recus = recus.where((r) => r['type'] == 'cotisation').toList();
        }

        if (recus.isEmpty) {
          return ListView(
            children: const [
              SizedBox(height: 80),
              Center(
                child: Text(
                  'Aucun reçu trouvé.',
                  style: TextStyle(color: Colors.white, fontSize: 16),
                ),
              ),
            ],
          );
        }

        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: recus.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (context, index) => _buildRecuCard(recus[index]),
        );
      },
    );
  }

  Future<List<Map<String, dynamic>>> _fetchRecus(
    String clubPath,
    String userId,
  ) async {
    final results = <Map<String, dynamic>>[];

    // 1. Boutique orders
    try {
      final boutiqueSnap = await FirebaseFirestore.instance
          .collection('$clubPath/boutique_orders')
          .where('memberId', isEqualTo: userId)
          .orderBy('createdAt', descending: true)
          .get();

      for (final doc in boutiqueSnap.docs) {
        final data = doc.data();
        results.add({
          'type': 'boutique',
          'id': doc.id,
          'title': 'Commande #${doc.id.substring(0, 6).toUpperCase()}',
          'amount': _asDouble(data['totalAmount'] ?? data['montant']),
          'date': _timestampToDate(data['createdAt'] ?? data['date']),
          'paid': data['paymentStatus'] == 'paid' || data['payee'] == true,
        });
      }
    } catch (_) {
      // Collection might not exist yet
    }

    // 2. Cotisation
    try {
      final cotisationSnap = await FirebaseFirestore.instance
          .doc('$clubPath/cotisations/$userId')
          .get();

      if (cotisationSnap.exists) {
        final data = cotisationSnap.data()!;
        final annee = data['annee'] ?? DateTime.now().year;
        results.add({
          'type': 'cotisation',
          'id': cotisationSnap.id,
          'title': 'Cotisation $annee',
          'amount': _asDouble(data['montant']),
          'date': _timestampToDate(data['date_paiement'] ?? data['created_at']),
          'paid': data['payee'] == true,
        });
      }
    } catch (_) {
      // Document might not exist
    }

    // Sort by date descending
    results.sort((a, b) {
      final dateA = a['date'] as DateTime?;
      final dateB = b['date'] as DateTime?;
      if (dateA == null && dateB == null) return 0;
      if (dateA == null) return 1;
      if (dateB == null) return -1;
      return dateB.compareTo(dateA);
    });

    return results;
  }

  Widget _buildRecuCard(Map<String, dynamic> recu) {
    final type = recu['type'] as String;
    final title = recu['title'] as String;
    final amount = recu['amount'] as double;
    final date = recu['date'] as DateTime?;
    final paid = recu['paid'] as bool;

    final isBoutique = type == 'boutique';

    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: (isBoutique ? AppColors.primary : Colors.teal).withOpacity(0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(
            isBoutique ? Icons.shopping_bag : Icons.card_membership,
            color: isBoutique ? AppColors.primary : Colors.teal,
          ),
        ),
        title: Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            if (date != null)
              Text(
                _formatDate(date),
                style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
              ),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: paid ? Colors.green.withOpacity(0.1) : Colors.orange.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                paid ? 'Payée' : 'En attente',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: paid ? Colors.green : Colors.orange,
                ),
              ),
            ),
          ],
        ),
        trailing: Text(
          '${amount.toStringAsFixed(2)} \u20ac',
          style: const TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 16,
          ),
        ),
      ),
    );
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
