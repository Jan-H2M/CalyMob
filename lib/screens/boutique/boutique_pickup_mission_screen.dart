import 'dart:async';
import 'package:flutter/material.dart';
import '../../widgets/boutique/boutique_operations_scaffold.dart';
import 'package:intl/intl.dart';
import '../../models/boutique/boutique_physical_unit.dart';
import '../../models/boutique/boutique_unit_qr.dart';
import '../../services/boutique/boutique_operations_service.dart';
import '../../widgets/boutique/boutique_access_guard.dart';
import 'boutique_qr_scan_screen.dart';
import 'boutique_handover_screen.dart';

class BoutiquePickupMissionScreen extends StatefulWidget {
  final String clubId, missionId;
  final bool manager;
  final BoutiqueOperationsService service;
  const BoutiquePickupMissionScreen(
      {super.key,
      required this.clubId,
      required this.missionId,
      required this.manager,
      this.service = const BoutiqueOperationsService()});
  @override
  State<BoutiquePickupMissionScreen> createState() =>
      _BoutiquePickupMissionScreenState();
}

class _BoutiquePickupMissionScreenState
    extends State<BoutiquePickupMissionScreen> {
  Map<String, dynamic>? _data;
  final _scanned = <String, BoutiquePhysicalUnit>{};
  final _search = TextEditingController();
  bool _loading = true, _busy = false;
  String? _error;
  Map<String, dynamic>? _pending;
  Timer? _timer;
  String get _section => widget.manager ? 'gestion' : 'remises';
  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 12), (_) {
      if (ModalRoute.of(context)?.isCurrent == true && !_busy) {
        _load(quiet: true);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet && mounted) setState(() => _loading = true);
    try {
      final data = await widget.service
          .call(widget.clubId, 'mission', {'missionId': widget.missionId});
      if (mounted) {
        setState(() {
          _data = data;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = BoutiqueOperationsService.message(e);
          _data = null;
          _scanned.clear();
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<String> _scanArrival(String value) async {
    final qr = BoutiqueUnitQr.parse(value);
    if (qr == null || qr.clubId != widget.clubId) {
      throw const FormatException('Scannez une fiche article de ce club.');
    }
    if (_scanned.containsKey(qr.unitId)) {
      throw const FormatException('Cette pièce est déjà sélectionnée.');
    }
    final u = await widget.service
        .lookup(widget.clubId, qr.unitId, missionId: widget.missionId);
    if (u.data['transportMissionId'] != widget.missionId) {
      throw const FormatException(
          'Cette pièce ne fait plus partie du transport à réceptionner.');
    }
    if (!mounted) throw const FormatException('Mission fermée.');
    setState(() => _scanned[u.id] = u);
    return '${_scanned.length} pièce(s) présente(s) à réceptionner';
  }

  Future<void> _arrive() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_pending == null) {
        final request = {
          'expectedActorId': BoutiqueAccessScope.maybeOf(context)!.userId,
          'missionId': widget.missionId,
          'units': _scanned.values.map((u) => u.selection).toList(),
          'idempotencyKey': BoutiqueOperationsService.confirmationKey()
        };
        final p = await widget.service
            .call(widget.clubId, 'arrive', {...request, 'preview': true});
        if (!mounted) return;
        final confirmed = await showDialog<bool>(
            context: context,
            builder: (context) => AlertDialog(
                    title: Text('Réceptionner ${p['count']} pièce(s) ?'),
                    content: Text(
                        'Je confirme leur présence physique à ${p['destination']}.\n\n${p['notificationCount']} acheteur(s) sera/seront averti(s). ${(p['heldOrders'] as List).length} commande(s) restent en attente (paiement ou préparation).${(p['heldOrders'] as List).any((h) => h['reason'] == 'regroup') ? '\nDes commandes sont réparties entre plusieurs missions : demandez au responsable de les regrouper.' : ''}'),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text('Revoir')),
                      FilledButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const Text('Confirmer l’arrivée'))
                    ]));
        if (!mounted || confirmed != true) return;
        _pending = request;
      }
      await widget.service.call(widget.clubId, 'arrive', _pending!);
      _pending = null;
      _scanned.clear();
      if (mounted) await _load();
    } catch (e) {
      if (BoutiqueOperationsService.definitiveFailure(e)) {
        _pending = null;
        _scanned.clear();
      }
      if (mounted) {
        setState(() => _error = BoutiqueOperationsService.message(e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _revoke() async {
    final actorId = BoutiqueAccessScope.maybeOf(context)!.userId;
    final yes = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
                title: const Text('Retirer cette mission ?'),
                content: const Text(
                    'Les personnes désignées perdent leur accès à ce lot. Le lieu physique reste inchangé. Les articles en transport devront être localisés avant une nouvelle mission.'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(c, false),
                      child: const Text('Conserver')),
                  FilledButton(
                      onPressed: () => Navigator.pop(c, true),
                      child: const Text('Retirer la mission'))
                ]));
    if (!mounted || yes != true) return;
    setState(() => _busy = true);
    try {
      await widget.service.call(widget.clubId, 'revoke', {
        'expectedActorId': actorId,
        'missionId': widget.missionId,
        'idempotencyKey': BoutiqueOperationsService.confirmationKey()
      });
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(() => _error = BoutiqueOperationsService.message(e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mission = (_data?['mission'] as Map?) ?? {};
    final packets = (_data?['packets'] as List? ?? [])
        .where((p) => '${p['buyerName']} ${p['orderNumber']}'
            .toLowerCase()
            .contains(_search.text.toLowerCase()))
        .toList();
    final units = (_data?['units'] as List? ?? []);
    final inTransit =
        units.where((u) => u['transportMissionId'] == widget.missionId).length;
    return BoutiqueOperationsScaffold(
        title: 'Transport et remises',
        actions: [
          IconButton(
              tooltip: 'Actualiser',
              onPressed: _busy ? null : () => _load(),
              icon: const Icon(Icons.refresh))
        ],
        body: RefreshIndicator(
            onRefresh: _load,
            child: ListView(padding: const EdgeInsets.all(16), children: [
              if (_loading) const LinearProgressIndicator(),
              if (_error != null)
                Text(_error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
              if (_data != null) ...[
                Text('${mission['destination']}',
                    style: Theme.of(context).textTheme.headlineSmall),
                Text('${mission['pickupWindow']}'),
                Text(
                    '${mission['arrived']}/${mission['total']} arrivée(s) · ${mission['delivered']} remise(s)'),
                Text(
                    'Équipe : ${(mission['assigneeNames'] as List? ?? []).join(', ')}'),
                Text(
                    'Valable jusqu’au ${DateFormat('dd/MM/yyyy à HH:mm').format(DateTime.parse(mission['expiresAt'] as String).toLocal())}'),
                if (mission['allowPartial'] == true)
                  const Text(
                      'Remises partielles autorisées par le responsable.'),
                const SizedBox(height: 20),
                if (inTransit > 0 || _pending != null) ...[
                  FilledButton.icon(
                      onPressed: _busy || _pending != null
                          ? null
                          : () => Navigator.push(
                              context,
                              boutiqueAccessGuardedRoute(
                                  sourceContext: context,
                                  requiredSection: _section,
                                  builder: (_) => BoutiqueQrScanScreen(
                                      title: 'Réceptionner le lot',
                                      instruction:
                                          'Scannez chaque pièce réellement arrivée à ${mission['destination']}.',
                                      onScan: _scanArrival))),
                      icon: const Icon(Icons.qr_code_scanner),
                      label: Text(
                          'Scanner les arrivées · $inTransit attendue(s)')),
                  ..._scanned.values.map((u) => ListTile(
                      title: Text(u.name),
                      subtitle: Text('${u.variant} · ${u.customerName}'),
                      trailing: IconButton(
                          tooltip: 'Retirer de la réception',
                          onPressed: _busy || _pending != null
                              ? null
                              : () => setState(() => _scanned.remove(u.id)),
                          icon: const Icon(Icons.close)))),
                  FilledButton(
                      onPressed: _busy || (_scanned.isEmpty && _pending == null)
                          ? null
                          : _arrive,
                      child: Text(_pending != null
                          ? 'Vérifier la confirmation en attente'
                          : 'Confirmer ${_scanned.length} arrivée(s)')),
                ],
                const SizedBox(height: 20),
                Text('À remettre aux acheteurs',
                    style: Theme.of(context).textTheme.titleLarge),
                TextField(
                    controller: _search,
                    decoration: const InputDecoration(
                        labelText: 'Rechercher un membre ou une commande',
                        prefixIcon: Icon(Icons.search)),
                    onChanged: (_) => setState(() {})),
                if (packets.isEmpty)
                  const Padding(
                      padding: EdgeInsets.all(16),
                      child: Text(
                          'Aucun colis à remettre pour ce filtre. Réceptionnez les articles avant la remise.')),
                ...packets.map((p) => Card(
                    child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${p['buyerName']}',
                                  style:
                                      Theme.of(context).textTheme.titleMedium),
                              Text(
                                  '${p['orderNumber']} · ${(p['units'] as List).length} pièce(s)'),
                              if (p['partial'] == true)
                                Text(
                                    'Commande partielle · ${p['remaining']} pièce(s) encore attendue(s)'),
                              if (p['ready'] != true)
                                Text('${p['blockedReason']}',
                                    style: TextStyle(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .error)),
                              FilledButton(
                                  onPressed: p['ready'] != true || _busy
                                      ? null
                                      : () async {
                                          final result = await Navigator.push(
                                              context,
                                              boutiqueAccessGuardedRoute(
                                                  sourceContext: context,
                                                  requiredSection: _section,
                                                  builder: (_) =>
                                                      BoutiqueHandoverScreen(
                                                          clubId: widget.clubId,
                                                          missionId:
                                                              widget.missionId,
                                                          packet: Map<String,
                                                                  dynamic>.from(
                                                              p as Map),
                                                          manager:
                                                              widget.manager,
                                                          service:
                                                              widget.service)));
                                          if (!mounted || !context.mounted) {
                                            return;
                                          }
                                          if (result is Map &&
                                              result['missionClosed'] == true) {
                                            Navigator.pop(context, true);
                                          } else {
                                            _load();
                                          }
                                        },
                                  child: const Text('Vérifier et remettre')),
                            ])))),
                if (widget.manager)
                  TextButton(
                      onPressed: _busy || _pending != null ? null : _revoke,
                      child: const Text('Retirer cette mission')),
              ],
            ])));
  }
}
