import 'dart:async';
import 'package:flutter/material.dart';
import '../../services/boutique/boutique_operations_service.dart';
import '../../widgets/boutique/boutique_access_guard.dart';
import 'boutique_stock_session_screen.dart';
import 'boutique_receipt_selection_screen.dart';
import 'boutique_pickup_mission_screen.dart';

class BoutiqueManagementScreen extends StatefulWidget {
  final bool manager;
  final BoutiqueOperationsService service;
  const BoutiqueManagementScreen(
      {super.key,
      required this.manager,
      this.service = const BoutiqueOperationsService()});
  @override
  State<BoutiqueManagementScreen> createState() =>
      _BoutiqueManagementScreenState();
}

class _BoutiqueManagementScreenState extends State<BoutiqueManagementScreen> {
  final _location = TextEditingController();
  List<Map<String, dynamic>> _units = [], _missions = [], _assignees = [];
  String? _error;
  bool _loading = true, _more = false;
  Timer? _timer;
  String? _missionCursor;
  bool _moreMissions = false;
  int _missionPages = 1;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _load();
    });
    _timer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (ModalRoute.of(context)?.isCurrent == true) _load(quiet: true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _location.dispose();
    super.dispose();
  }

  String get _club => BoutiqueAccessScope.maybeOf(context)!.clubId;
  String get _section => widget.manager ? 'gestion' : 'remises';
  Future<void> _load({bool quiet = false}) async {
    if (!mounted) return;
    if (!quiet) setState(() => _loading = true);
    try {
      final results = await Future.wait([
        widget.service.call(_club, 'missions'),
        if (widget.manager) widget.service.call(_club, 'list')
      ]);
      final missionPage = results[0];
      for (var page = 1;
          page < _missionPages && missionPage['hasMore'] == true;
          page++) {
        final next = await widget.service
            .call(_club, 'missions', {'cursor': missionPage['nextCursor']});
        missionPage['missions'] = [
          ...missionPage['missions'] as List,
          ...next['missions'] as List
        ];
        missionPage['hasMore'] = next['hasMore'];
        missionPage['nextCursor'] = next['nextCursor'];
      }
      if (!mounted) return;
      setState(() {
        _missionCursor = missionPage['nextCursor'] as String?;
        _moreMissions = missionPage['hasMore'] == true;
        _missions = (missionPage['missions'] as List)
            .map((m) => Map<String, dynamic>.from(m as Map))
            .toList();
        if (widget.manager) {
          _units = (results[1]['units'] as List)
              .map((m) => Map<String, dynamic>.from(m as Map))
              .toList();
          _more = results[1]['hasMore'] == true;
          _assignees = (results[1]['assignees'] as List)
              .map((m) => Map<String, dynamic>.from(m as Map))
              .toList()
            ..sort((a, b) {
              final accueil = (b['accueil'] == true ? 1 : 0) -
                  (a['accueil'] == true ? 1 : 0);
              return accueil != 0
                  ? accueil
                  : (a['name'] as String).compareTo(b['name'] as String);
            });
        }
        _error = null;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = BoutiqueOperationsService.message(e);
          _missions = [];
          _units = [];
          _assignees = [];
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMoreMissions() async {
    if (_missionCursor == null || _loading) return;
    setState(() => _loading = true);
    try {
      final page = await widget.service
          .call(_club, 'missions', {'cursor': _missionCursor});
      if (!mounted) return;
      setState(() {
        final currentIds = _missions.map((m) => m['id']).toSet();
        _missions.addAll((page['missions'] as List)
            .map((m) => Map<String, dynamic>.from(m as Map))
            .where((m) => !currentIds.contains(m['id'])));
        _missionCursor = page['nextCursor'] as String?;
        _moreMissions = page['hasMore'] == true;
        _missionPages++;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _error = BoutiqueOperationsService.message(e));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _start({bool receipt = false}) async {
    if (_location.text.trim().isEmpty) return;
    await Navigator.push(
        context,
        boutiqueAccessGuardedRoute(
            sourceContext: context,
            requiredSection: 'gestion',
            builder: (_) => receipt
                ? BoutiqueReceiptSelectionScreen(
                    clubId: _club,
                    location: _location.text.trim(),
                    service: widget.service)
                : BoutiqueStockSessionScreen(
                    clubId: _club,
                    location: _location.text.trim(),
                    assignees: _assignees,
                    service: widget.service)));
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final locations = <String, int>{};
    for (final u in _units) {
      final place = u['location'] as String? ?? 'Lieu inconnu';
      locations.update(place, (v) => v + 1, ifAbsent: () => 1);
    }
    return Scaffold(
        appBar: AppBar(
            title: Text(widget.manager ? 'Gestion Boutique' : 'Mes remises'),
            actions: [
              IconButton(
                  tooltip: 'Actualiser',
                  onPressed: _loading ? null : () => _load(),
                  icon: const Icon(Icons.refresh))
            ]),
        body: RefreshIndicator(
            onRefresh: _load,
            child: ListView(padding: const EdgeInsets.all(16), children: [
              if (_loading) const LinearProgressIndicator(),
              if (_error != null) ...[
                Text(_error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
                TextButton(
                    onPressed: () => _load(), child: const Text('Réessayer'))
              ],
              if (widget.manager && _error == null) ...[
                Text('Un lot, une action',
                    style: Theme.of(context).textTheme.headlineSmall),
                const Text(
                    'Choisissez le lieu où vous travaillez, puis sélectionnez une réception complète ou scannez les fiches articles.'),
                const SizedBox(height: 12),
                Wrap(
                    spacing: 8,
                    children: locations.entries
                        .map((e) => ActionChip(
                            label: Text('${e.key} · ${e.value}'),
                            onPressed: () =>
                                setState(() => _location.text = e.key)))
                        .toList()),
                if (_more)
                  const Text(
                      'Aperçu limité aux 200 premières pièces. Le scanner retrouve aussi les autres pièces du club.'),
                TextField(
                    controller: _location,
                    decoration: const InputDecoration(
                        labelText: 'Je suis à…',
                        hintText: 'Choisir ci-dessus ou saisir un lieu',
                        border: OutlineInputBorder()),
                    onChanged: (_) => setState(() {})),
                const SizedBox(height: 12),
                FilledButton.icon(
                    onPressed: _loading || _location.text.trim().isEmpty
                        ? null
                        : () => _start(),
                    icon: const Icon(Icons.qr_code_scanner),
                    label: const Text('Scanner un lot')),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                    onPressed: _loading || _location.text.trim().isEmpty
                        ? null
                        : () => _start(receipt: true),
                    icon: const Icon(Icons.checklist),
                    label: const Text('Choisir une réception · sans scanner')),
                const SizedBox(height: 28),
              ],
              Text(
                  widget.manager
                      ? 'Transports et remises partagés'
                      : 'Vos lots partagés',
                  style: Theme.of(context).textTheme.titleLarge),
              const Text(
                  'La liste est commune aux personnes désignées. Une remise confirmée disparaît pour tous.'),
              if (!_loading && _missions.isEmpty && _error == null)
                const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Text('Aucune mission en cours.')),
              ..._missions.map((m) => Card(
                  child: ListTile(
                      title:
                          Text('${m['destination']} · ${m['total']} pièce(s)'),
                      subtitle: Text(
                          '${m['status'] == 'transit' ? 'En transport' : 'Réceptionné'} · ${m['arrived']} arrivée(s) · ${m['delivered']} remise(s)\n${m['pickupWindow']}\n${(m['assigneeNames'] as List? ?? []).join(', ')}'),
                      isThreeLine: true,
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () async {
                        await Navigator.push(
                            context,
                            boutiqueAccessGuardedRoute(
                                sourceContext: context,
                                requiredSection: _section,
                                builder: (_) => BoutiquePickupMissionScreen(
                                    clubId: _club,
                                    missionId: m['id'] as String,
                                    manager: widget.manager,
                                    service: widget.service)));
                        if (mounted) _load();
                      }))),
              if (_moreMissions)
                OutlinedButton(
                    onPressed: _loading ? null : _loadMoreMissions,
                    child: const Text('Afficher les missions suivantes')),
            ])));
  }
}
