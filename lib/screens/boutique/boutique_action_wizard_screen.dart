import 'package:flutter/material.dart';
import '../../config/app_colors.dart';
import '../../models/boutique/boutique_physical_unit.dart';
import '../../services/boutique/boutique_operations_service.dart';
import '../../widgets/boutique/boutique_access_guard.dart';
import 'boutique_order_selection_screen.dart';
import 'boutique_qr_scan_screen.dart';

/// Action-first candidate, currently reached only by the synthetic QA entry.
/// No production route, backend contract or physical transition is changed.
class BoutiqueActionWizardScreen extends StatefulWidget {
  final String clubId;
  final BoutiqueOperationsService service;
  final Widget Function(Future<String> Function(String))? scannerBuilder;
  const BoutiqueActionWizardScreen(
      {super.key,
      required this.clubId,
      required this.service,
      this.scannerBuilder});
  @override
  State<BoutiqueActionWizardScreen> createState() => _WizardState();
}

const boutiqueBatchActions = {
  'move': 'Déplacer vers un autre lieu',
  'dispatch': 'Confier un transport / point d’enlèvement',
  'prepareJim': 'Préparer le départ chez Jim',
  'confirmJim': 'Confirmer l’arrivée chez Jim',
  'finishJim': 'Broderie terminée chez Jim',
  'reviewPlain': 'Contrôler les articles sans broderie',
};

/// Conservative display hints only. The server preview remains authoritative
/// for linked order requirements, revisions, permissions and every transition.
String? boutiqueBatchBlockedReason(
    BoutiquePhysicalUnit unit, String action, String source) {
  if (unit.sold) return 'Déjà remis au client';
  if (unit.location != source) return 'Se trouve à ${unit.location}';
  if (unit.data['transportMissionId'] != null) {
    return 'Transport en cours : réceptionner d’abord';
  }
  switch (action) {
    case 'prepareJim':
      if (unit.finish != 'unembroidered' ||
          unit.data['requiresEmbroidery'] == false) {
        return 'Pas à l’étape de départ en broderie';
      }
    case 'confirmJim':
      if (unit.finish != 'to_jim' || unit.data['requiresEmbroidery'] == false) {
        return 'Départ chez Jim non préparé';
      }
    case 'finishJim':
      if (unit.finish != 'at_jim') return 'Pas en cours de broderie chez Jim';
      if (unit.data['workshopReady'] == true) return 'Broderie déjà terminée';
    case 'reviewPlain':
      if (unit.finish != 'unembroidered') return 'Déjà contrôlé ou autre étape';
      if (unit.data['requiresEmbroidery'] != false) {
        return 'Besoin de broderie à vérifier avant ce contrôle';
      }
    case 'dispatch':
      final finished =
          unit.finish == 'at_jim' && unit.data['workshopReady'] == true;
      final ready = ['returned_embroidered', 'not_required_reviewed']
          .contains(unit.finish);
      if (!finished && !ready) return 'Préparation non terminée';
      if (unit.finish == 'not_required_reviewed' &&
          unit.data['requiresEmbroidery'] != false) {
        return 'Besoin de broderie à vérifier';
      }
  }
  return null;
}

class _WizardState extends State<BoutiqueActionWizardScreen> {
  int _step = 0;
  int _generation = 0;
  String? _category, _action, _source;
  final _destination = TextEditingController(),
      _note = TextEditingController(),
      _window = TextEditingController();
  final _units = <String, BoutiquePhysicalUnit>{};
  final _selected = <String>{}, _helpers = <String>{};
  List<Map<String, dynamic>> _assignees = [];
  String _search = '';
  bool _loading = true,
      _limited = false,
      _busy = false,
      _pickup = true,
      _partial = false,
      _presence = false,
      _pendingApply = false;
  String? _error;
  Map<String, dynamic>? _prepared, _preview, _result;
  String? _preparedAction;
  static const _steps = ['Action', 'Valeurs', 'Paquets', 'Contrôle'];
  List<BoutiquePhysicalUnit> get _selection =>
      _selected.map((id) => _units[id]!).toList();
  bool get _locked => _busy || _pendingApply;
  bool get _needsDestination =>
      ['move', 'dispatch', 'confirmJim'].contains(_action);
  bool get _needsNote =>
      ['confirmJim', 'finishJim', 'reviewPlain'].contains(_action) ||
      (_action == 'dispatch' && _destination.text.trim() == _source);
  List<String> get _locations =>
      _units.values.map((u) => u.location).toSet().toList()..sort();
  String? _reason(BoutiquePhysicalUnit unit) =>
      boutiqueBatchBlockedReason(unit, _action!, _source!);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _destination.dispose();
    _note.dispose();
    _window.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await widget.service.call(widget.clubId, 'list');
      if (!mounted) return;
      setState(() {
        final retained = {
          for (final id in _selected)
            if (_units[id] != null) id: _units[id]!
        };
        _units.clear();
        _units.addAll(retained);
        for (final value in data['units'] as List) {
          final unit =
              BoutiquePhysicalUnit(Map<String, dynamic>.from(value as Map));
          _units[unit.id] = unit;
        }
        _assignees = (data['assignees'] as List? ?? [])
            .map((a) => Map<String, dynamic>.from(a as Map))
            .toList();
        _limited = data['hasMore'] == true;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _error = BoutiqueOperationsService.message(e));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _invalidate() {
    _generation++;
    _prepared = null;
    _preview = null;
    _preparedAction = null;
    _error = null;
  }

  void _setAction(String action) {
    if (_locked) return;
    setState(() {
      _action = action;
      _presence = false;
      _invalidate();
      // Do not discard selected pieces or silently change their source.
      // They are explicitly revalidated before review after any action change.
    });
  }

  void _setCategory(String category) {
    if (_locked) return;
    setState(() {
      if (_category != category) {
        _action = category == 'move' ? 'move' : 'prepareJim';
      }
      _category = category;
      _step = 1;
      _invalidate();
    });
  }

  void _back() {
    if (_locked) {
      setState(() => _error =
          'Vérifiez la confirmation en attente avant de modifier ce lot.');
      return;
    }
    if (_step > 0) {
      setState(() {
        _step--;
        _invalidate();
      });
    }
  }

  String? _valuesError() {
    if (_action == null || _source == null) {
      return 'Choisissez une action et le lieu actuel.';
    }
    final dest = _destination.text.trim();
    if (_needsDestination && (dest.isEmpty || dest.length > 160)) {
      return 'Indiquez une destination (160 caractères maximum).';
    }
    if (_action == 'move' && dest == _source) {
      return 'Choisissez un lieu différent du lieu actuel.';
    }
    if (_needsNote && _note.text.trim().length < 3) {
      return 'Notez le contrôle effectué (au moins 3 caractères).';
    }
    if (_note.text.trim().length > 500) {
      return 'La note ne peut pas dépasser 500 caractères.';
    }
    if (_action == 'dispatch') {
      if (_helpers.isEmpty) {
        return 'Choisissez au moins une personne pour ce transport.';
      }
      if (_pickup &&
          (_window.text.trim().isEmpty || _window.text.trim().length > 160)) {
        return 'Indiquez un créneau de retrait (160 caractères maximum).';
      }
      if (dest == _source && !_presence) {
        return 'Confirmez la présence physique des pièces sur place.';
      }
    }
    return null;
  }

  void _next() {
    final error = _valuesError();
    setState(() {
      _error = error;
      if (error == null) _step = 2;
    });
  }

  void _toggleMany(List<BoutiquePhysicalUnit> units, bool select) {
    if (_locked || _step != 2) return;
    final next = {..._selected};
    for (final unit in units) {
      if (select) {
        if (_reason(unit) == null) next.add(unit.id);
      } else {
        next.remove(unit.id);
      }
    }
    if (next.length > 50) {
      setState(
          () => _error = '50 pièces maximum par lot. Affinez votre sélection.');
      return;
    }
    setState(() {
      _selected
        ..clear()
        ..addAll(next);
      _invalidate();
    });
  }

  Future<void> _chooseOrder() async {
    if (_locked || _step != 2) return;
    final generation = _generation;
    final units = await Navigator.push<List<BoutiquePhysicalUnit>>(
        context,
        boutiqueAccessGuardedRoute<List<BoutiquePhysicalUnit>>(
            sourceContext: context,
            requiredSection: 'gestion',
            builder: (_) => BoutiqueOrderSelectionScreen(
                clubId: widget.clubId,
                location: _source!,
                service: widget.service)));
    if (!mounted ||
        units == null ||
        _locked ||
        _step != 2 ||
        generation != _generation) {
      return;
    }
    final seen = <String>{};
    if (units.isEmpty ||
        units.any((u) => !seen.add(u.id) || _reason(u) != null) ||
        {..._selected, ...seen}.length > 50) {
      setState(() => _error =
          'Ce paquet complet ne convient pas à cette action. Choisissez ses pièces compatibles dans la liste.');
      return;
    }
    setState(() {
      for (final unit in units) {
        _units[unit.id] = unit;
        _selected.add(unit.id);
      }
      _invalidate();
    });
  }

  Future<String> _scan(String value) async {
    if (_locked || _step != 2) {
      throw const FormatException('La sélection est verrouillée.');
    }
    final generation = _generation;
    final parser =
        BoutiqueScanSelection(clubId: widget.clubId, location: _source!);
    final id = parser.parse(value);
    if (_selected.contains(id)) {
      throw const FormatException('Cette pièce est déjà sélectionnée.');
    }
    final unit = await widget.service.lookup(widget.clubId, id);
    if (!mounted || _locked || _step != 2 || generation != _generation) {
      throw const FormatException(
          'La sélection a changé. Revenez aux paquets avant de scanner.');
    }
    final reason = _reason(unit);
    if (reason != null) throw FormatException(reason);
    if (_selected.length >= 50) {
      throw const FormatException('50 pièces maximum par lot.');
    }
    setState(() {
      _units[id] = unit;
      _selected.add(id);
      _invalidate();
    });
    return '${_selected.length} pièce(s) sélectionnée(s)';
  }

  Future<void> _review() async {
    if (_locked || _step != 2) return;
    final error = _valuesError();
    if (error != null ||
        _selected.isEmpty ||
        _selection.any((u) => _reason(u) != null)) {
      setState(() => _error =
          error ?? 'Retirez les pièces incompatibles avant de continuer.');
      return;
    }
    final actor = BoutiqueAccessScope.maybeOf(context);
    if (actor == null || actor.clubId != widget.clubId) {
      setState(() => _error = 'Accès Boutique à vérifier.');
      return;
    }
    final generation = ++_generation;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      // Refresh every selected revision before the authoritative server preview.
      final refreshed = <BoutiquePhysicalUnit>[];
      for (final unit in _selection) {
        refreshed.add(await widget.service.lookup(widget.clubId, unit.id));
      }
      if (!mounted || generation != _generation) return;
      if (refreshed.any((u) => _reason(u) != null)) {
        throw const FormatException(
            'La préparation ou le lieu a changé. Revoyez la sélection.');
      }
      for (final unit in refreshed) {
        _units[unit.id] = unit;
      }
      final request = <String, dynamic>{
        'expectedActorId': actor.userId,
        'units': refreshed.map((u) => u.selection).toList(),
        'sourceLocation': _source,
        'idempotencyKey': BoutiqueOperationsService.confirmationKey(),
        'confirmed': true,
        if (_needsDestination) 'destination': _destination.text.trim(),
        if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
        if (_action == 'dispatch') ...{
          'assigneeIds': _helpers.toList(),
          'pickupPoint': _pickup,
          'allowPartial': _partial,
          if (_pickup) 'pickupWindow': _window.text.trim()
        },
      };
      final preview = await widget.service
          .call(widget.clubId, _action!, {...request, 'preview': true});
      if (!mounted || generation != _generation) return;
      if (preview['count'] != refreshed.length) {
        throw const FormatException(
            'Le contrôle du lot est incomplet. Actualisez la sélection.');
      }
      setState(() {
        _prepared = request;
        _preparedAction = _action;
        _preview = preview;
        _step = 3;
      });
    } catch (e) {
      if (mounted && generation == _generation) {
        setState(() => _error = BoutiqueOperationsService.message(e));
      }
    } finally {
      if (mounted && generation == _generation) setState(() => _busy = false);
    }
  }

  Future<void> _apply() async {
    if (_busy || _prepared == null) return;
    setState(() {
      _busy = true;
      _pendingApply = true;
      _error = null;
    });
    try {
      final result = await widget.service
          .call(widget.clubId, _preparedAction!, _prepared!);
      if (mounted) {
        setState(() {
          _result = result;
          _pendingApply = false;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        if (BoutiqueOperationsService.definitiveFailure(e)) {
          _pendingApply = false;
          _invalidate();
          _step = 2;
        }
        _error = BoutiqueOperationsService.message(e);
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _choice(
          String title, String subtitle, IconData icon, VoidCallback onTap,
          {Key? key}) =>
      Card(
          child: ListTile(
              key: key,
              contentPadding: const EdgeInsets.all(20),
              leading: Icon(icon, size: 32, color: AppColors.donkerblauw),
              title: Text(title,
                  style: const TextStyle(fontWeight: FontWeight.bold)),
              subtitle: Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(subtitle)),
              trailing: const Icon(Icons.chevron_right),
              onTap: onTap));

  Widget _summary() => Card(
      color: const Color(0xffedf4fb),
      child: Padding(
          padding: const EdgeInsets.all(12),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
                _action == null
                    ? 'Votre action'
                    : boutiqueBatchActions[_action]!,
                style: const TextStyle(fontWeight: FontWeight.bold)),
            if (_source != null)
              Text(_needsDestination && _destination.text.trim().isNotEmpty
                  ? '$_source → ${_destination.text.trim()}'
                  : 'Lieu actuel : $_source'),
            Text(
                '${_selected.length} pièce(s) sélectionnée(s) · lieu et finition suivis séparément'),
          ])));

  Widget _values() =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Précisez votre action',
            style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
            key: ValueKey('action-$_category-$_action'),
            initialValue: _action,
            isExpanded: true,
            decoration: const InputDecoration(
                labelText: 'Action', border: OutlineInputBorder()),
            items: boutiqueBatchActions.entries
                .where((e) => _category == 'move'
                    ? ['move', 'dispatch'].contains(e.key)
                    : !['move', 'dispatch'].contains(e.key))
                .map((e) => DropdownMenuItem(
                    value: e.key,
                    child: Text(e.value, overflow: TextOverflow.ellipsis)))
                .toList(),
            onChanged: _locked ? null : (v) => _setAction(v!)),
        const SizedBox(height: 16),
        if (_loading) const LinearProgressIndicator(),
        if (!_loading && _locations.isEmpty)
          const Text('Aucun lieu chargé. Réessayez le chargement.'),
        DropdownButtonFormField<String>(
            key: ValueKey('source-$_source-${_locations.join('|')}'),
            initialValue: _source != null && _locations.contains(_source)
                ? _source
                : null,
            decoration: const InputDecoration(
                labelText: 'Lieu actuel des pièces',
                border: OutlineInputBorder()),
            items: _locations
                .map((v) => DropdownMenuItem(value: v, child: Text(v)))
                .toList(),
            onChanged: _locked
                ? null
                : (v) => setState(() {
                      _source = v;
                      _presence = false;
                      _invalidate();
                    })),
        if (_needsDestination) ...[
          const SizedBox(height: 16),
          TextField(
              key: const Key('wizard-destination'),
              controller: _destination,
              enabled: !_locked,
              decoration: const InputDecoration(
                  labelText: 'Lieu de destination',
                  border: OutlineInputBorder()),
              onChanged: (_) => setState(() {
                    _presence = false;
                    _invalidate();
                  })),
          Wrap(
              spacing: 8,
              children: _locations
                  .where((v) => v != _source)
                  .map((v) => ActionChip(
                      label: Text(v),
                      onPressed: _locked
                          ? null
                          : () => setState(() {
                                _destination.text = v;
                                _presence = false;
                                _invalidate();
                              })))
                  .toList()),
        ],
        const SizedBox(height: 12),
        Text(switch (_action) {
          'move' =>
            'Seul le lieu change. La broderie et la réservation client sont conservées.',
          'prepareJim' =>
            'Prépare le départ en broderie. Les pièces restent au lieu actuel.',
          'confirmJim' =>
            'Confirme la réception réelle chez Jim et le début de la broderie.',
          'finishJim' =>
            'Marque la broderie terminée chez Jim. Aucun déplacement ni message client.',
          'reviewPlain' =>
            'Uniquement les articles confirmés sans broderie. Aucun besoin de broderie ne peut être contourné.',
          _ =>
            'Le transport et la réception sont distincts. Le départ seul n’avertit pas les acheteurs.',
        }),
        if (_action == 'dispatch') ...[
          const SizedBox(height: 12),
          const Text('Personnes chargées du transport / retrait'),
          ..._assignees.map((a) => CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(a['name'] as String),
              value: _helpers.contains(a['id']),
              onChanged: _locked
                  ? null
                  : (v) => setState(() {
                        if (v == true && _helpers.length < 10) {
                          _helpers.add(a['id'] as String);
                        } else if (v != true) {
                          _helpers.remove(a['id']);
                        }
                        _invalidate();
                      }))),
          SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Point d’enlèvement client'),
              value: _pickup,
              onChanged: _locked
                  ? null
                  : (v) => setState(() {
                        _pickup = v;
                        _invalidate();
                      })),
          if (_pickup)
            TextField(
                controller: _window,
                enabled: !_locked,
                decoration: const InputDecoration(
                    labelText: 'Créneau de retrait',
                    border: OutlineInputBorder()),
                onChanged: (_) => _invalidate()),
          CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Autoriser les remises partielles'),
              value: _partial,
              onChanged: _locked
                  ? null
                  : (v) => setState(() {
                        _partial = v == true;
                        _invalidate();
                      })),
          if (_destination.text.trim() == _source)
            CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                title:
                    const Text('Pièces déjà physiquement présentes à ce lieu'),
                value: _presence,
                onChanged: _locked
                    ? null
                    : (v) => setState(() {
                          _presence = v == true;
                          _invalidate();
                        })),
        ],
        const SizedBox(height: 12),
        TextField(
            key: const Key('wizard-note'),
            controller: _note,
            enabled: !_locked,
            maxLines: 2,
            decoration: InputDecoration(
                labelText: _needsNote
                    ? 'Contrôle effectué · obligatoire'
                    : 'Note · facultatif',
                border: const OutlineInputBorder()),
            onChanged: (_) => _invalidate()),
      ]);

  Widget _packages() {
    final groups = <String, List<BoutiquePhysicalUnit>>{};
    for (final unit in _units.values) {
      if (unit.location != _source && !_selected.contains(unit.id)) continue;
      if (!'${unit.name} ${unit.variant} ${unit.customerName} ${unit.data['orderNumber'] ?? ''} ${unit.data['supplierOrderReference'] ?? ''}'
          .toLowerCase()
          .contains(_search)) {
        continue;
      }
      final id = unit.data['customerOrderId'] as String? ??
          unit.data['supplierBatchId'] as String? ??
          'stock';
      groups.putIfAbsent(id, () => []).add(unit);
    }
    final visible = groups.values.expand((v) => v).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('Choisissez les paquets',
          style: Theme.of(context).textTheme.titleLarge),
      const Text(
          'Cochez une commande ou ouvrez-la pour choisir ses pièces. Rien n’est encore enregistré.'),
      const SizedBox(height: 12),
      TextField(
          decoration: const InputDecoration(
              labelText: 'Rechercher un paquet ou un article',
              prefixIcon: Icon(Icons.search),
              border: OutlineInputBorder()),
          onChanged: (v) => setState(() => _search = v.trim().toLowerCase())),
      Wrap(spacing: 8, children: [
        TextButton(
            onPressed: _locked ? null : () => _toggleMany(visible, true),
            child: const Text('Tout sélectionner · liste affichée')),
        TextButton(
            onPressed: _locked ? null : () => _toggleMany(_selection, false),
            child: const Text('Tout désélectionner'))
      ]),
      if (_limited)
        const Text(
            'Aperçu limité aux 200 premières pièces. « Commande complète » et le scan retrouvent aussi les autres pièces ; Tout sélectionner ne concerne que la liste affichée.'),
      for (final entry in groups.entries)
        Card(
            child: ExpansionTile(
          key: PageStorageKey('package-${entry.key}'),
          leading: Checkbox(
              tristate: true,
              value: entry.value.every((u) => _selected.contains(u.id))
                  ? true
                  : entry.value.any((u) => _selected.contains(u.id))
                      ? null
                      : false,
              onChanged: _locked || entry.value.every((u) => _reason(u) != null)
                  ? null
                  : (_) => _toggleMany(
                      entry.value,
                      !entry.value
                          .where((u) => _reason(u) == null)
                          .every((u) => _selected.contains(u.id)))),
          title: Text(entry.value.first.data['orderNumber'] as String? ??
              entry.value.first.customerName),
          subtitle: Text(
              '${entry.value.where((u) => _selected.contains(u.id)).length}/${entry.value.length} pièce(s) · ${entry.value.where((u) => _reason(u) != null).length} non compatible(s)'),
          children: entry.value.map((u) {
            final reason = _reason(u);
            return CheckboxListTile(
                title: Text(u.name),
                subtitle: Text(
                    '${u.variant} · ${u.stage}\n${reason ?? 'Compatible · contrôle final requis'}'),
                value: _selected.contains(u.id),
                onChanged:
                    _locked || (reason != null && !_selected.contains(u.id))
                        ? null
                        : (v) => _toggleMany([u], v == true));
          }).toList(),
        )),
      if (groups.isEmpty)
        const Text('Aucun paquet correspondant dans la liste chargée.'),
      OutlinedButton.icon(
          onPressed: _locked ? null : _chooseOrder,
          icon: const Icon(Icons.inventory_2_outlined),
          label: const Text('Ajouter une commande complète')),
      OutlinedButton.icon(
          onPressed: _locked
              ? null
              : () => Navigator.push(
                  context,
                  boutiqueAccessGuardedRoute(
                      sourceContext: context,
                      requiredSection: 'gestion',
                      builder: (_) =>
                          widget.scannerBuilder?.call(_scan) ??
                          BoutiqueQrScanScreen(
                              title: 'Ajouter des pièces au lot',
                              instruction:
                                  'Action : ${boutiqueBatchActions[_action]}. Scannez les pièces présentes à $_source.',
                              onScan: _scan))),
          icon: const Icon(Icons.qr_code_scanner),
          label: const Text('Scanner des pièces · facultatif')),
    ]);
  }

  Widget _control() =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Vérifiez avant de confirmer',
            style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 16),
        ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Lieu'),
            subtitle: Text(_needsDestination
                ? '$_source → ${_destination.text.trim()}'
                : '$_source · inchangé')),
        ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Finition / broderie'),
            subtitle: Text(_action == 'move'
                ? 'Inchangée pour chaque pièce'
                : boutiqueBatchActions[_action]!)),
        const ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text('Réservation client'),
            subtitle: Text('Conservée · aucun changement de paiement')),
        Text(
            '${_preview?['count']} pièce(s) · ${_selection.map((u) => u.data['customerOrderId'] ?? u.data['supplierBatchId'] ?? 'stock').toSet().length} paquet(s)'),
        Text(
            '${_preview?['notificationCount'] ?? 0} acheteur(s) averti(s) selon le contrôle serveur.'),
        if ((_preview?['heldOrders'] as List? ?? []).isNotEmpty)
          Text(
              '${(_preview!['heldOrders'] as List).length} commande(s) restent en attente de préparation ou de paiement.'),
        if (_note.text.trim().isNotEmpty)
          Text('Contrôle / note : ${_note.text.trim()}'),
        if (_action == 'dispatch')
          Text(
              'Équipe : ${_helpers.length} personne(s) · durée 7 jours. Le départ seul n’envoie aucun message.'),
        const SizedBox(height: 12),
        const Text(
            'Confirmez uniquement les pièces physiquement présentes et l’action réellement effectuée.'),
        if (_pendingApply)
          const Text(
              'Réponse encore inconnue : les valeurs sont verrouillées. Réessayez la même confirmation, pas une nouvelle action.'),
      ]);

  @override
  Widget build(BuildContext context) => PopScope(
      canPop: (_result != null || _step == 0) && !_locked,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        appBar: AppBar(
            title: const Text('Gestion Boutique'),
            backgroundColor: AppColors.donkerblauw,
            foregroundColor: Colors.white,
            leading: _step > 0 && _result == null
                ? IconButton(
                    tooltip: 'Retour',
                    icon: const Icon(Icons.arrow_back),
                    onPressed: _busy ? null : _back)
                : null),
        body: SafeArea(
            child: Center(
                child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 700),
                    child: Column(children: [
                      Padding(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                          child: Row(
                              children: List.generate(
                                  4,
                                  (i) => Expanded(
                                          child: Column(children: [
                                        CircleAvatar(
                                            radius: 16,
                                            backgroundColor: i <= _step
                                                ? AppColors.donkerblauw
                                                : Colors.grey.shade200,
                                            foregroundColor: i <= _step
                                                ? Colors.white
                                                : Colors.black54,
                                            child: Text('${i + 1}')),
                                        const SizedBox(height: 4),
                                        Text(_steps[i],
                                            style: TextStyle(
                                                fontWeight: i == _step
                                                    ? FontWeight.bold
                                                    : FontWeight.normal)),
                                      ]))))),
                      if (_step > 0 && _result == null)
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: _summary(),
                        ),
                      Expanded(
                          child: ListView(
                              padding: const EdgeInsets.all(16),
                              children: [
                            if (_result != null) ...[
                              const Icon(Icons.check_circle_outline,
                                  size: 64, color: Colors.green),
                              Text('Lot enregistré',
                                  textAlign: TextAlign.center,
                                  style: Theme.of(context)
                                      .textTheme
                                      .headlineSmall),
                              Text(
                                  '${_result!['count']} pièce(s) · ${_result!['notificationCount'] ?? 0} notification(s)',
                                  textAlign: TextAlign.center),
                              const SizedBox(height: 16),
                              FilledButton(
                                  onPressed: () => setState(() {
                                        _result = null;
                                        _selected.clear();
                                        _step = 0;
                                        _category = null;
                                        _action = null;
                                        _invalidate();
                                        _load();
                                      }),
                                  child: const Text('Faire une autre action')),
                            ] else ...[
                              if (_step == 0) ...[
                                Text('Que voulez-vous faire ?',
                                    style: Theme.of(context)
                                        .textTheme
                                        .headlineSmall),
                                const Text(
                                    'Une action commune pour plusieurs paquets. Aucun changement avant la dernière confirmation.'),
                                const SizedBox(height: 16),
                                _choice(
                                    'Déplacer',
                                    'Changer de lieu ou organiser un transport.',
                                    Icons.local_shipping_outlined,
                                    () => _setCategory('move')),
                                _choice(
                                    'Statut / finition',
                                    'Préparer la broderie, confirmer une étape ou contrôler des articles.',
                                    Icons.fact_check_outlined,
                                    () => _setCategory('finish')),
                              ],
                              if (_step == 1) _values(),
                              if (_step == 2) _packages(),
                              if (_step == 3) _control(),
                            ],
                            if (_error != null)
                              Padding(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 12),
                                  child: Text(_error!,
                                      key: const Key('wizard-error'),
                                      style: TextStyle(
                                          color: Theme.of(context)
                                              .colorScheme
                                              .error))),
                            if (_error != null && _step < 2 && !_locked)
                              TextButton(
                                  onPressed: _load,
                                  child: const Text('Recharger les données')),
                          ])),
                      if (_result == null && _step > 0)
                        Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(children: [
                              if (_step > 0)
                                OutlinedButton(
                                    onPressed: _locked ? null : _back,
                                    child: const Text('Retour')),
                              const SizedBox(width: 12),
                              Expanded(
                                  child: FilledButton(
                                      key: const Key('wizard-next'),
                                      onPressed: _busy ||
                                              (_step == 1 && _loading) ||
                                              (_step == 2 && _selected.isEmpty)
                                          ? null
                                          : _step == 1
                                              ? _next
                                              : _step == 2
                                                  ? _review
                                                  : _apply,
                                      child: Text(_busy
                                          ? 'Vérification…'
                                          : _step == 1
                                              ? 'Choisir les paquets'
                                              : _step == 2
                                                  ? 'Vérifier le lot · ${_selected.length}'
                                                  : _pendingApply
                                                      ? 'Vérifier la confirmation en attente'
                                                      : 'Confirmer · ${_selected.length} pièce(s)'))),
                            ])),
                    ])))),
      ));
}
