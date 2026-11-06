import 'package:flutter/material.dart';
import '../../models/boutique/boutique_physical_unit.dart';
import '../../services/boutique/boutique_operations_service.dart';
import '../../widgets/boutique/boutique_access_guard.dart';
import '../../widgets/boutique/boutique_operations_scaffold.dart';

/// Hand over paid, ready pieces directly without creating a transport mission.
class BoutiqueDirectHandoverScreen extends StatefulWidget {
  const BoutiqueDirectHandoverScreen(
      {super.key, required this.clubId, required this.service});
  final String clubId;
  final BoutiqueOperationsService service;
  @override
  State<BoutiqueDirectHandoverScreen> createState() => _State();
}

class _State extends State<BoutiqueDirectHandoverScreen> {
  final _rows = <Map<String, dynamic>>[];
  final _selected = <String, BoutiquePhysicalUnit>{};
  String _query = '';
  String? _buyer, _buyerName, _error;
  Map<String, dynamic>? _pending;
  bool _loading = true, _busy = false;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = <Map<String, dynamic>>[];
      final seen = <String>{};
      String? cursor;
      while (true) {
        final page = await widget.service.call(widget.clubId,
            'handoverCandidates', {if (cursor != null) 'cursor': cursor});
        rows.addAll((page['units'] as List)
            .map((v) => Map<String, dynamic>.from(v as Map)));
        if (page['hasMore'] != true) break;
        cursor = page['nextCursor'] as String?;
        if (cursor == null || !seen.add(cursor) || seen.length > 100) {
          throw const FormatException('Liste incomplète. Actualisez.');
        }
      }
      if (mounted) {
        setState(() {
          _rows
            ..clear()
            ..addAll(rows);
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = BoutiqueOperationsService.messageForNewRead(e));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    if (_busy || _selected.isEmpty || _buyer == null) return;
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
          'recipientMemberId': _buyer,
          'verificationMethod': 'manual',
          'confirmed': true,
          'units': _selected.values.map((u) => u.selection).toList(),
          'idempotencyKey': BoutiqueOperationsService.confirmationKey()
        };
        final preview = await widget.service
            .call(widget.clubId, 'manualDeliver', {...req, 'preview': true});
        if (!mounted) return;
        if (preview['count'] != _selected.length) {
          throw const FormatException('La sélection a changé. Actualisez.');
        }
        final confirmed = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
                    title: const Text('Confirmer la remise ?'),
                    content: Text(
                        'Remettre ${_selected.length} pièce(s) à $_buyerName ?'),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: const Text('Annuler')),
                      FilledButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          child: const Text('Confirmer'))
                    ]));
        if (!mounted || confirmed != true) return;
        _pending = req;
      }
      final result =
          await widget.service.call(widget.clubId, 'manualDeliver', _pending!);
      if (!mounted) return;
      setState(() {
        _pending = null;
        _selected.clear();
        _buyer = null;
        _buyerName = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Remise confirmée : ${result['count']} pièce(s).')));
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
    final visible = _rows
        .where((r) =>
            '${r['buyerName']} ${r['orderNumber']} ${r['productName']} ${r['variantLabel']}'
                .toLowerCase()
                .contains(_query))
        .toList();
    final locked = _busy || _pending != null;
    return BoutiqueOperationsScaffold(
        title: 'Remise aux membres',
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const Text('Choisissez les pièces à remettre à un membre.'),
          const SizedBox(height: 12),
          TextField(
              onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
              decoration: const InputDecoration(
                  labelText: 'Membre, commande ou article',
                  prefixIcon: Icon(Icons.search),
                  border: OutlineInputBorder())),
          if (_loading) const LinearProgressIndicator(),
          if (_error != null)
            Text(_error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
          if (!_loading && visible.isEmpty && _error == null)
            const Padding(
                padding: EdgeInsets.all(16),
                child: Text('Aucune pièce disponible à remettre.')),
          for (final row in visible)
            CheckboxListTile(
                value: _selected.containsKey(row['id']),
                controlAffinity: ListTileControlAffinity.leading,
                title: Text('${row['buyerName']} · ${row['productName']}'),
                subtitle: Text(
                    '${row['variantLabel'] ?? ''} · ${row['orderNumber']} · ${row['location']}'),
                onChanged: locked
                    ? null
                    : (v) => setState(() {
                          final buyer = row['buyerId'] as String;
                          if (_buyer != null && _buyer != buyer) {
                            _selected.clear();
                          }
                          _buyer = buyer;
                          _buyerName = row['buyerName'] as String? ?? 'Membre';
                          final unit = BoutiquePhysicalUnit(row);
                          if (v == true) {
                            _selected[unit.id] = unit;
                          } else {
                            _selected.remove(unit.id);
                            if (_selected.isEmpty) {
                              _buyer = null;
                              _buyerName = null;
                            }
                          }
                        })),
          if (_selected.isNotEmpty) ...[
            Text('${_selected.length} pièce(s) · $_buyerName'),
            TextButton(
                onPressed: locked
                    ? null
                    : () => setState(() {
                          _selected.clear();
                          _buyer = null;
                          _buyerName = null;
                        }),
                child: const Text('Effacer la sélection')),
            FilledButton(
                onPressed: _busy ? null : _submit,
                child: Text(_pending == null
                    ? 'Remettre au membre'
                    : 'Vérifier la confirmation en attente'))
          ]
        ]));
  }
}
