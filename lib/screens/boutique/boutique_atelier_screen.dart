import 'package:flutter/material.dart';
import '../../models/boutique/boutique_physical_unit.dart';
import '../../services/boutique/boutique_operations_service.dart';
import '../../widgets/boutique/boutique_access_guard.dart';
import '../../widgets/boutique/boutique_operations_scaffold.dart';

class BoutiqueAtelierScreen extends StatefulWidget {
  const BoutiqueAtelierScreen(
      {super.key, required this.clubId, required this.service});
  final String clubId;
  final BoutiqueOperationsService service;
  @override
  State<BoutiqueAtelierScreen> createState() => _State();
}

class _State extends State<BoutiqueAtelierScreen> {
  final _selected = <String, BoutiquePhysicalUnit>{};
  List<BoutiquePhysicalUnit> _units = [];
  String _query = '';
  String? _error, _selectionGroup;
  bool _busy = false, _loading = true;
  Map<String, dynamic>? _pending;
  String? _pendingAction;
  final _expanded = <String>{'todo', 'ready'};
  static const names = {
    'todo': 'À faire',
    'stock': 'Stock club chez Jim',
    'ready': 'Broderie terminée',
    'done': 'Terminé / expédié',
    'damaged': 'Broderies ratées'
  };
  String group(BoutiquePhysicalUnit u) {
    if (u.data['damaged'] == true) return 'damaged';
    if (u.data['workshopDispatched'] == true ||
        u.data['transportMissionId'] != null ||
        u.data['finish'] == 'returned_embroidered') {
      return 'done';
    }
    if (u.data['customerOrderId'] == null &&
        ['free', 'demo'].contains(u.data['destination'])) {
      return 'stock';
    }
    if (u.data['workshopReady'] == true) return 'ready';
    return 'todo';
  }

  String displayStatus(BoutiquePhysicalUnit unit) {
    if (unit.data['damaged'] == true) return 'Broderie ratée';
    if (unit.data['workshopDispatched'] == true) return 'Expédié';
    if (unit.data['transportMissionId'] != null) return 'En transport';
    if (unit.data['finish'] == 'returned_embroidered') return 'Retour reçu';
    if (group(unit) == 'stock') {
      if (unit.data['workshopReady'] == true) return 'Stock club · brodé';
      if (unit.data['finish'] == 'at_jim') return 'Stock club · en broderie';
      return 'Stock club · non brodé';
    }
    if (unit.data['workshopReady'] == true) return 'Broderie terminée';
    return unit.stage;
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final items = <BoutiquePhysicalUnit>[];
      final cursors = <String>{};
      String? cursor;
      while (true) {
        final page = await widget.service.call(widget.clubId, 'atelierList',
            {if (cursor != null) 'cursor': cursor});
        items.addAll((page['units'] as List).map(
            (u) => BoutiquePhysicalUnit(Map<String, dynamic>.from(u as Map))));
        if (page['hasMore'] != true) break;
        cursor = page['nextCursor'] as String?;
        if (cursor == null || !cursors.add(cursor) || cursors.length > 100) {
          throw const FormatException('Liste incomplète. Actualisez.');
        }
      }
      if (mounted) setState(() => _units = items);
    } catch (e) {
      if (mounted) {
        setState(() => _error = BoutiqueOperationsService.messageForNewRead(e));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _apply(String action, List<BoutiquePhysicalUnit> units,
      {String? note}) async {
    if (_busy || units.isEmpty) return;
    final scope = BoutiqueAccessScope.maybeOf(context);
    if (scope == null) {
      setState(() => _error = 'Accès Boutique à vérifier.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_pending == null) {
        final req = <String, dynamic>{
          'expectedActorId': scope.userId,
          'units': units.map((u) => u.selection).toList(),
          'idempotencyKey': BoutiqueOperationsService.confirmationKey(),
          if (note != null) 'note': note
        };
        final preview = await widget.service
            .call(widget.clubId, action, {...req, 'preview': true});
        if (!mounted) return;
        if (preview['count'] != units.length) {
          throw const FormatException('La sélection a changé. Actualisez.');
        }
        if (action == 'damageJim') {
          final fromStock = preview['replacement'] == 'club_stock';
          final confirmed = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Confirmer la broderie ratée ?'),
              content: Text(fromStock
                  ? 'La pièce sera retirée du stock et une pièce disponible sera réservée pour cette commande.'
                  : 'La pièce sera retirée du stock et un remplacement sera ajouté au réapprovisionnement fournisseur.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(ctx, false),
                    child: const Text('Annuler')),
                FilledButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    child: const Text('Confirmer')),
              ],
            ),
          );
          if (!mounted || confirmed != true) return;
          req['expectedReplacement'] = preview['replacement'];
          if (preview['replacementUnitId'] != null) {
            req['expectedReplacementUnitId'] = preview['replacementUnitId'];
          }
        }
        _pending = req;
        _pendingAction = action;
      }
      await widget.service.call(widget.clubId, _pendingAction!, _pending!);
      if (!mounted) return;
      setState(() {
        _pending = null;
        _pendingAction = null;
        _selected.clear();
        _selectionGroup = null;
      });
      await _load();
    } catch (e) {
      if (mounted) {
        setState(() {
          if (BoutiqueOperationsService.definitiveFailure(e)) {
            _pending = null;
            _pendingAction = null;
          }
          _error = BoutiqueOperationsService.message(e);
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _detail(BoutiquePhysicalUnit unit) async {
    final result = await showModalBottomSheet<({String action, String? note})>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (ctx) {
          final comment = TextEditingController(
              text: unit.data['atelierComment'] as String? ?? '');
          return SafeArea(
              child: Padding(
                  padding: EdgeInsets.fromLTRB(
                      20, 0, 20, 20 + MediaQuery.viewInsetsOf(ctx).bottom),
                  child: SingleChildScrollView(
                      child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Text(unit.name,
                            style: const TextStyle(
                                fontSize: 20, fontWeight: FontWeight.w700)),
                        Text('${unit.variant} · ${unit.customerName}'),
                        const SizedBox(height: 12),
                        if (unit.data['damaged'] == true)
                          Text(
                              'Broderie ratée · ${unit.data['damageReason'] ?? ''}\nRemplacement : ${unit.data['replacement'] ?? 'à vérifier'}')
                        else ...[
                          CheckboxListTile(
                              contentPadding: EdgeInsets.zero,
                              value: unit.data['workshopReady'] == true,
                              title: const Text('Broderie finie'),
                              onChanged: (v) => Navigator.pop(ctx, (
                                    action:
                                        v == true ? 'finishJim' : 'reopenJim',
                                    note: null
                                  ))),
                          CheckboxListTile(
                              contentPadding: EdgeInsets.zero,
                              value: unit.data['workshopDispatched'] == true,
                              title: const Text('Expédié'),
                              onChanged: (v) => Navigator.pop(ctx, (
                                    action: v == true ? 'sendJim' : 'unsendJim',
                                    note: null
                                  ))),
                          TextField(
                              controller: comment,
                              maxLines: 2,
                              maxLength: 500,
                              decoration: const InputDecoration(
                                  labelText: 'Commentaire atelier',
                                  border: OutlineInputBorder())),
                          TextButton(
                              onPressed: () => Navigator.pop(ctx, (
                                    action: 'commentJim',
                                    note: comment.text.trim()
                                  )),
                              child: const Text('Enregistrer le commentaire')),
                          if (unit.data['customerOrderId'] != null &&
                              unit.data['workshopDispatched'] != true &&
                              ['unembroidered', 'to_jim', 'at_jim']
                                  .contains(unit.data['finish']))
                            OutlinedButton.icon(
                                onPressed: () => Navigator.pop(ctx, (
                                      action: 'damageJim',
                                      note: comment.text.trim()
                                    )),
                                icon: const Icon(Icons.report_problem_outlined),
                                label:
                                    const Text('Déclarer une broderie ratée'))
                        ]
                      ]))));
        });
    if (!mounted || result == null) return;
    if (['commentJim', 'damageJim'].contains(result.action) &&
        (result.note?.isEmpty ?? true)) {
      setState(
          () => _error = 'Ajoutez un commentaire pour expliquer la situation.');
      return;
    }
    await _apply(result.action, [unit], note: result.note);
  }

  @override
  Widget build(BuildContext context) {
    final visible = _units
        .where((u) =>
            '${u.name} ${u.variant} ${u.customerName} ${u.data['atelierComment'] ?? ''}'
                .toLowerCase()
                .contains(_query))
        .toList();
    final locked = _busy || _pending != null;
    return BoutiqueOperationsScaffold(
        title: 'Atelier Jim',
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const Text('Pièces chez Jim : commandes clients et stock club.'),
          const SizedBox(height: 12),
          TextField(
              onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
              decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  labelText: 'Article ou membre',
                  border: OutlineInputBorder())),
          if (_loading) const LinearProgressIndicator(),
          if (_error != null)
            Text(_error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
          if (_pending != null)
            FilledButton(
                onPressed: _busy
                    ? null
                    : () => _apply(
                        _pendingAction!,
                        _selected.isEmpty
                            ? [
                                _units.firstWhere((u) =>
                                    u.id ==
                                    (_pending!['units'] as List).first['id'])
                              ]
                            : _selected.values.toList()),
                child: const Text('Vérifier la confirmation en attente')),
          for (final key in names.keys)
            if (visible.any((u) => group(u) == key))
              ExpansionTile(
                  key: ValueKey(key),
                  initiallyExpanded: _expanded.contains(key),
                  onExpansionChanged: (v) => setState(() {
                        if (v) {
                          _expanded.add(key);
                        } else {
                          _expanded.remove(key);
                        }
                      }),
                  title: Text(
                      '${names[key]} · ${visible.where((u) => group(u) == key).length}'),
                  children: [
                    if (key == 'todo' || key == 'ready')
                      TextButton(
                          onPressed: locked
                              ? null
                              : () => setState(() {
                                    _selected.clear();
                                    _selectionGroup = key;
                                    for (final u in visible
                                        .where((u) => group(u) == key)) {
                                      _selected[u.id] = u;
                                    }
                                  }),
                          child: const Text('Tout sélectionner')),
                    for (final u in visible.where((u) => group(u) == key))
                      ListTile(
                          leading: (key == 'todo' || key == 'ready')
                              ? Checkbox(
                                  value: _selected.containsKey(u.id),
                                  onChanged: locked
                                      ? null
                                      : (v) => setState(() {
                                            if (_selectionGroup != null &&
                                                _selectionGroup != key) {
                                              _selected.clear();
                                            }
                                            _selectionGroup = key;
                                            if (v == true) {
                                              _selected[u.id] = u;
                                            } else {
                                              _selected.remove(u.id);
                                            }
                                          }))
                              : null,
                          title: Text(u.name),
                          subtitle: Text(
                              '${u.variant} · ${u.customerName}\n${displayStatus(u)}${(u.data['customStatus'] as String? ?? '').isNotEmpty ? ' · ${u.data['customStatus']}' : ''}'),
                          isThreeLine: true,
                          trailing: const Icon(Icons.chevron_right),
                          onTap: locked ? null : () => _detail(u)),
                    if (_selectionGroup == key &&
                        _selected.isNotEmpty &&
                        (key == 'todo' || key == 'ready')) ...[
                      TextButton(
                          onPressed: locked
                              ? null
                              : () => setState(() {
                                    _selected.clear();
                                    _selectionGroup = null;
                                  }),
                          child: const Text('Effacer la sélection')),
                      FilledButton(
                          onPressed: locked ||
                                  _selected.values.any(
                                      (u) => !visible.any((v) => v.id == u.id))
                              ? null
                              : () => _apply(
                                  key == 'todo' ? 'finishJim' : 'sendJim',
                                  _selected.values.toList()),
                          child: Text(
                              key == 'todo' ? 'Broderie finie' : 'Expédier'))
                    ]
                  ])
        ]));
  }
}
