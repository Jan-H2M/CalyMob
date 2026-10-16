import 'package:flutter/material.dart';
import '../../models/boutique/boutique_physical_unit.dart';
import '../../models/boutique/boutique_unit_qr.dart';
import '../../services/boutique/boutique_operations_service.dart';
import '../../widgets/boutique/boutique_access_guard.dart';
import 'boutique_qr_scan_screen.dart';

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
  final _scanned = <String, BoutiquePhysicalUnit>{};
  String? _recipient, _error;
  bool _confirmed = false, _busy = false;
  Map<String, dynamic>? _pending;
  String get _section => widget.manager ? 'gestion' : 'remises';
  Future<String> _scanArticle(String value) async {
    final qr = BoutiqueUnitQr.parse(value);
    if (qr == null || qr.clubId != widget.clubId) {
      throw const FormatException('Scannez une fiche article de ce club.');
    }
    if (_scanned.containsKey(qr.unitId)) {
      throw const FormatException('Cette pièce est déjà scannée.');
    }
    if (!(widget.packet['units'] as List).any((u) => u['id'] == qr.unitId)) {
      throw const FormatException('Cette pièce appartient à un autre colis.');
    }
    final unit = await widget.service
        .lookup(widget.clubId, qr.unitId, missionId: widget.missionId);
    if (unit.sold || unit.data['pickupMissionId'] != widget.missionId) {
      throw const FormatException(
          'Cette pièce n’est plus disponible dans ce lot.');
    }
    if (!mounted) throw const FormatException('Remise fermée.');
    setState(() {
      _scanned[unit.id] = unit;
      _confirmed = false;
    });
    return '${_scanned.length} pièce(s) vérifiée(s) pour ${widget.packet['buyerName']}';
  }

  Future<String> _scanMember(String value) async {
    final id = BoutiqueUnitQr.memberId(value);
    if (id == null || id != widget.packet['buyerId']) {
      throw const FormatException(
          'Ce QR ne correspond pas à l’acheteur. Aucune remise enregistrée.');
    }
    if (mounted) {
      setState(() {
        _recipient = id;
        _confirmed = false;
      });
    }
    return 'Membre correspondant';
  }

  Future<void> _submit() async {
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
          'recipientMemberId': _recipient,
          'confirmed': true,
          'idempotencyKey': BoutiqueOperationsService.confirmationKey()
        };
        final p = await widget.service
            .call(widget.clubId, 'deliver', {...request, 'preview': true});
        if (!mounted) return;
        final yes = await showDialog<bool>(
            context: context,
            builder: (c) => AlertDialog(
                    title: const Text('Confirmer la remise physique'),
                    content: Text(
                        '${p['count']} pièce(s) à ${widget.packet['buyerName']}, à ${p['destination']}.\n\nLe QR identifie le membre. Votre confirmation enregistre qui a réellement effectué cette remise.'),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(c, false),
                          child: const Text('Revoir')),
                      FilledButton(
                          onPressed: () => Navigator.pop(c, true),
                          child: const Text('Articles remis'))
                    ]));
        if (!mounted || yes != true) return;
        _pending = request;
      }
      final result =
          await widget.service.call(widget.clubId, 'deliver', _pending!);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              'Remise confirmée : ${result['count']} pièce(s) à ${result['recipientName']}.')));
      Navigator.pop(context, true);
    } catch (e) {
      if (BoutiqueOperationsService.definitiveFailure(e)) {
        _pending = null;
        _scanned.clear();
        _confirmed = false;
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
    final locked = _busy || _pending != null;
    return Scaffold(
        appBar: AppBar(title: const Text('Remettre au membre')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          Text('${widget.packet['buyerName']}',
              style: Theme.of(context).textTheme.headlineSmall),
          Text('${widget.packet['orderNumber']}'),
          const SizedBox(height: 20),
          const Text('1. Vérifier les articles du colis'),
          ...(widget.packet['units'] as List).map((u) => ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('${u['productName']}'),
              subtitle: Text('${u['variantLabel']}'),
              leading: Icon(_scanned.containsKey(u['id'])
                  ? Icons.check_circle
                  : Icons.radio_button_unchecked),
              trailing: _scanned.containsKey(u['id'])
                  ? IconButton(
                      tooltip: 'Retirer de la remise',
                      onPressed: locked
                          ? null
                          : () => setState(() {
                                _scanned.remove(u['id']);
                                _confirmed = false;
                              }),
                      icon: const Icon(Icons.close))
                  : null)),
          FilledButton.icon(
              onPressed: locked
                  ? null
                  : () => Navigator.push(
                      context,
                      boutiqueAccessGuardedRoute(
                          sourceContext: context,
                          requiredSection: _section,
                          builder: (_) => BoutiqueQrScanScreen(
                              title: 'Vérifier les articles',
                              instruction:
                                  'Scannez chaque fiche du colis de ${widget.packet['buyerName']}.',
                              onScan: _scanArticle))),
              icon: const Icon(Icons.qr_code_scanner),
              label:
                  Text('Scanner les articles · ${_scanned.length} vérifié(s)')),
          const SizedBox(height: 24),
          const Text('2. Identifier l’acheteur'),
          OutlinedButton.icon(
              onPressed: locked
                  ? null
                  : () => Navigator.push(
                      context,
                      boutiqueAccessGuardedRoute(
                          sourceContext: context,
                          requiredSection: _section,
                          builder: (_) => BoutiqueQrScanScreen(
                              title: 'QR du membre',
                              instruction:
                                  'Demandez à ${widget.packet['buyerName']} d’afficher son QR personnel CalyMob.',
                              onScan: _scanMember,
                              closeAfterScan: true))),
              icon: const Icon(Icons.person_search_outlined),
              label: Text(_recipient == null
                  ? 'Scanner le QR du membre'
                  : 'Membre vérifié · ${widget.packet['buyerName']}')),
          const SizedBox(height: 24),
          const Text('3. Confirmer la remise'),
          CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text(
                  'J’ai physiquement remis les articles scannés à ce membre'),
              subtitle: const Text(
                  'Le QR identifie le membre ; il ne remplace pas votre vérification de la personne présente.'),
              value: _confirmed,
              onChanged: locked || _recipient == null || _scanned.isEmpty
                  ? null
                  : (v) => setState(() => _confirmed = v == true)),
          if (_error != null)
            Text(_error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
          if (_pending != null)
            const Text(
                'Une confirmation est en attente. Réessayez pour vérifier son résultat ; aucun double enregistrement ne sera créé.'),
          FilledButton(
              onPressed: _busy ||
                      (_pending == null &&
                          (!_confirmed ||
                              _recipient == null ||
                              _scanned.isEmpty))
                  ? null
                  : _submit,
              child: Text(_busy
                  ? 'Vérification…'
                  : _pending != null
                      ? 'Vérifier la confirmation en attente'
                      : 'Confirmer la remise')),
        ]));
  }
}
