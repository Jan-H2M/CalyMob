import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/member_observation.dart';
import '../../providers/auth_provider.dart';
import '../../services/member_observation_service.dart';

/// Read-only progressie-overzicht voor het ingelogde lid.
/// Toont alle observaties gegroepeerd per categorie.
class MyProgressionScreen extends StatefulWidget {
  const MyProgressionScreen({super.key});

  @override
  State<MyProgressionScreen> createState() => _MyProgressionScreenState();
}

class _MyProgressionScreenState extends State<MyProgressionScreen> {
  final MemberObservationService _service = MemberObservationService();
  final String _clubId = FirebaseConfig.defaultClubId;
  List<MemberObservation> _observations = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  void _loadData() {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final memberId = authProvider.currentUser?.uid;
    if (memberId == null) return;

    _service.getObservationsForMember(_clubId, memberId).listen((obs) {
      if (mounted) {
        setState(() {
          _observations = obs;
          _loading = false;
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Ma Progression'),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _observations.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.school_outlined, size: 48,
                          color: Colors.grey.shade400),
                        const SizedBox(height: 12),
                        Text('Aucune observation enregistrée',
                          style: TextStyle(fontSize: 16,
                            color: Colors.grey.shade500)),
                        const SizedBox(height: 4),
                        Text('Tes moniteurs noteront ta progression ici.',
                          style: TextStyle(fontSize: 13,
                            color: Colors.grey.shade400)),
                      ],
                    ),
                  ),
                )
              : _buildContent(),
    );
  }

  Widget _buildContent() {
    // Group by category
    final grouped = <String, List<MemberObservation>>{};
    for (final obs in _observations) {
      grouped.putIfAbsent(obs.category, () => []).add(obs);
    }

    // Category labels
    const catLabels = {
      'exercice_lifras': 'Exercices LIFRAS',
      'theme_session': 'Thèmes de session',
      'technique': 'Technique',
      'securite': 'Sécurité',
      'attitude': 'Attitude',
      'general': 'Général',
    };

    // Stats summary
    final acquis = _observations.where((o) => o.result == 'acquis').length;
    final enProgres = _observations.where((o) => o.result == 'en_progres').length;
    final aRevoir = _observations.where((o) => o.result == 'a_revoir').length;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Summary card
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 8, offset: const Offset(0, 2),
            )],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _statItem('Acquis', acquis, Colors.green),
              _statItem('En progrès', enProgres, Colors.orange),
              _statItem('À revoir', aRevoir, Colors.red),
              _statItem('Total', _observations.length, AppColors.primary),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Categories
        ...grouped.entries.map((entry) {
          final catLabel = catLabels[entry.key] ?? entry.key;
          final obs = entry.value;
          return Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(catLabel,
                  style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                ...obs.map((o) => _observationTile(o)),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _statItem(String label, int count, Color color) {
    return Column(
      children: [
        Text('$count',
          style: TextStyle(
            fontSize: 24, fontWeight: FontWeight.bold, color: color)),
        Text(label,
          style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
      ],
    );
  }

  Widget _observationTile(MemberObservation obs) {
    final resultColors = {
      'acquis': Colors.green,
      'en_progres': Colors.orange,
      'a_revoir': Colors.red,
    };
    final resultLabels = {
      'acquis': 'Acquis',
      'en_progres': 'En progrès',
      'a_revoir': 'À revoir',
    };
    final color = resultColors[obs.result] ?? Colors.grey;
    final label = resultLabels[obs.result] ?? '—';
    final dateStr =
        '${obs.contextDate.day.toString().padLeft(2, '0')}/'
        '${obs.contextDate.month.toString().padLeft(2, '0')}';

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        children: [
          // Result badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(label,
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                color: color)),
          ),
          const SizedBox(width: 10),
          // Detail
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (obs.exerciceCode != null && obs.exerciceCode!.isNotEmpty)
                  Text(obs.exerciceCode!,
                    style: const TextStyle(fontSize: 13,
                      fontWeight: FontWeight.w500)),
                if (obs.themeTitle != null && obs.themeTitle!.isNotEmpty)
                  Text(obs.themeTitle!,
                    style: const TextStyle(fontSize: 13,
                      fontWeight: FontWeight.w500)),
                if (obs.note.isNotEmpty)
                  Text(obs.note,
                    style: TextStyle(fontSize: 12,
                      color: Colors.grey.shade600),
                    maxLines: 2, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          // Date + observer
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(dateStr,
                style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
              Text(obs.observerName,
                style: TextStyle(fontSize: 10, color: Colors.grey.shade400)),
            ],
          ),
        ],
      ),
    );
  }
}
