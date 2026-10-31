import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../config/firebase_config.dart';
import '../../services/boutique/member_missions_service.dart';
import '../../widgets/boutique/boutique_operations_scaffold.dart';
import '../../widgets/boutique/boutique_access_guard.dart';
import '../expenses/create_expense_screen.dart';

class MemberMissionsScreen extends StatefulWidget {
  final void Function(MemberMission mission)? onExpense;
  final String clubId;
  final MemberMissionsService service;
  const MemberMissionsScreen({
    super.key,
    this.clubId = FirebaseConfig.defaultClubId,
    this.service = const MemberMissionsService(),
    this.onExpense,
  });
  @override
  State<MemberMissionsScreen> createState() => _MemberMissionsScreenState();
}

class _MemberMissionsScreenState extends State<MemberMissionsScreen> {
  List<MemberMission> _missions = [];
  bool _loading = true, _busy = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _missions = [];
    });
    try {
      final data = await widget.service.list(widget.clubId);
      if (mounted) {
        setState(() {
          _missions = (data['missions'] as List)
              .map(
                (row) => MemberMission(Map<String, dynamic>.from(row as Map)),
              )
              .toList();
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error =
              'Missions indisponibles. Vérifiez votre connexion et réessayez.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _change(MemberMission mission, String status) async {
    if (_busy) return;
    String? location;
    if (status == 'handed_over') {
      var enteredLocation = '';
      location = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Confirmer la remise'),
          content: TextField(
            onChanged: (value) => enteredLocation = value,
            maxLength: 120,
            decoration: const InputDecoration(
              labelText: 'Lieu de remise',
              hintText: 'Par exemple : piscine, local du club',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Annuler'),
            ),
            TextButton(
              onPressed: () {
                if (enteredLocation.trim().isNotEmpty) {
                  Navigator.pop(context, enteredLocation.trim());
                }
              },
              child: const Text('Confirmer Remis'),
            ),
          ],
        ),
      );
      if (location == null || !mounted) return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.service.update(
        widget.clubId,
        mission,
        status,
        location: location,
      );
      if (mounted) await _load();
    } catch (error) {
      if (mounted) {
        setState(() {
          _missions = [];
          _error = error is MemberMissionsException
              ? error.message
              : 'Connexion interrompue. Actualisez pour vérifier le résultat avant de réessayer.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  void _openExpense(MemberMission mission) {
    if (widget.onExpense != null) {
      widget.onExpense!(mission);
      return;
    }
    final ownerUid = BoutiqueAccessScope.maybeOf(context)?.userId;
    Navigator.push(
        context,
        boutiqueAccessGuardedRoute<void>(
          sourceContext: context,
          requiredSection: 'missions',
          builder: (_) => CreateExpenseScreen(
            originatingUid: ownerUid,
            boutiqueBatchId: mission.batchId,
            boutiqueOrderLabel: mission.orderLabel,
          ),
        ));
  }

  @override
  Widget build(BuildContext context) => BoutiqueOperationsScaffold(
        title: 'Mes missions',
        body: RefreshIndicator(
          onRefresh: _busy ? () async {} : _load,
          child: ListView(
            padding: const EdgeInsets.all(16),
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              const Text(
                'Merci de donner un coup de main à la Boutique ! Chaque ligne correspond à une pièce.',
              ),
              const SizedBox(height: 12),
              if (_loading)
                const Center(child: CircularProgressIndicator())
              else if (_error != null) ...[
                Text(_error!, key: const Key('missions-error')),
                TextButton(
                  onPressed: _busy ? null : _load,
                  child: const Text('Actualiser'),
                ),
              ] else if (_missions.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('Aucune mission ouverte. Merci pour ton aide !'),
                )
              else
                ..._missions.map(
                  (mission) => Card(
                    key: ValueKey(mission.id),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '1 × ${mission.article} · ${mission.size}',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          Text('Pour : ${mission.recipient}'),
                          Text(
                            'Commandée le ${mission.orderedAt == null ? 'date inconnue' : DateFormat('dd/MM/yyyy HH:mm').format(mission.orderedAt!.toLocal())}',
                          ),
                          if (mission.dueAt != null)
                            Text(
                              'À remettre de préférence avant le ${DateFormat('dd/MM/yyyy').format(mission.dueAt!.toLocal())}',
                            ),
                          Text(MemberMission.statusLabel(mission.status)),
                          Wrap(
                            spacing: 8,
                            children: mission.allowedNext
                                .map(
                                  (status) => FilledButton(
                                    onPressed: _busy
                                        ? null
                                        : () => _change(mission, status),
                                    child:
                                        Text(MemberMission.statusLabel(status)),
                                  ),
                                )
                                .toList(),
                          ),
                          TextButton(
                            onPressed:
                                _busy ? null : () => _openExpense(mission),
                            child: const Text('J’ai avancé des frais…'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: 16),
              const Text(
                'Tu as avancé des frais ? Introduis une note de frais avec ton ticket. Le lien avec une commande Boutique est facultatif.',
              ),
            ],
          ),
        ),
      );
}
