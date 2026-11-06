import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../services/boutique/boutique_operations_service.dart';
import '../../widgets/boutique/boutique_operations_scaffold.dart';

/// RB-only read projection; no order or payment mutations are offered here.
class BoutiqueOrdersOverviewScreen extends StatefulWidget {
  const BoutiqueOrdersOverviewScreen(
      {super.key, required this.clubId, required this.service});
  final String clubId;
  final BoutiqueOperationsService service;
  @override
  State<BoutiqueOrdersOverviewScreen> createState() => _State();
}

class _State extends State<BoutiqueOrdersOverviewScreen> {
  final _orders = <Map<String, dynamic>>[];
  String? _cursor, _error;
  String _query = '';
  bool _loading = false, _more = true;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_loading || !_more) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await widget.service.call(widget.clubId, 'orderOverview',
          {if (_cursor != null) 'cursor': _cursor});
      final rows = (page['orders'] as List)
          .map((v) => Map<String, dynamic>.from(v as Map))
          .toList();
      final next = page['nextCursor'] as String?;
      final more = page['hasMore'] == true;
      if (more && (next == null || next == _cursor)) {
        throw const FormatException('Impossible de charger la page suivante.');
      }
      if (!mounted) return;
      setState(() {
        final seen = _orders.map((o) => o['id']).toSet();
        _orders.addAll(rows.where((o) => seen.add(o['id'])));
        _cursor = next;
        _more = more;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _error = BoutiqueOperationsService.messageForNewRead(e));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String payment(String v) => switch (v) {
        'paid' => 'Payé',
        'pending' => 'Non payé',
        'review' => 'Paiement à vérifier',
        _ => 'Paiement à vérifier'
      };
  String state(String v) => switch (v) {
        'awaiting_payment' => 'En attente de paiement',
        'paid' => 'Payée',
        'preparing' => 'En cours',
        'ready' => 'Prête à remettre',
        'delivered' => 'Entièrement remise',
        'cancelled' => 'Annulée',
        _ => 'À vérifier'
      };
  String lineStatus(String v) => switch (v) {
        'awaiting_restock' => 'En attente de stock',
        'delivered' => 'Remis',
        'ready' => 'Prêt à remettre',
        'preparing' => 'En préparation',
        'pending' => 'En attente',
        'awaiting_payment' => 'En attente de paiement',
        _ => 'À vérifier'
      };
  @override
  Widget build(BuildContext context) {
    final rows = _orders.where((o) {
      final items = (o['items'] as List? ?? []);
      return '${o['orderNumber']} ${o['customerName']} ${items.map((i) => i['name']).join(' ')}'
          .toLowerCase()
          .contains(_query);
    }).toList();
    return BoutiqueOperationsScaffold(
        title: 'Commandes clients',
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const Text('Paiement et suivi des commandes.'),
          const SizedBox(height: 12),
          TextField(
              onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
              decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  labelText: 'Commande, membre ou article',
                  border: OutlineInputBorder())),
          if (_error != null) ...[
            Text(_error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
            TextButton(
                onPressed: _loading ? null : _load,
                child: const Text('Réessayer'))
          ],
          if (_loading) const LinearProgressIndicator(),
          for (final o in rows)
            Card(
                child: ExpansionTile(
                    title: Text('${o['orderNumber']} · ${o['customerName']}'),
                    subtitle: Text(
                        '${payment(o['paymentStatus'] as String? ?? '')} · ${state(o['status'] as String? ?? '')}${o['total'] is num ? ' · ${NumberFormat.currency(locale: 'fr_BE', symbol: '€').format(o['total'])}' : ''}'),
                    children: [
                  for (final raw in o['items'] as List? ?? [])
                    ListTile(
                        title: Text('${raw['name']} · x${raw['qty']}'),
                        subtitle: Text(
                            '${raw['variant']}\n${lineStatus(raw['status'] as String? ?? '')}'),
                        isThreeLine: true)
                ])),
          if (!_loading && rows.isEmpty && _error == null)
            const Padding(
                padding: EdgeInsets.all(16),
                child: Text('Aucune commande correspondante.')),
          if (_more && !_loading && _error == null)
            OutlinedButton(
                onPressed: _load,
                child: const Text('Charger les commandes suivantes')),
          if (_more && _query.isNotEmpty)
            const Text('La recherche porte sur les commandes chargées.'),
        ]));
  }
}
