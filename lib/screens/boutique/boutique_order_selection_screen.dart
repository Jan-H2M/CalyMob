import 'package:flutter/material.dart';
import '../../models/boutique/boutique_physical_unit.dart';
import '../../services/boutique/boutique_operations_service.dart';

/// Only selects existing physical pieces. No action, payment or stock write.
class BoutiqueOrderSelectionScreen extends StatefulWidget {
  final String clubId, location;
  final BoutiqueOperationsService service;
  const BoutiqueOrderSelectionScreen(
      {super.key,
      required this.clubId,
      required this.location,
      required this.service});
  @override
  State<BoutiqueOrderSelectionScreen> createState() =>
      _BoutiqueOrderSelectionScreenState();
}

class _BoutiqueOrderSelectionScreenState
    extends State<BoutiqueOrderSelectionScreen> {
  final _orders = <Map<String, dynamic>>[];
  String? _cursor, _error;
  String _search = '';
  bool _loading = true, _hasMore = false;
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
      final result = await widget.service.call(widget.clubId, 'orders', {
        if (_cursor != null) 'cursor': _cursor,
      });
      if (!mounted) return;
      setState(() {
        final ids = _orders.map((o) => o['id']).toSet();
        _orders.addAll((result['orders'] as List)
            .map((o) => Map<String, dynamic>.from(o as Map))
            .where((o) => ids.add(o['id'])));
        _cursor = result['nextCursor'] as String?;
        _hasMore = result['hasMore'] == true;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _error = BoutiqueOperationsService.message(e));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _choose(Map<String, dynamic> order) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result =
          await widget.service.call(widget.clubId, 'orderSelection', {
        'orderId': order['id'],
        'sourceLocation': widget.location,
      });
      final units = (result['units'] as List)
          .map((u) => BoutiquePhysicalUnit(Map<String, dynamic>.from(u as Map)))
          .toList();
      if (mounted) Navigator.pop(context, units);
    } catch (e) {
      if (mounted) {
        setState(() => _error = BoutiqueOperationsService.message(e));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final orders = _orders.where((o) =>
        '${o['orderNumber']} ${o['customerName']}'
            .toLowerCase()
            .contains(_search));
    return Scaffold(
      appBar: AppBar(title: const Text('Sélectionner une commande')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('Lieu : ${widget.location}'),
        const Text(
            'Ajoute toutes les pièces physiques restantes, uniquement si elles sont présentes à ce lieu. Aucune action n’est encore effectuée.'),
        const SizedBox(height: 12),
        TextField(
            decoration: const InputDecoration(
                labelText: 'Rechercher dans les commandes chargées',
                prefixIcon: Icon(Icons.search)),
            onChanged: (value) =>
                setState(() => _search = value.trim().toLowerCase())),
        if (_loading) const LinearProgressIndicator(),
        if (_error != null) ...[
          Text(_error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error)),
          TextButton(
              onPressed: _loading ? null : _load,
              child: const Text('Réessayer le chargement')),
        ],
        for (final order in orders)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(order['orderNumber'] as String),
            subtitle: Text(
                '${order['customerName']} · ${order['physicalCount']} article(s) commandé(s)'),
            trailing: const Icon(Icons.add_circle_outline),
            onTap: _loading ? null : () => _choose(order),
          ),
        if (!_loading && orders.isEmpty)
          const Text('Aucune commande correspondante chargée.'),
        if (_hasMore)
          OutlinedButton(
              onPressed: _loading ? null : _load,
              child: const Text('Charger les commandes suivantes')),
      ]),
    );
  }
}
