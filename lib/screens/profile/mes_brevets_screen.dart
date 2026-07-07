/// Carnet de Formation — « Mes brevets » (WP-08, PP-H).
///
/// Le membre voit l'historique de ses brevets (journalisé automatiquement par
/// la CF onPlongeurCodeChanged) et peut saisir lui-même ses dates
/// d'homologation passées (from='self_service'), uniquement pour des niveaux
/// ≤ son niveau actuel (décision D13). Il ne peut ni modifier ni supprimer.

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

/// Ordre canonique des niveaux (du plus bas au plus haut).
const List<String> _levelOrder = ['NB', '1', '2', '3', '4', 'AM', 'MC', 'MF', 'MN'];
const Map<String, String> _levelLabels = {
  'NB': 'NB', '1': '1★', '2': '2★', '3': '3★', '4': '4★',
  'AM': 'AM', 'MC': 'MC', 'MF': 'MF', 'MN': 'MN',
};

/// Normalise un plongeur_code ('P2', '2*', '2', 'NB'…) vers une clé de _levelOrder.
String _normalizeLevel(String? code) {
  if (code == null || code.isEmpty) return 'NB';
  final c = code.toUpperCase().replaceAll('★', '').replaceAll('*', '').replaceAll('P', '').trim();
  if (_levelOrder.contains(c)) return c;
  if (code.toUpperCase().startsWith('P') && _levelOrder.contains(c)) return c;
  // AM/MC/MF/MN pass through
  final up = code.toUpperCase();
  if (_levelOrder.contains(up)) return up;
  return 'NB';
}

int _levelIndex(String normalized) {
  final i = _levelOrder.indexOf(normalized);
  return i < 0 ? 0 : i;
}

class MesBrevetsScreen extends StatefulWidget {
  const MesBrevetsScreen({super.key});

  @override
  State<MesBrevetsScreen> createState() => _MesBrevetsScreenState();
}

class _MesBrevetsScreenState extends State<MesBrevetsScreen> {
  final _clubId = FirebaseConfig.defaultClubId;
  bool _saving = false;

  String get _uid => context.read<AuthProvider>().currentUser?.uid ?? '';

  CollectionReference<Map<String, dynamic>> _historyCol(String uid) =>
      FirebaseFirestore.instance
          .collection('clubs')
          .doc(_clubId)
          .collection('members')
          .doc(uid)
          .collection('brevet_history');

  @override
  Widget build(BuildContext context) {
    final uid = _uid;
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Mes brevets', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: uid.isEmpty
              ? const Center(child: CircularProgressIndicator(color: Colors.white))
              : StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                  stream: FirebaseFirestore.instance
                      .collection('clubs')
                      .doc(_clubId)
                      .collection('members')
                      .doc(uid)
                      .snapshots(),
                  builder: (context, memberSnap) {
                    final currentCode =
                        memberSnap.data?.data()?['plongeur_code'] as String?;
                    final currentNorm = _normalizeLevel(currentCode);
                    return _body(uid, currentNorm);
                  },
                ),
        ),
      ),
    );
  }

  Widget _body(String uid, String currentNorm) {
    return Column(
      children: [
        Expanded(
          child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: _historyCol(uid).snapshots(),
            builder: (context, snap) {
              final docs = [...(snap.data?.docs ?? const [])];
              docs.sort((a, b) {
                final ta = a.data()['effective_date'];
                final tb = b.data()['effective_date'];
                if (ta is Timestamp && tb is Timestamp) return tb.compareTo(ta);
                return 0;
              });
              if (docs.isEmpty) {
                return const Center(
                  child: Padding(
                    padding: EdgeInsets.all(32),
                    child: Text(
                      'Aucun brevet enregistré pour l\'instant.\nAjoute tes dates d\'homologation ci-dessous.',
                      style: TextStyle(color: Colors.white70),
                      textAlign: TextAlign.center,
                    ),
                  ),
                );
              }
              return ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                itemCount: docs.length,
                itemBuilder: (context, i) => _historyTile(docs[i].data()),
              );
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: ElevatedButton.icon(
            onPressed: _saving ? null : () => _showAddSheet(uid, currentNorm),
            icon: const Icon(Icons.add),
            label: const Text('Ajouter une date d\'homologation'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF006DB6),
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _historyTile(Map<String, dynamic> data) {
    final level = (data['level'] ?? '').toString();
    final norm = _normalizeLevel(level);
    final from = (data['from'] ?? '').toString();
    final ts = data['effective_date'];
    final date = ts is Timestamp ? ts.toDate() : null;
    final dateStr = date != null
        ? '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}'
        : '—';
    final source = from == 'self_service' ? 'saisi' : 'automatique';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: AppColors.middenblauw,
            child: Text(
              _levelLabels[norm] ?? level,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Brevet ${_levelLabels[norm] ?? level}',
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text('Homologué le $dateStr · $source',
                    style: TextStyle(
                      color: AppColors.donkerblauw.withValues(alpha: 0.6),
                      fontSize: 12,
                    )),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showAddSheet(String uid, String currentNorm) async {
    final maxIdx = _levelIndex(currentNorm);
    final allowed = _levelOrder.sublist(0, maxIdx + 1);
    String selected = allowed.isNotEmpty ? allowed.last : 'NB';
    DateTime? date;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetCtx) {
        return StatefulBuilder(
          builder: (context, setSheet) {
            return Padding(
              padding: EdgeInsets.fromLTRB(
                  16, 16, 16, MediaQuery.viewInsetsOf(sheetCtx).bottom + 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Ajouter un brevet',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  const Text(
                    'Uniquement des brevets jusqu\'à ton niveau actuel.',
                    style: TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                  const SizedBox(height: 16),
                  const Text('Brevet', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    children: allowed.map((lvl) {
                      final on = selected == lvl;
                      return ChoiceChip(
                        label: Text(_levelLabels[lvl] ?? lvl),
                        selected: on,
                        onSelected: (_) => setSheet(() => selected = lvl),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      const Text('Date : ', style: TextStyle(fontWeight: FontWeight.w700)),
                      Text(date == null
                          ? 'non choisie'
                          : '${date!.day.toString().padLeft(2, '0')}/${date!.month.toString().padLeft(2, '0')}/${date!.year}'),
                      const Spacer(),
                      TextButton.icon(
                        icon: const Icon(Icons.calendar_today, size: 18),
                        label: const Text('Choisir'),
                        onPressed: () async {
                          final picked = await showDatePicker(
                            context: sheetCtx,
                            initialDate: date ?? DateTime.now(),
                            firstDate: DateTime(1970),
                            lastDate: DateTime.now(),
                          );
                          if (picked != null) setSheet(() => date = picked);
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: date == null
                        ? null
                        : () async {
                            Navigator.of(sheetCtx).pop();
                            await _addEntry(uid, selected, date!);
                          },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF006DB6),
                      foregroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(46),
                    ),
                    child: const Text('Enregistrer'),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _addEntry(String uid, String level, DateTime date) async {
    setState(() => _saving = true);
    try {
      await _historyCol(uid).add({
        'level': level,
        'from': 'self_service',
        'effective_date': Timestamp.fromDate(date),
        'recorded_at': FieldValue.serverTimestamp(),
        'recorded_by': uid,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Brevet ajouté ✓')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur : $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}
