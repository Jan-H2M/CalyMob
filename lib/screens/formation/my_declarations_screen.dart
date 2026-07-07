import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../services/exercise_claim_service.dart';

/// WP-16 (S5) — « Mes déclarations ».
///
/// L'élève voit l'état de TOUTES ses déclarations d'exercices (claims), hors
/// inbox : en attente / validées / refusées (avec la raison). Lecture seule ;
/// la re-soumission d'un claim refusé se fait depuis l'inbox (WP-02).
class MyDeclarationsScreen extends StatefulWidget {
  const MyDeclarationsScreen({super.key});

  @override
  State<MyDeclarationsScreen> createState() => _MyDeclarationsScreenState();
}

class _MyDeclarationsScreenState extends State<MyDeclarationsScreen> {
  final ExerciseClaimService _service = ExerciseClaimService();
  final String _clubId = FirebaseConfig.defaultClubId;
  bool _loading = true;
  List<Map<String, dynamic>> _claims = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final uid = context.read<AuthProvider>().currentUser?.uid ?? '';
    if (uid.isEmpty) {
      setState(() => _loading = false);
      return;
    }
    final claims = await _service.fetchMyClaims(_clubId, uid);
    if (!mounted) return;
    setState(() {
      _claims = claims;
      _loading = false;
    });
  }

  static const _pending = ['draft', 'submitted', 'waiting_monitor', 'waiting_external_review'];

  DateTime? _date(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is String) return DateTime.tryParse(v);
    return null;
  }

  int _daysSince(dynamic v) {
    final d = _date(v);
    if (d == null) return 0;
    return DateTime.now().difference(d).inDays;
  }

  @override
  Widget build(BuildContext context) {
    final pending = _claims.where((c) => _pending.contains(c['status'])).toList();
    final validated = _claims.where((c) => c['status'] == 'accepted').toList();
    final refused = _claims.where((c) => c['status'] == 'rejected').toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mes déclarations'),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _claims.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text('Tu n\'as pas encore déclaré d\'exercice.',
                        style: TextStyle(color: Colors.grey.shade500)),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    _group('⏳ En attente (${pending.length})', pending, Colors.amber, (c) {
                      final monitor = (c['monitor_name'] ?? '').toString();
                      final days = _daysSince(c['created_at']);
                      final who = monitor.isNotEmpty ? 'chez $monitor ' : '';
                      return 'En attente ${who}depuis $days j';
                    }),
                    _group('✓ Validées (${validated.length})', validated, Colors.green, (c) {
                      final d = _date(c['decision']?['decided_at'] ?? c['updated_at']);
                      return d != null ? 'Validé le ${_fmt(d)}' : 'Validé';
                    }),
                    _group('✗ Refusées (${refused.length})', refused, Colors.red, (c) {
                      final reason = (c['decision']?['rejected_reason'] ??
                              c['decision']?['comment'] ??
                              '')
                          .toString();
                      return reason.isNotEmpty
                          ? 'Refusé : $reason'
                          : 'Refusé — re-soumets depuis ton inbox';
                    }),
                  ],
                ),
    );
  }

  String _fmt(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

  Widget _group(
    String title,
    List<Map<String, dynamic>> claims,
    Color color,
    String Function(Map<String, dynamic>) subtitle,
  ) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
            child: Text(title,
                style: TextStyle(
                    fontWeight: FontWeight.w800, color: AppColors.donkerblauw)),
          ),
          if (claims.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
              child: Text('Aucune', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
            )
          else
            ...claims.map((c) {
              final code = (c['exercise_code'] ?? c['exercise_id'] ?? '?').toString();
              return ListTile(
                dense: true,
                leading: Container(width: 8, height: 8,
                    decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
                title: Text(code, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(subtitle(c), style: const TextStyle(fontSize: 12)),
              );
            }),
        ],
      ),
    );
  }
}
