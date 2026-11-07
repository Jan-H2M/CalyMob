import 'package:flutter/material.dart';
import '../../models/boutique/boutique_physical_unit.dart';
import '../../services/boutique/boutique_operations_service.dart';
import '../../widgets/boutique/boutique_access_guard.dart';
import '../../widgets/boutique/boutique_operations_scaffold.dart';
import 'boutique_qr_scan_screen.dart';

/// Move existing physical pieces. The backend validates the actor, current
/// revisions, location and eligibility before either preview or mutation.
class BoutiqueLocationsScreen extends StatefulWidget {
  const BoutiqueLocationsScreen(
      {super.key, required this.clubId, required this.service});
  final String clubId;
  final BoutiqueOperationsService service;
  @override
  State<BoutiqueLocationsScreen> createState() =>
      _BoutiqueLocationsScreenState();
}

class _BoutiqueLocationsScreenState extends State<BoutiqueLocationsScreen> {
  final _search = TextEditingController(),
      _destination = TextEditingController();
  final _selected = <String, BoutiquePhysicalUnit>{};
  final _expanded = <String>{};
  List<BoutiquePhysicalUnit> _units = [];
  String? _source, _error;
  Map<String, dynamic>? _pending;
  bool _busy = false, _loading = true;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    _destination.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final values = await widget.service.listReceivedUnits(widget.clubId);
      if (!mounted) return;
      setState(() {
        _units = values.where((u) => !u.sold && !u.inTransport).toList();
      });
    } catch (e) {
      if (mounted) {
        setState(() => _error = BoutiqueOperationsService.message(e));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toggle(BoutiquePhysicalUnit unit, bool selected) {
    if (_busy || _pending != null) return;
    if (selected && _source != null && _source != unit.location) {
      setState(
          () => _error = 'Sélectionnez des pièces d’un seul lieu à la fois.');
      return;
    }
    if (selected &&
        _selected.length >= 100 &&
        !_selected.containsKey(unit.id)) {
      setState(() => _error = '100 pièces maximum par déplacement.');
      return;
    }
    setState(() {
      _error = null;
      if (selected) {
        _source = unit.location;
        _selected[unit.id] = unit;
      } else {
        _selected.remove(unit.id);
        if (_selected.isEmpty) _source = null;
      }
    });
  }

  Future<String> _scan(String value) async {
    final id =
        BoutiqueScanSelection(clubId: widget.clubId, location: _source ?? '')
            .parse(value);
    final unit = await widget.service.lookup(widget.clubId, id);
    if (unit.sold || unit.inTransport) {
      throw const FormatException('Cette pièce ne peut pas être déplacée.');
    }
    if (_source != null && _source != unit.location) {
      throw const FormatException(
          'Sélectionnez des pièces d’un seul lieu à la fois.');
    }
    if (_selected.containsKey(unit.id)) {
      throw const FormatException('Cette pièce est déjà sélectionnée.');
    }
    if (_selected.length >= 100) {
      throw const FormatException('100 pièces maximum par déplacement.');
    }
    if (mounted) {
      setState(() {
        if (!_units.any((u) => u.id == unit.id)) _units.add(unit);
        _expanded.add(unit.location);
      });
      _toggle(unit, true);
    }
    return '${unit.name} sélectionné';
  }

  Future<void> _move() async {
    if (_busy || _selected.isEmpty) return;
    final scope = BoutiqueAccessScope.maybeOf(context);
    if (scope == null) {
      setState(() => _error = 'Accès Boutique à vérifier.');
      return;
    }
    final destination = _destination.text.trim();
    if (_pending == null &&
        (destination.isEmpty ||
            destination == _source ||
            destination.length > 160)) {
      setState(() => _error = 'Choisissez un autre lieu de destination.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_pending == null) {
        final request = <String, dynamic>{
          'expectedActorId': scope.userId,
          'sourceLocation': _source,
          'destination': destination,
          'units': _selected.values.map((u) => u.selection).toList(),
          'idempotencyKey': BoutiqueOperationsService.confirmationKey(),
          'confirmed': true
        };
        final preview = await widget.service
            .call(widget.clubId, 'move', {...request, 'preview': true});
        if (!mounted) return;
        if (preview['count'] != _selected.length) {
          throw const FormatException(
              'Le contrôle du lot est incomplet. Actualisez.');
        }
        _pending = request;
      }
      final result =
          await widget.service.call(widget.clubId, 'move', _pending!);
      if (!mounted) return;
      setState(() {
        _selected.clear();
        _source = null;
        _pending = null;
        _destination.clear();
      });
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${result['count']} pièce(s) déplacée(s).')));
      await _load();
    } catch (e) {
      if (mounted) {
        setState(() {
          if (BoutiqueOperationsService.definitiveFailure(e)) _pending = null;
          _error = BoutiqueOperationsService.message(e);
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final query = _search.text.trim().toLowerCase();
    final visible = _units
        .where((u) => '${u.name} ${u.variant} ${u.customerName} ${u.location}'
            .toLowerCase()
            .contains(query))
        .toList();
    final places = visible.map((u) => u.location).toSet().toList()..sort();
    final locked = _busy || _pending != null;
    return BoutiqueOperationsScaffold(
        title: 'Localisation des pièces',
        body: RefreshIndicator(
            onRefresh: _load,
            child: ListView(padding: const EdgeInsets.all(16), children: [
              const Text(
                  'Recherchez ou scannez une pièce pour changer sa localisation.'),
              const SizedBox(height: 12),
              TextField(
                  controller: _search,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.search),
                      labelText: 'Article, membre ou lieu',
                      border: OutlineInputBorder())),
              OutlinedButton.icon(
                  onPressed: locked
                      ? null
                      : () => Navigator.push(
                          context,
                          boutiqueAccessGuardedRoute(
                              sourceContext: context,
                              requiredSection: 'gestion',
                              builder: (_) => BoutiqueQrScanScreen(
                                  title: 'Scanner une pièce',
                                  instruction:
                                      'Scannez le QR de la fiche article.',
                                  onScan: _scan))),
                  icon: const Icon(Icons.qr_code_scanner),
                  label: const Text('Scanner une pièce')),
              if (_loading) const LinearProgressIndicator(),
              if (_error != null)
                Text(_error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
              if (!_loading && visible.isEmpty)
                const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('Aucune pièce disponible.')),
              for (final place in places) ...[
                ExpansionTile(
                    key: ValueKey('location-$place'),
                    initiallyExpanded: _expanded.contains(place),
                    onExpansionChanged: (v) => setState(() {
                          if (v) {
                            _expanded.add(place);
                          } else {
                            _expanded.remove(place);
                          }
                        }),
                    title: Text(place,
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text(
                        '${visible.where((u) => u.location == place).length} pièce(s)'),
                    children: [
                      TextButton(
                          onPressed:
                              locked || (_source != null && _source != place)
                                  ? null
                                  : () {
                                      final candidates = visible
                                          .where((u) => u.location == place)
                                          .toList();
                                      if ({
                                            ..._selected.keys,
                                            ...candidates.map((u) => u.id)
                                          }.length >
                                          100) {
                                        setState(() => _error =
                                            '100 pièces maximum par déplacement.');
                                        return;
                                      }
                                      setState(() {
                                        _source = place;
                                        for (final u in candidates) {
                                          _selected[u.id] = u;
                                        }
                                      });
                                    },
                          child: Text(query.isEmpty
                              ? 'Tout sélectionner'
                              : 'Sélectionner les résultats')),
                      for (final u in visible.where((u) => u.location == place))
                        CheckboxListTile(
                            value: _selected.containsKey(u.id),
                            onChanged:
                                locked ? null : (v) => _toggle(u, v == true),
                            controlAffinity: ListTileControlAffinity.leading,
                            title: Text(u.name),
                            subtitle: Text('${u.variant}\n${u.customerName}'),
                            isThreeLine: true),
                      if (_source == place && _selected.isNotEmpty)
                        Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                      '${_selected.length} pièce(s) sélectionnée(s) · $place',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w700)),
                                  if (_selected.values.any(
                                      (u) => !visible.any((v) => v.id == u.id)))
                                    const Text(
                                        'Certaines pièces sélectionnées sont masquées par la recherche.'),
                                  const SizedBox(height: 8),
                                  TextField(
                                      controller: _destination,
                                      enabled: !locked,
                                      decoration: const InputDecoration(
                                          labelText: 'Nouvelle localisation',
                                          border: OutlineInputBorder())),
                                  const SizedBox(height: 8),
                                  SizedBox(
                                      width: double.infinity,
                                      child: FilledButton(
                                          onPressed: _busy ? null : _move,
                                          child: Text(_pending == null
                                              ? 'Déplacer les pièces'
                                              : 'Vérifier la confirmation en attente'))),
                                  TextButton(
                                      onPressed: locked
                                          ? null
                                          : () => setState(() {
                                                _selected.clear();
                                                _source = null;
                                              }),
                                      child: const Text('Effacer la sélection'))
                                ]))
                    ])
              ]
            ])));
  }
}
