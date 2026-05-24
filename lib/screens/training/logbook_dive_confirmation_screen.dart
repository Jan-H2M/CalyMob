import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class LogbookDiveConfirmationsInboxScreen extends StatelessWidget {
  const LogbookDiveConfirmationsInboxScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final userId = FirebaseAuth.instance.currentUser?.uid;
    const clubId = FirebaseConfig.defaultClubId;

    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _TopBar(
                title: 'Plongées à confirmer',
                onBack: () => Navigator.pop(context),
              ),
              Expanded(
                child: userId == null
                    ? const _EmptyMessage(text: 'Session expirée.')
                    : StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                        stream: FirebaseFirestore.instance
                            .collection('clubs')
                            .doc(clubId)
                            .collection('logbook_dive_confirmations')
                            .where('target_member_id', isEqualTo: userId)
                            .where('status', isEqualTo: 'pending')
                            .snapshots(),
                        builder: (context, snap) {
                          if (snap.connectionState == ConnectionState.waiting) {
                            return const Center(
                              child: CircularProgressIndicator(
                                  color: Colors.white),
                            );
                          }
                          if (snap.hasError) {
                            return _EmptyMessage(
                              text:
                                  'Impossible de charger les confirmations.\n${snap.error}',
                            );
                          }
                          final docs = [...(snap.data?.docs ?? const [])];
                          docs.sort((a, b) {
                            final aTs = a.data()['created_at'];
                            final bTs = b.data()['created_at'];
                            if (aTs is Timestamp && bTs is Timestamp) {
                              return bTs.compareTo(aTs);
                            }
                            return 0;
                          });
                          if (docs.isEmpty) {
                            return const _EmptyMessage(
                              text: 'Aucune plongée à confirmer.',
                            );
                          }
                          return ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                            itemCount: docs.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 10),
                            itemBuilder: (context, index) {
                              final doc = docs[index];
                              return _ConfirmationTile(
                                id: doc.id,
                                data: doc.data(),
                              );
                            },
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class LogbookDiveConfirmationScreen extends StatefulWidget {
  final String confirmationId;
  final String clubId;

  const LogbookDiveConfirmationScreen({
    super.key,
    required this.confirmationId,
    this.clubId = FirebaseConfig.defaultClubId,
  });

  @override
  State<LogbookDiveConfirmationScreen> createState() =>
      _LogbookDiveConfirmationScreenState();
}

class _LogbookDiveConfirmationScreenState
    extends State<LogbookDiveConfirmationScreen> {
  bool _submitting = false;

  DocumentReference<Map<String, dynamic>> get _ref => FirebaseFirestore.instance
      .collection('clubs')
      .doc(widget.clubId)
      .collection('logbook_dive_confirmations')
      .doc(widget.confirmationId);

  Future<void> _respond(String action, {String? matchedEntryId}) async {
    setState(() => _submitting = true);
    try {
      final result = await FirebaseFunctions.instanceFor(region: 'europe-west1')
          .httpsCallable('respondToLogbookDiveConfirmation')
          .call(<String, dynamic>{
        'clubId': widget.clubId,
        'confirmationId': widget.confirmationId,
        'action': action,
        if (matchedEntryId != null) 'matchedEntryId': matchedEntryId,
      });
      if (!mounted) return;
      final status = (result.data as Map?)?['status']?.toString() ?? '';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_statusSnack(status))),
      );
      Navigator.pop(context);
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message ?? 'Réponse impossible.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Réponse impossible: $e')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _statusSnack(String status) {
    switch (status) {
      case 'confirmed_copied':
        return 'Plongée confirmée et copiée dans ton carnet.';
      case 'confirmed_existing_identical':
        return 'Plongée confirmée: elle était déjà identique.';
      case 'confirmed_existing_different':
        return 'Plongée confirmée avec ta version existante.';
      case 'declined':
        return 'Plongée refusée.';
      default:
        return 'Réponse enregistrée.';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _TopBar(
                title: 'Confirmer la plongée',
                onBack: () => Navigator.pop(context),
              ),
              Expanded(
                child: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                  stream: _ref.snapshots(),
                  builder: (context, snap) {
                    if (snap.connectionState == ConnectionState.waiting) {
                      return const Center(
                        child: CircularProgressIndicator(color: Colors.white),
                      );
                    }
                    if (!snap.hasData || !snap.data!.exists) {
                      return const _EmptyMessage(
                        text: 'Cette confirmation est introuvable.',
                      );
                    }
                    return _DetailBody(
                      data: snap.data!.data() ?? const {},
                      submitting: _submitting,
                      onRespond: _respond,
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailBody extends StatelessWidget {
  final Map<String, dynamic> data;
  final bool submitting;
  final Future<void> Function(String action, {String? matchedEntryId})
      onRespond;

  const _DetailBody({
    required this.data,
    required this.submitting,
    required this.onRespond,
  });

  @override
  Widget build(BuildContext context) {
    final snapshot =
        Map<String, dynamic>.from((data['dive_snapshot'] as Map?) ?? {});
    final status = data['status'] as String? ?? 'pending';
    final matchType = data['match_type'] as String? ?? 'none';
    final matchedEntryId = data['matched_entry_id'] as String?;
    final sourceName = data['source_member_name'] as String? ?? 'Un membre';
    final differences = (data['differences'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        _GlassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$sourceName dit que vous avez fait cette plongée ensemble.',
                style: const TextStyle(
                  color: AppColors.donkerblauw,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 14),
              _DiveFacts(snapshot: snapshot),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (status != 'pending')
          _GlassCard(
            child: Text(
              _statusLabel(status),
              style: const TextStyle(
                color: AppColors.donkerblauw,
                fontWeight: FontWeight.w800,
              ),
            ),
          )
        else ...[
          if (matchType == 'identical')
            const _InfoCard(
              icon: Icons.verified_outlined,
              title: 'Cette plongée est déjà dans ton carnet',
              text:
                  'Les données principales sont identiques. Tu peux confirmer sans copier.',
            )
          else if (matchType == 'similar')
            _DifferencesCard(differences: differences)
          else
            const _InfoCard(
              icon: Icons.add_circle_outline,
              title: 'Pas encore dans ton carnet',
              text:
                  'Si tu confirmes, CalyMob copiera cette plongée dans ton carnet.',
            ),
          const SizedBox(height: 14),
          if (matchType == 'identical')
            _PrimaryAction(
              icon: Icons.check_circle_outline,
              label: 'Confirmer',
              submitting: submitting,
              onPressed: () => onRespond(
                'confirm_existing_identical',
                matchedEntryId: matchedEntryId,
              ),
            )
          else if (matchType == 'similar') ...[
            _PrimaryAction(
              icon: Icons.check_circle_outline,
              label: 'Confirmer et garder ma version',
              submitting: submitting,
              onPressed: () => onRespond(
                'confirm_keep_existing',
                matchedEntryId: matchedEntryId,
              ),
            ),
            const SizedBox(height: 8),
            _SecondaryAction(
              icon: Icons.sync_alt,
              label: 'Confirmer et remplacer par cette version',
              submitting: submitting,
              onPressed: () => onRespond(
                'confirm_replace_existing',
                matchedEntryId: matchedEntryId,
              ),
            ),
          ] else
            _PrimaryAction(
              icon: Icons.library_add_check_outlined,
              label: 'Confirmer et copier',
              submitting: submitting,
              onPressed: () => onRespond('confirm_copy'),
            ),
          const SizedBox(height: 8),
          _DeclineAction(
            submitting: submitting,
            onPressed: () => onRespond('decline'),
          ),
        ],
      ],
    );
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'confirmed_copied':
        return 'Confirmée et copiée dans ton carnet.';
      case 'confirmed_existing_identical':
        return 'Confirmée: tu avais déjà cette plongée identique.';
      case 'confirmed_existing_different':
        return 'Confirmée: tu avais déjà une version différente.';
      case 'declined':
        return 'Tu as refusé cette plongée.';
      default:
        return 'Statut: $status';
    }
  }
}

class _ConfirmationTile extends StatelessWidget {
  final String id;
  final Map<String, dynamic> data;

  const _ConfirmationTile({required this.id, required this.data});

  @override
  Widget build(BuildContext context) {
    final snapshot =
        Map<String, dynamic>.from((data['dive_snapshot'] as Map?) ?? {});
    final source = data['source_member_name'] as String? ?? 'Un membre';
    final location = snapshot['location_name'] as String? ?? 'Plongée';
    final date = _formatDate(snapshot['date']);
    final matchType = data['match_type'] as String? ?? 'none';
    return Material(
      color: Colors.white.withValues(alpha: 0.94),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => LogbookDiveConfirmationScreen(confirmationId: id),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Icon(
                matchType == 'identical'
                    ? Icons.verified_outlined
                    : matchType == 'similar'
                        ? Icons.compare_arrows
                        : Icons.scuba_diving_outlined,
                color: AppColors.middenblauw,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      source,
                      style: const TextStyle(
                        color: AppColors.donkerblauw,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '$location · $date',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: Colors.grey.shade700),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.middenblauw),
            ],
          ),
        ),
      ),
    );
  }
}

class _DiveFacts extends StatelessWidget {
  final Map<String, dynamic> snapshot;

  const _DiveFacts({required this.snapshot});

  @override
  Widget build(BuildContext context) {
    final facts = <Widget>[
      _Fact(
        icon: Icons.calendar_today_outlined,
        label: _formatDate(snapshot['date']),
      ),
      _Fact(
        icon: Icons.place_outlined,
        label: (snapshot['location_name'] as String?) ?? 'Lieu inconnu',
      ),
      if (snapshot['depth_max_meters'] is num)
        _Fact(
          icon: Icons.straighten,
          label:
              '${(snapshot['depth_max_meters'] as num).toStringAsFixed(0)} m',
        ),
      if (snapshot['duration_minutes'] is num)
        _Fact(
          icon: Icons.timer_outlined,
          label: '${(snapshot['duration_minutes'] as num).toInt()} min',
        ),
    ];
    return Wrap(spacing: 8, runSpacing: 8, children: facts);
  }
}

class _DifferencesCard extends StatelessWidget {
  final List<Map<String, dynamic>> differences;

  const _DifferencesCard({required this.differences});

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.compare_arrows, color: AppColors.middenblauw),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Tu avais déjà une plongée similaire',
                  style: TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (final diff in differences)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  SizedBox(
                    width: 92,
                    child: Text(
                      _fieldLabel(diff['field'] as String?),
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      '${_formatValue(diff['existing'])} → ${_formatValue(diff['source'])}',
                      style: TextStyle(color: Colors.grey.shade800),
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

class _InfoCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String text;

  const _InfoCard({
    required this.icon,
    required this.title,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.middenblauw),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(text, style: TextStyle(color: Colors.grey.shade700)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PrimaryAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool submitting;
  final VoidCallback onPressed;

  const _PrimaryAction({
    required this.icon,
    required this.label,
    required this.submitting,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton.icon(
        onPressed: submitting ? null : onPressed,
        icon: Icon(icon),
        label: Text(label),
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.middenblauw,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 13),
        ),
      ),
    );
  }
}

class _SecondaryAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool submitting;
  final VoidCallback onPressed;

  const _SecondaryAction({
    required this.icon,
    required this.label,
    required this.submitting,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        onPressed: submitting ? null : onPressed,
        icon: Icon(icon),
        label: Text(label),
        style: OutlinedButton.styleFrom(
          foregroundColor: Colors.white,
          side: const BorderSide(color: Colors.white),
          padding: const EdgeInsets.symmetric(vertical: 13),
        ),
      ),
    );
  }
}

class _DeclineAction extends StatelessWidget {
  final bool submitting;
  final VoidCallback onPressed;

  const _DeclineAction({required this.submitting, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: TextButton.icon(
        onPressed: submitting ? null : onPressed,
        icon: const Icon(Icons.close),
        label: const Text('Ce n’était pas ma plongée'),
        style: TextButton.styleFrom(foregroundColor: Colors.white),
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  final IconData icon;
  final String label;

  const _Fact({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.lichtblauw.withValues(alpha: 0.22),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: AppColors.donkerblauw),
          const SizedBox(width: 5),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.donkerblauw,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  final String title;
  final VoidCallback onBack;

  const _TopBar({required this.title, required this.onBack});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 16, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: onBack,
          ),
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GlassCard extends StatelessWidget {
  final Widget child;

  const _GlassCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _EmptyMessage extends StatelessWidget {
  final String text;

  const _EmptyMessage({required this.text});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white, fontSize: 16),
        ),
      ),
    );
  }
}

String _formatDate(dynamic raw) {
  DateTime? date;
  if (raw is Timestamp) date = raw.toDate();
  if (raw is DateTime) date = raw;
  if (date == null) return 'date inconnue';
  return '${date.day.toString().padLeft(2, '0')}/'
      '${date.month.toString().padLeft(2, '0')}/'
      '${date.year}';
}

String _fieldLabel(String? field) {
  switch (field) {
    case 'date':
      return 'Date';
    case 'location_name':
      return 'Lieu';
    case 'depth_max_meters':
      return 'Profondeur';
    case 'duration_minutes':
      return 'Durée';
    default:
      return field ?? 'Champ';
  }
}

String _formatValue(dynamic value) {
  if (value == null) return 'vide';
  if (value is num) return value.toString();
  return value.toString();
}
