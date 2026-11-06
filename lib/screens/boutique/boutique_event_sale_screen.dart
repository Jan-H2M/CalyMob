import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../models/boutique/boutique_physical_unit.dart';
import '../../services/boutique/boutique_operations_service.dart';
import '../../widgets/boutique/boutique_access_guard.dart';
import '../../widgets/boutique/boutique_operations_scaffold.dart';
import 'boutique_qr_scan_screen.dart';

class BoutiqueEventSaleScreen extends StatefulWidget {
  const BoutiqueEventSaleScreen(
      {super.key, required this.clubId, required this.service});
  final String clubId;
  final BoutiqueOperationsService service;
  @override
  State<BoutiqueEventSaleScreen> createState() => _State();
}

class _State extends State<BoutiqueEventSaleScreen> {
  final _selected = <String, Map<String, dynamic>>{};
  List<Map<String, dynamic>> _units = [],
      _members = [],
      _events = [],
      _pendingSales = [];
  Map<String, dynamic>? _buyer, _event, _active;
  String _productQuery = '', _memberQuery = '';
  String? _error, _key, _lastAction;
  bool _loading = true,
      _busy = false,
      _checked = false,
      _verified = false,
      _checking = false;
  Timer? _timer;
  int _step = 0;
  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_key == null) {
      final scope = BoutiqueAccessScope.maybeOf(context);
      if (scope != null) {
        _key = 'boutique_event_sale_${widget.clubId}_${scope.userId}';
        _load();
      }
    }
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    if (_active == null) {
      await prefs.remove(_key!);
    } else {
      await prefs.setString(_key!, jsonEncode(_active));
    }
  }

  Future<List<Map<String, dynamic>>> _pages(String action, String field) async {
    final result = <Map<String, dynamic>>[];
    final seen = <String>{};
    String? cursor;
    while (true) {
      final page = await widget.service
          .call(widget.clubId, action, {if (cursor != null) 'cursor': cursor});
      result.addAll((page[field] as List)
          .map((v) => Map<String, dynamic>.from(v as Map)));
      if (page['hasMore'] != true) break;
      cursor = page['nextCursor'] as String?;
      if (cursor == null || !seen.add(cursor) || seen.length > 100) {
        throw const FormatException('Liste incomplète. Actualisez.');
      }
    }
    return result;
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_key!);
      if (saved != null) {
        _active = Map<String, dynamic>.from(jsonDecode(saved) as Map);
        if (mounted) setState(() => _step = 2);
        if (_active!['result'] != null) await _verify();
        return;
      }
      try {
        final pending = await _pages('salePending', 'sales');
        if (mounted) setState(() => _pendingSales = pending);
      } catch (e) {
        if (mounted) {
          setState(() => _error = BoutiqueOperationsService.message(e));
        }
      }
      final all = await Future.wait([
        _pages('saleCatalog', 'units'),
        _pages('saleMembers', 'members'),
        widget.service
            .call(widget.clubId, 'saleEvents')
            .catchError((_) => <String, dynamic>{'events': []})
      ]);
      if (!mounted) return;
      setState(() {
        _units = all[0] as List<Map<String, dynamic>>;
        _members = all[1] as List<Map<String, dynamic>>;
        _members.sort((a, b) => '${a['name']}'
            .toLowerCase()
            .compareTo('${b['name']}'.toLowerCase()));
        _events = ((all[2] as Map)['events'] as List)
            .map((v) => Map<String, dynamic>.from(v as Map))
            .toList();
      });
    } catch (e) {
      if (mounted) {
        setState(() => _error = BoutiqueOperationsService.message(e));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<String> _scan(String value) async {
    final id =
        BoutiqueScanSelection(clubId: widget.clubId, location: '').parse(value);
    final matches = _units.where((u) => u['id'] == id);
    if (matches.isEmpty) {
      throw const FormatException(
          'Cette pièce n’est pas disponible pour la vente.');
    }
    if (_selected.containsKey(id)) {
      throw const FormatException('Cette pièce est déjà sélectionnée.');
    }
    if (_selected.length >= 30) {
      throw const FormatException('30 pièces maximum.');
    }
    setState(() => _selected[id] = matches.first);
    return 'Pièce sélectionnée';
  }

  Future<void> _prepare() async {
    if (_busy || _buyer == null || _selected.isEmpty) return;
    final scope = BoutiqueAccessScope.maybeOf(context);
    if (scope == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final req = <String, dynamic>{
        'expectedActorId': scope.userId,
        'recipientMemberId': _buyer!['id'],
        'units': _selected.values
            .map((v) => BoutiquePhysicalUnit(v).selection)
            .toList(),
        'idempotencyKey': BoutiqueOperationsService.confirmationKey(),
        if (_event != null) 'eventId': _event!['id']
      };
      final preview = await widget.service
          .call(widget.clubId, 'salePrepare', {...req, 'preview': true});
      if (!mounted) return;
      if (preview['total'] is! num) {
        throw const FormatException('Prix indisponible.');
      }
      _active = {
        'request': req,
        'buyerName': _buyer!['name'],
        'ids': _selected.keys.toList()
      };
      await _save();
      if (mounted) setState(() => _step = 2);
      await _resumePrepare();
    } catch (e) {
      if (mounted) {
        setState(() => _error = BoutiqueOperationsService.message(e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resumePrepare() async {
    try {
      final req = Map<String, dynamic>.from(_active!['request'] as Map);
      final result =
          await widget.service.call(widget.clubId, 'salePrepare', req);
      _active!['result'] = result;
      await _save();
      if (mounted) setState(() => _step = 2);
      await _verify();
    } catch (e) {
      if (BoutiqueOperationsService.definitiveFailure(e)) {
        _active = null;
        await _save();
        if (mounted) {
          setState(() {
            _step = 0;
            _selected.clear();
          });
          await _load();
        }
      }
      rethrow;
    }
  }

  Future<void> _resumeSale(Map<String, dynamic> sale) async {
    _active = {
      'request': {'recipientMemberId': sale['buyerId']},
      'buyerName': sale['buyerName'],
      'ids': sale['ids'],
      'result': sale
    };
    await _save();
    if (mounted) {
      setState(() {
        _step = 2;
        _verified = false;
      });
    }
    await _verify();
  }

  Future<void> _verify() async {
    if (_checking || _active == null || _active!['result'] == null) return;
    _checking = true;
    try {
      final orderId = (_active!['result'] as Map)['orderId'] as String;
      final fresh = await widget.service
          .call(widget.clubId, 'saleLookup', {'orderId': orderId});
      if (fresh['open'] != true) {
        _timer?.cancel();
        _active = null;
        await _save();
        if (mounted) {
          setState(() {
            _verified = false;
            _step = 3;
            _lastAction = 'closed';
          });
        }
        return;
      }
      _active!['result'] = fresh;
      _active!['buyerName'] = fresh['buyerName'];
      await _save();
      if (mounted) {
        setState(() {
          _verified = true;
          if (fresh['paymentStatus'] == 'paid') _checked = true;
        });
      }
      _timer ??= Timer.periodic(const Duration(seconds: 10), (_) {
        if (!_busy) _verify();
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _verified = false;
          _error =
              'Impossible de vérifier la vente. Réessayez avant de montrer le QR.';
        });
      }
    } finally {
      _checking = false;
    }
  }

  Future<void> _finish(String action) async {
    if (_busy || _active == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_active!['finishRequest'] == null) {
        await _verify();
        if (!_verified || _active == null) return;
        final ids = List<String>.from(_active!['ids'] as List);
        final units = <Map<String, dynamic>>[];
        for (final id in ids) {
          units.add((await widget.service.lookup(widget.clubId, id)).selection);
        }
        if (!mounted) return;
        final scope = BoutiqueAccessScope.maybeOf(context);
        if (scope == null) {
          throw const FormatException('Accès Boutique à vérifier.');
        }
        _active!['finishAction'] = action;
        _active!['finishRequest'] = {
          'expectedActorId': scope.userId,
          'recipientMemberId':
              (_active!['request'] as Map)['recipientMemberId'],
          'units': units,
          'confirmed': true,
          'idempotencyKey': BoutiqueOperationsService.confirmationKey()
        };
        await _save();
      }
      final savedAction = _active!['finishAction'] as String;
      await widget.service.call(widget.clubId, savedAction,
          Map<String, dynamic>.from(_active!['finishRequest'] as Map));
      _active = null;
      await _save();
      if (mounted) {
        setState(() {
          _lastAction = savedAction;
          _step = 3;
        });
      }
    } catch (e) {
      if (_active != null && BoutiqueOperationsService.definitiveFailure(e)) {
        _active!.remove('finishRequest');
        _active!.remove('finishAction');
        await _save();
      }
      if (mounted) {
        setState(() => _error = BoutiqueOperationsService.message(e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final total = _selected.values
        .fold<double>(0, (n, v) => n + (v['price'] as num).toDouble());
    final visible = _units
        .where((u) => '${u['productName']} ${u['variantLabel']}'
            .toLowerCase()
            .contains(_productQuery))
        .toList();
    final members = _members
        .where((m) => '${m['name']}'.toLowerCase().contains(_memberQuery))
        .toList();
    final result = _active?['result'] as Map?;
    return BoutiqueOperationsScaffold(
        title: 'Vente directe',
        body: Column(children: [
          Expanded(
              child: ListView(padding: const EdgeInsets.all(16), children: [
            if (_loading) const LinearProgressIndicator(),
            if (_error != null)
              Text(_error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error)),
            if (_step == 0) ...[
              if (_pendingSales.isNotEmpty)
                ExpansionTile(
                    title: Text('Ventes à reprendre · ${_pendingSales.length}'),
                    children: [
                      for (final sale in _pendingSales)
                        ListTile(
                            title: Text(
                                '${sale['orderNumber']} · ${sale['buyerName']}'),
                            subtitle: Text(sale['paymentStatus'] == 'paid'
                                ? 'Paiement reçu · remise à confirmer'
                                : 'Paiement et remise à vérifier'),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => _resumeSale(sale))
                    ]),
              const Text('Choisissez les pièces disponibles.'),
              TextField(
                  onChanged: (v) =>
                      setState(() => _productQuery = v.trim().toLowerCase()),
                  decoration: const InputDecoration(
                      labelText: 'Rechercher un article',
                      prefixIcon: Icon(Icons.search))),
              OutlinedButton.icon(
                  onPressed: _loading
                      ? null
                      : () => Navigator.push(
                          context,
                          boutiqueAccessGuardedRoute(
                              sourceContext: context,
                              requiredSection: 'gestion',
                              builder: (_) => BoutiqueQrScanScreen(
                                  title: 'Scanner un article',
                                  instruction: 'Scannez le QR de la pièce.',
                                  onScan: _scan))),
                  icon: const Icon(Icons.qr_code_scanner),
                  label: const Text('Scanner un article')),
              for (final u in visible)
                CheckboxListTile(
                    value: _selected.containsKey(u['id']),
                    title: Text('${u['productName']}'),
                    subtitle: Text('${u['variantLabel']} · ${u['location']}'),
                    secondary:
                        Text('${(u['price'] as num).toStringAsFixed(2)} €'),
                    onChanged: (v) => setState(() {
                          if (v == true && _selected.length < 30) {
                            _selected[u['id'] as String] = u;
                          } else if (v == false) {
                            _selected.remove(u['id']);
                          }
                        }))
            ],
            if (_step == 1) ...[
              const Text('Acheteur et événement'),
              TextField(
                  onChanged: (v) => setState(() {
                        _memberQuery = v.trim().toLowerCase();
                        _buyer = null;
                      }),
                  decoration: const InputDecoration(
                      labelText: 'Rechercher un membre',
                      prefixIcon: Icon(Icons.search))),
              if (_buyer != null)
                ListTile(
                    leading: const Icon(Icons.check_circle),
                    title: Text('${_buyer!['name']}')),
              if (_buyer == null)
                SizedBox(
                  height: 220,
                  child: members.isEmpty
                      ? const Center(child: Text('Aucun membre trouvé.'))
                      : ListView.builder(
                          itemCount: members.length,
                          itemBuilder: (context, index) {
                            final member = members[index];
                            final name = '${member['name']}';
                            return ListTile(
                              leading: CircleAvatar(
                                  child: Text(name.isEmpty
                                      ? '?'
                                      : name[0].toUpperCase())),
                              title: Text(name),
                              onTap: () => setState(() => _buyer = member),
                            );
                          },
                        ),
                ),
              DropdownButtonFormField<String>(
                  initialValue: _event?['id'] as String?,
                  decoration: const InputDecoration(
                      labelText: 'Événement proche (facultatif)'),
                  items: [
                    for (final e in _events)
                      DropdownMenuItem(
                          value: e['id'] as String, child: Text('${e['name']}'))
                  ],
                  onChanged: (v) => setState(() =>
                      _event = _events.where((e) => e['id'] == v).firstOrNull)),
              const SizedBox(height: 20),
              FilledButton(
                  onPressed: _buyer == null || _busy ? null : _prepare,
                  child: const Text('Afficher le QR de paiement'))
            ],
            if (_step == 2 && result == null) ...[
              const Text('Vérification de la vente en attente.'),
              FilledButton(
                  onPressed: _busy
                      ? null
                      : () async {
                          setState(() => _busy = true);
                          try {
                            await _resumePrepare();
                          } catch (e) {
                            if (mounted) {
                              setState(() => _error =
                                  BoutiqueOperationsService.message(e));
                            }
                          } finally {
                            if (mounted) setState(() => _busy = false);
                          }
                        },
                  child: const Text('Retrouver la vente'))
            ],
            if (_step == 2 && result != null) ...[
              Text('${_active!['buyerName']}',
                  style: Theme.of(context).textTheme.titleLarge),
              Text('${(result['total'] as num).toStringAsFixed(2)} €'),
              if (!_verified)
                TextButton(
                    onPressed: _busy ? null : _verify,
                    child: const Text('Vérifier la vente')),
              if (_verified && result['paymentStatus'] != 'paid')
                Center(
                    child: QrImageView(
                        data: result['epcPayload'] as String, size: 220)),
              Text('Communication : ${result['communication']}'),
              Text(result['paymentStatus'] == 'paid'
                  ? 'Paiement reçu par la banque.'
                  : 'Vérifiez la confirmation du paiement dans l’application bancaire de l’acheteur.'),
              CheckboxListTile(
                  value: _checked,
                  onChanged: _busy
                      ? null
                      : (v) => setState(() => _checked = v == true),
                  title: const Text(
                      'J’ai vérifié la confirmation chez l’acheteur')),
              FilledButton(
                  onPressed: _busy ||
                          (!_verified && _active!['finishRequest'] == null) ||
                          (!_checked && _active!['finishRequest'] == null)
                      ? null
                      : () => _finish('saleComplete'),
                  child: Text(_active!['finishRequest'] != null
                      ? 'Vérifier la confirmation en attente'
                      : 'Confirmer la remise')),
              TextButton(
                  onPressed: _busy ||
                          !_verified ||
                          _active!['finishRequest'] != null ||
                          result['paymentStatus'] == 'paid'
                      ? null
                      : () async {
                          final yes = await showDialog<bool>(
                              context: context,
                              builder: (ctx) => AlertDialog(
                                      title: const Text('Annuler la vente ?'),
                                      content: const Text(
                                          'Confirmez que l’acheteur n’a pas effectué le paiement. La pièce sera libérée.'),
                                      actions: [
                                        TextButton(
                                            onPressed: () =>
                                                Navigator.pop(ctx, false),
                                            child: const Text('Retour')),
                                        TextButton(
                                            onPressed: () =>
                                                Navigator.pop(ctx, true),
                                            child:
                                                const Text('Annuler la vente'))
                                      ]));
                          if (yes == true) await _finish('saleCancel');
                        },
                  child: const Text('Annuler la vente'))
            ],
            if (_step == 3) ...[
              Text(_lastAction == 'saleCancel'
                  ? 'Vente annulée. Les pièces sont de nouveau disponibles.'
                  : _lastAction == 'closed'
                      ? 'Cette vente est déjà terminée ou annulée.'
                      : 'Remise enregistrée. La vente est inscrite dans le stock et la réception bancaire sera liée automatiquement.'),
              FilledButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Terminer'))
            ]
          ])),
          if (_step == 0)
            SafeArea(
                child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    child: Row(children: [
                      Expanded(
                          child: Text(
                              '${_selected.length} pièce(s) · ${total.toStringAsFixed(2)} €')),
                      FilledButton(
                          onPressed: _selected.isEmpty
                              ? null
                              : () => setState(() => _step = 1),
                          child: const Text('Continuer'))
                    ])))
        ]));
  }
}
