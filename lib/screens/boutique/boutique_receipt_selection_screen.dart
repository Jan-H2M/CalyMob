import 'package:flutter/material.dart';
import '../../models/boutique/boutique_physical_unit.dart';
import '../../services/boutique/boutique_operations_service.dart';
import '../../widgets/boutique/boutique_access_guard.dart';
import 'boutique_stock_session_screen.dart';

/// A complete paged read, followed by an explicit subset at one actual place.
class BoutiqueReceiptSelectionScreen extends StatefulWidget {
  final String clubId, location;
  final BoutiqueOperationsService service;
  const BoutiqueReceiptSelectionScreen(
      {super.key,
      required this.clubId,
      required this.location,
      this.service = const BoutiqueOperationsService()});
  @override
  State<BoutiqueReceiptSelectionScreen> createState() =>
      _ReceiptSelectionState();
}

class _ReceiptSelectionState extends State<BoutiqueReceiptSelectionScreen> {
  List<BoutiquePhysicalUnit> _units = [];
  final _selected = <String>{};
  String? _batch, _error;
  bool _loading = true, _opening = false;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _selected.clear();
    });
    try {
      final units = await widget.service.listReceivedUnits(widget.clubId);
      if (!mounted) return;
      setState(() {
        _units = units;
        if (!_units.any((u) =>
            u.supplierBatchId == _batch && u.location == widget.location)) {
          _batch = null;
        }
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _units = [];
          _error = BoutiqueOperationsService.message(e);
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _continue(List<BoutiquePhysicalUnit> chosen) async {
    if (_loading || _opening || chosen.isEmpty) return;
    setState(() => _opening = true);
    final completed = await Navigator.push<bool>(
        context,
        boutiqueAccessGuardedRoute(
            sourceContext: context,
            requiredSection: 'gestion',
            builder: (_) => BoutiqueStockSessionScreen(
                clubId: widget.clubId,
                location: widget.location,
                assignees: const [],
                service: widget.service,
                initialUnits: chosen,
                moveOnly: true)));
    if (!mounted) return;
    setState(() => _opening = false);
    if (completed == true) {
      Navigator.pop(context, true);
    } else {
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final batches = <String, String>{};
    for (final unit in _units) {
      if (unit.location == widget.location && unit.supplierBatchId != null) {
        batches[unit.supplierBatchId!] = unit.supplierReference;
      }
    }
    final batchUnits =
        _units.where((u) => u.supplierBatchId == _batch).toList();
    final here =
        batchUnits.where((u) => u.location == widget.location).toList();
    final eligible = here.where((u) => !u.sold && !u.inTransport).toList();
    final chosen = eligible.where((u) => _selected.contains(u.id)).toList();
    return Scaffold(
        appBar: AppBar(title: const Text('Choisir une réception'), actions: [
          IconButton(
              tooltip: 'Actualiser',
              onPressed: _loading ? null : _load,
              icon: const Icon(Icons.refresh))
        ]),
        bottomNavigationBar: _loading || _error != null || _batch == null
            ? null
            : SafeArea(
                child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text('${chosen.length} pièce(s) sélectionnée(s)',
                              style: Theme.of(context).textTheme.titleMedium),
                          const Text(
                              'Seul le lieu change. La finition et les réservations sont conservées. Aucun message client.'),
                          FilledButton(
                              onPressed: chosen.isEmpty
                                  ? null
                                  : () => _continue(chosen),
                              child: Text(
                                  'Déplacer la sélection (${chosen.length})')),
                        ]))),
        body: SafeArea(
            child: ListView(padding: const EdgeInsets.all(16), children: [
          Text('Lieu actuel : ${widget.location}',
              style: Theme.of(context).textTheme.titleMedium),
          const Text(
              'Choisissez les pièces déjà reçues à déplacer. Aucun scan nécessaire.'),
          if (_loading) const LinearProgressIndicator(),
          if (_error != null) ...[
            Text(_error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
            TextButton(onPressed: _load, child: const Text('Réessayer'))
          ],
          if (!_loading && _error == null && batches.isEmpty)
            const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Text(
                    'Aucune réception fournisseur à ce lieu. Réceptionnez d’abord les articles dans Calypso.')),
          if (!_loading && _error == null && batches.isNotEmpty) ...[
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
                key: ValueKey(_batch),
                initialValue: _batch,
                isExpanded: true,
                decoration: const InputDecoration(
                    labelText: 'Réception fournisseur',
                    border: OutlineInputBorder()),
                items: batches.entries
                    .map((e) => DropdownMenuItem(
                        value: e.key,
                        child: Text(e.value, overflow: TextOverflow.ellipsis)))
                    .toList(),
                onChanged: (v) => setState(() {
                      _batch = v;
                      _selected.clear();
                    })),
            if (_batch != null) ...[
              const SizedBox(height: 12),
              Text(
                  '${here.length} pièce(s) à ${widget.location} · ${batchUnits.length - here.length} ailleurs'),
              Wrap(spacing: 8, children: [
                TextButton(
                    onPressed: eligible.isEmpty || eligible.length > 100
                        ? null
                        : () => setState(() {
                              _selected.clear();
                              _selected.addAll(eligible.map((u) => u.id));
                            }),
                    child: const Text('Tout sélectionner')),
                TextButton(
                    onPressed: _selected.isEmpty
                        ? null
                        : () => setState(_selected.clear),
                    child: const Text('Tout désélectionner'))
              ]),
              if (here.length > eligible.length)
                Text(
                    '${here.length - eligible.length} pièce(s) en transport ou déjà remises : indisponibles.'),
              if (eligible.length > 100)
                const Text(
                    '100 pièces maximum par déplacement. Choisissez les pièces à déplacer ensemble.'),
              ...here.map((u) => CheckboxListTile(
                  key: ValueKey('receipt-piece-${u.id}'),
                  contentPadding: EdgeInsets.zero,
                  title: Text(u.name),
                  subtitle: Text(
                      '${u.variant} · ${u.customerName}\n${u.inTransport ? 'En transport' : u.stage} · ${u.id.length > 8 ? u.id.substring(u.id.length - 8) : u.id}'),
                  value: _selected.contains(u.id),
                  onChanged: u.sold ||
                          u.inTransport ||
                          (!_selected.contains(u.id) && _selected.length >= 100)
                      ? null
                      : (v) => setState(() {
                            if (v == true) {
                              _selected.add(u.id);
                            } else {
                              _selected.remove(u.id);
                            }
                          }))),
            ]
          ],
        ])));
  }
}
