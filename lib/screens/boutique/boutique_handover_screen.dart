import 'package:flutter/material.dart';
import '../../models/boutique/boutique_physical_unit.dart';
import '../../services/boutique/boutique_operations_service.dart';
import '../../widgets/boutique/boutique_access_guard.dart';
import '../../widgets/boutique/boutique_operations_scaffold.dart';

/// Records a physical handover for an existing authorized pickup mission.
class BoutiqueHandoverScreen extends StatefulWidget {
  final String clubId, missionId;
  final Map<String, dynamic> packet;
  final bool manager;
  final BoutiqueOperationsService service;
  const BoutiqueHandoverScreen(
      {super.key,
      required this.clubId,
      required this.missionId,
      required this.packet,
      required this.manager,
      this.service = const BoutiqueOperationsService()});
  @override
  State<BoutiqueHandoverScreen> createState() => _BoutiqueHandoverScreenState();
}

class _BoutiqueHandoverScreenState extends State<BoutiqueHandoverScreen> {
  final _selected = <String, BoutiquePhysicalUnit>{};
  String? _error;
  bool _busy = false;
  Map<String, dynamic>? _pending;
  List<BoutiquePhysicalUnit> get _units => (widget.packet['units'] as List)
      .map((value) =>
          BoutiquePhysicalUnit(Map<String, dynamic>.from(value as Map)))
      .toList();
  Future<void> _submit() async {
    if (_busy || _selected.isEmpty) return;
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
        final request = <String, dynamic>{
          'expectedActorId': scope.userId,
          'missionId': widget.missionId,
          'units': _selected.values.map((u) => u.selection).toList(),
          'recipientMemberId': widget.packet['buyerId'],
          'verificationMethod': 'manual',
          'confirmed': true,
          'idempotencyKey': BoutiqueOperationsService.confirmationKey()
        };
        final preview = await widget.service
            .call(widget.clubId, 'deliver', {...request, 'preview': true});
        if (!mounted) return;
        if (preview['count'] != _selected.length) {
          throw const FormatException(
              'La sélection a changé. Actualisez avant de confirmer.');
        }
        _pending = request;
      }
      final result =
          await widget.service.call(widget.clubId, 'deliver', _pending!);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              'Remise confirmée : ${result['count']} pièce(s) à ${result['recipientName']}.')));
      Navigator.pop(context, result);
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
    final units = _units, locked = _busy || _pending != null;
    final allowed = _selected.isNotEmpty &&
        (widget.packet['allowPartial'] == true ||
            _selected.length == units.length);
    return BoutiqueOperationsScaffold(
        title: 'Remettre au membre',
        body: ListView(padding: const EdgeInsets.all(16), children: [
          Text('${widget.packet['buyerName']}',
              style: Theme.of(context).textTheme.headlineSmall),
          Text('${widget.packet['orderNumber']}'),
          const SizedBox(height: 16),
          const Text('Sélectionnez les pièces que vous remettez maintenant.'),
          TextButton(
              onPressed: locked
                  ? null
                  : () => setState(() {
                        for (final u in units) {
                          _selected[u.id] = u;
                        }
                      }),
              child: const Text('Tout sélectionner')),
          for (final u in units)
            CheckboxListTile(
                value: _selected.containsKey(u.id),
                controlAffinity: ListTileControlAffinity.leading,
                title: Text(u.name),
                subtitle: Text(u.variant),
                onChanged: locked
                    ? null
                    : (v) => setState(() {
                          if (v == true) {
                            _selected[u.id] = u;
                          } else {
                            _selected.remove(u.id);
                          }
                        })),
          if (_selected.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
                '${_selected.length} pièce(s) pour ${widget.packet['buyerName']}',
                style: const TextStyle(fontWeight: FontWeight.w700)),
            if (!allowed)
              const Text('Cette mission ne permet pas une remise partielle.'),
            TextButton(
                onPressed: locked ? null : () => setState(_selected.clear),
                child: const Text('Effacer la sélection')),
            FilledButton(
                onPressed:
                    _busy || (_pending == null && !allowed) ? null : _submit,
                child: Text(_pending == null
                    ? 'Confirmer la remise'
                    : 'Vérifier la confirmation en attente'))
          ],
          if (_error != null)
            Text(_error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ]));
  }
}
