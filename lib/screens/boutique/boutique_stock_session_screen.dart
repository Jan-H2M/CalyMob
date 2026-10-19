import 'package:flutter/material.dart';
import '../../models/boutique/boutique_physical_unit.dart';
import '../../services/boutique/boutique_operations_service.dart';
import 'boutique_qr_scan_screen.dart';
import 'boutique_order_selection_screen.dart';
import '../../widgets/boutique/boutique_access_guard.dart';

class BoutiqueStockSessionScreen extends StatefulWidget {
  final String clubId;
  final String location;
  final List<Map<String, dynamic>> assignees;
  final BoutiqueOperationsService service;
  const BoutiqueStockSessionScreen(
      {super.key,
      required this.clubId,
      required this.location,
      required this.assignees,
      this.service = const BoutiqueOperationsService()});
  @override
  State<BoutiqueStockSessionScreen> createState() =>
      _BoutiqueStockSessionScreenState();
}

class _BoutiqueStockSessionScreenState
    extends State<BoutiqueStockSessionScreen> {
  late BoutiqueScanSelection _selection;
  final _destination = TextEditingController(),
      _note = TextEditingController(),
      _window = TextEditingController();
  String? _action;
  final _helpers = <String>{};
  bool _pickup = true, _partial = false, _presence = false, _busy = false;
  String? _error;
  Map<String, dynamic>? _pending;
  static const _actions = {
    'move': 'Changer de lieu',
    'prepareJim': 'Préparer le départ chez Jim',
    'confirmJim': 'Confirmer l’arrivée chez Jim',
    'finishJim': 'Broderie terminée chez Jim',
    'reviewPlain': 'Contrôler les articles sans broderie',
    'dispatch': 'Confier un transport / point d’enlèvement',
  };
  static const _help = {
    'move':
        'Seul le lieu change. La finition et la réservation client sont conservées.',
    'prepareJim':
        'Les pièces restent au lieu actuel, en attente du départ chez Jim.',
    'confirmJim':
        'À utiliser lorsque les pièces ont réellement été réceptionnées chez Jim.',
    'finishJim':
        'Les pièces restent chez Jim. Les acheteurs ne sont pas encore avertis.',
    'reviewPlain':
        'Confirmez le contrôle des articles qui ne nécessitent aucune broderie.',
    'dispatch':
        'Choisissez les personnes qui pourront réceptionner ce lot et le remettre. Le message client part après confirmation de l’arrivée.',
  };
  @override
  void initState() {
    super.initState();
    _selection =
        BoutiqueScanSelection(clubId: widget.clubId, location: widget.location);
  }

  @override
  void dispose() {
    _destination.dispose();
    _note.dispose();
    _window.dispose();
    super.dispose();
  }

  Future<String> _scan(String value) async {
    final id = _selection.parse(value);
    if (_selection.contains(id)) {
      throw const FormatException('Cette pièce est déjà dans le lot.');
    }
    final unit = await widget.service.lookup(widget.clubId, id);
    if (!mounted) throw const FormatException('Session fermée.');
    setState(() {
      _selection.add(unit);
      _action = null;
      _error = null;
    });
    return '${_selection.units.length} pièce(s) · ${unit.name} ajoutée';
  }

  Future<void> _chooseOrder() async {
    final units = await Navigator.push<List<BoutiquePhysicalUnit>>(
        context,
        boutiqueAccessGuardedRoute<List<BoutiquePhysicalUnit>>(
            sourceContext: context,
            requiredSection: 'gestion',
            builder: (_) => BoutiqueOrderSelectionScreen(
                clubId: widget.clubId,
                location: widget.location,
                service: widget.service)));
    if (!mounted || units == null) return;
    try {
      setState(() {
        _selection.addOrder(units);
        _action = null;
        _error = null;
      });
    } catch (e) {
      setState(() => _error = BoutiqueOperationsService.message(e));
    }
  }

  Future<void> _chooseHelpers() async {
    final selected = {..._helpers};
    var search = '';
    final result = await showDialog<Set<String>>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(
            builder: (context, update) => AlertDialog(
                  title: Text('Personnes pour ce lot · ${selected.length}/10'),
                  content: SizedBox(
                      width: double.maxFinite,
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        TextField(
                            decoration: const InputDecoration(
                                labelText: 'Rechercher un membre',
                                prefixIcon: Icon(Icons.search)),
                            onChanged: (v) =>
                                update(() => search = v.trim().toLowerCase())),
                        SizedBox(
                            height: MediaQuery.sizeOf(context).height * 0.35,
                            child: ListView(
                                children: widget.assignees
                                    .where((m) =>
                                        '${m['name']} ${m['accueil'] == true ? 'accueil' : ''}'
                                            .toLowerCase()
                                            .contains(search))
                                    .map((m) => CheckboxListTile(
                                        contentPadding: EdgeInsets.zero,
                                        title: Text(m['name'] as String),
                                        subtitle: m['accueil'] == true
                                            ? const Text('Accueil')
                                            : null,
                                        value: selected.contains(m['id']),
                                        onChanged: (v) => update(() {
                                              if (v != true) {
                                                selected.remove(m['id']);
                                              } else if (selected.length < 10) {
                                                selected.add(m['id'] as String);
                                              }
                                            })))
                                    .toList())),
                      ])),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(dialogContext),
                        child: const Text('Annuler')),
                    FilledButton(
                        onPressed: () => Navigator.pop(dialogContext, selected),
                        child: const Text('Utiliser cette équipe'))
                  ],
                )));
    if (result != null && mounted) {
      setState(() {
        _helpers.clear();
        _helpers.addAll(result);
      });
    }
  }

  Future<void> _refresh() async {
    setState(() => _busy = true);
    try {
      final next = BoutiqueScanSelection(
          clubId: widget.clubId, location: widget.location);
      for (final unit in _selection.units) {
        next.add(await widget.service.lookup(widget.clubId, unit.id));
      }
      if (mounted) {
        setState(() {
          _selection = next;
          _pending = null;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = BoutiqueOperationsService.message(e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Map<String, dynamic> _request() => {
        'expectedActorId': BoutiqueAccessScope.maybeOf(context)!.userId,
        'units': _selection.units.map((u) => u.selection).toList(),
        'sourceLocation': widget.location,
        'idempotencyKey': BoutiqueOperationsService.confirmationKey(),
        'confirmed': true,
        if (['move', 'confirmJim', 'dispatch'].contains(_action))
          'destination': _destination.text.trim(),
        if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
        if (_action == 'dispatch') ...{
          'assigneeIds': _helpers.toList(),
          'pickupPoint': _pickup,
          'allowPartial': _partial,
          if (_pickup) 'pickupWindow': _window.text.trim()
        },
      };
  Future<void> _confirm() async {
    if (_selection.units.isEmpty || _action == null) return;
    if (_action == 'dispatch' &&
        _destination.text.trim() == widget.location &&
        !_presence) {
      setState(() =>
          _error = 'Confirmez la présence physique des pièces sur place.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    bool applying = _pending != null;
    try {
      if (_pending == null) {
        final request = _request();
        final preview = await widget.service
            .call(widget.clubId, _action!, {...request, 'preview': true});
        if (!mounted) return;
        final approved = await showDialog<bool>(
            context: context,
            builder: (context) => AlertDialog(
                    title: Text(
                        '${preview['count']} pièce(s) · ${_actions[_action]}'),
                    content: SingleChildScrollView(
                        child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          Text(
                              '${widget.location} → ${preview['destination']}'),
                          const SizedBox(height: 12),
                          Text(
                              '${preview['notificationCount']} acheteur(s) sera/seront averti(s).'),
                          if ((preview['heldOrders'] as List? ?? []).isNotEmpty)
                            Text(
                                '${(preview['heldOrders'] as List).length} commande(s) restent en attente : paiement ou préparation incomplets.'),
                          if (_action == 'dispatch')
                            Text(
                                'Tâche partagée avec ${_helpers.length} personne(s), valable 7 jours. Le départ seul n’envoie aucun message.'),
                          const SizedBox(height: 12),
                          const Text(
                              'Confirmez uniquement les pièces physiquement présentes dans ce lot.'),
                        ])),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text('Revoir')),
                      FilledButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const Text('Confirmer le lot'))
                    ]));
        if (!mounted || approved != true) return;
        _pending = request;
        applying = true;
      }
      final result =
          await widget.service.call(widget.clubId, _action!, _pending!);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              '${result['count']} pièce(s) enregistrée(s) · ${result['notificationCount']} notification(s).')));
      Navigator.pop(context, true);
    } catch (e) {
      if (BoutiqueOperationsService.definitiveFailure(e)) {
        _pending = null;
      }
      if (mounted) {
        setState(() => _error = BoutiqueOperationsService.message(e));
      }
      if (!applying) _pending = null;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locked = _busy || _pending != null;
    return Scaffold(
        appBar: AppBar(title: const Text('Scanner un lot')),
        body: SafeArea(
            child: ListView(padding: const EdgeInsets.all(16), children: [
          Text('Lieu de cette session : ${widget.location}',
              style: Theme.of(context).textTheme.titleMedium),
          const Text(
              'Sélectionnez d’abord les pièces, puis choisissez une action commune. Rien ne change avant votre confirmation.'),
          const SizedBox(height: 16),
          Text('1 · Sélection · ${_selection.units.length}/50 pièce(s)',
              style: Theme.of(context).textTheme.titleMedium),
          FilledButton.icon(
              onPressed: locked
                  ? null
                  : () => Navigator.push(
                      context,
                      boutiqueAccessGuardedRoute(
                          sourceContext: context,
                          requiredSection: 'gestion',
                          builder: (_) => BoutiqueQrScanScreen(
                              title: 'Scanner les fiches articles',
                              instruction:
                                  'Scannez les pièces présentes à ${widget.location}. Une pièce déjà scannée ne sera pas ajoutée deux fois.',
                              onScan: _scan))),
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Scanner une ou plusieurs pièces')),
          OutlinedButton.icon(
              onPressed: locked ? null : _chooseOrder,
              icon: const Icon(Icons.inventory_2_outlined),
              label: const Text('Sélectionner une commande complète')),
          ..._selection.units.map((u) => ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(u.name),
              subtitle: Text('${u.variant} · ${u.customerName}\n${u.stage}'),
              trailing: IconButton(
                  tooltip: 'Retirer du lot',
                  onPressed: locked
                      ? null
                      : () => setState(() {
                            _selection.remove(u.id);
                            _action = null;
                          }),
                  icon: const Icon(Icons.close)))),
          if (_pending == null)
            TextButton(
                onPressed: _busy || _selection.units.isEmpty ? null : _refresh,
                child: const Text('Actualiser les pièces sélectionnées')),
          if (_selection.units.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text('2 · Action commune',
                style: Theme.of(context).textTheme.titleMedium),
            DropdownButtonFormField<String>(
                key: ValueKey(_action),
                initialValue: _action,
                hint: const Text('Choisir une action'),
                isExpanded: true,
                decoration: const InputDecoration(
                    labelText: 'Action pour tout le lot',
                    border: OutlineInputBorder()),
                items: _actions.entries
                    .map((e) => DropdownMenuItem(
                        value: e.key,
                        child: Text(e.value, overflow: TextOverflow.ellipsis)))
                    .toList(),
                onChanged: locked ? null : (v) => setState(() => _action = v!)),
            if (_action != null)
              Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(_help[_action]!)),
            if (['move', 'confirmJim', 'dispatch'].contains(_action)) ...[
              TextField(
                  controller: _destination,
                  enabled: !locked,
                  decoration: const InputDecoration(
                      labelText: 'Lieu de destination',
                      hintText: 'Piscine, Jim, réserve…',
                      border: OutlineInputBorder()),
                  onChanged: (_) => setState(() {})),
              const SizedBox(height: 12),
            ],
            if (_action == 'dispatch') ...[
              const Text('Personnes autorisées pour ce lot',
                  style: TextStyle(fontWeight: FontWeight.bold)),
              const Text(
                  'L’accueil est proposé en premier. Plusieurs personnes partagent la même liste de remises.'),
              Wrap(
                  spacing: 8,
                  children: widget.assignees
                      .where((m) => _helpers.contains(m['id']))
                      .map((m) => Chip(
                          label: Text(m['name'] as String),
                          onDeleted: locked
                              ? null
                              : () => setState(() => _helpers.remove(m['id']))))
                      .toList()),
              OutlinedButton.icon(
                  onPressed: locked ? null : _chooseHelpers,
                  icon: const Icon(Icons.group_add_outlined),
                  label: Text('Choisir les personnes · ${_helpers.length}/10')),
              SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Point d’enlèvement client'),
                  subtitle: const Text(
                      'Après réception réelle : informer les acheteurs éligibles.'),
                  value: _pickup,
                  onChanged:
                      locked ? null : (v) => setState(() => _pickup = v)),
              if (_pickup)
                TextField(
                    controller: _window,
                    enabled: !locked,
                    decoration: const InputDecoration(
                        labelText: 'Quand peut-on retirer les articles ?',
                        hintText: 'Vendredi de 19h à 21h à l’accueil',
                        border: OutlineInputBorder())),
              CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Autoriser les remises partielles'),
                  subtitle: const Text(
                      'Par défaut, attendre la commande complète et payée.'),
                  value: _partial,
                  onChanged: locked
                      ? null
                      : (v) => setState(() => _partial = v == true)),
              if (_destination.text.trim() == widget.location)
                CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text(
                        'Ces pièces sont déjà physiquement au point choisi'),
                    value: _presence,
                    onChanged: locked
                        ? null
                        : (v) => setState(() => _presence = v == true)),
            ],
            if (_action != null)
              TextField(
                  controller: _note,
                  enabled: !locked,
                  minLines: 1,
                  maxLines: 3,
                  decoration: InputDecoration(
                      labelText: ['confirmJim', 'finishJim', 'reviewPlain']
                              .contains(_action)
                          ? 'Contrôle effectué · obligatoire'
                          : 'Note pour ce lot · facultatif',
                      border: const OutlineInputBorder())),
          ],
          if (_error != null)
            Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(_error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error))),
          if (_pending != null)
            const Text(
                'Une confirmation est en attente de réponse. Réessayez pour connaître son résultat avant toute nouvelle action.'),
          FilledButton(
              onPressed: _busy || _selection.units.isEmpty || _action == null
                  ? null
                  : _confirm,
              child: Text(_busy
                  ? 'Vérification…'
                  : _pending != null
                      ? 'Vérifier la confirmation en attente'
                      : 'Vérifier et confirmer le lot')),
        ])));
  }
}
