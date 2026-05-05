import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'boutique_feature_guard.dart';

class MesCommandesScreen extends StatefulWidget {
  final String? initialOrderId;

  const MesCommandesScreen({super.key, this.initialOrderId});

  @override
  State<MesCommandesScreen> createState() => _MesCommandesScreenState();
}

class _MesCommandesScreenState extends State<MesCommandesScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  Map<String, dynamic>? _selectedOrder;

  void _openOrder(Map<String, dynamic> order) {
    setState(() => _selectedOrder = order);
    _scaffoldKey.currentState?.openEndDrawer();
  }

  @override
  Widget build(BuildContext context) {
    final userId = context.watch<AuthProvider>().currentUser?.uid ?? '';

    return BoutiqueFeatureGuard(
      child: Scaffold(
        key: _scaffoldKey,
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          title: const Text('Mes commandes'),
          backgroundColor: Colors.transparent,
          elevation: 0,
        ),
        endDrawer: Drawer(
          child: _selectedOrder == null
              ? const SizedBox.shrink()
              : _OrderDrawer(order: _selectedOrder!),
        ),
        body: OceanGradientBackground(
          creatures: CreatureSet.fishAndBubbles,
          child: SafeArea(
            child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: FirebaseFirestore.instance
                  .collection('clubs')
                  .doc(FirebaseConfig.defaultClubId)
                  .collection('orders')
                  .where('buyer.userId', isEqualTo: userId)
                  .snapshots(),
              builder: (context, snapshot) {
                if (userId.isEmpty) {
                  return const Center(
                    child: CircularProgressIndicator(color: Colors.white),
                  );
                }
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(
                    child: CircularProgressIndicator(color: Colors.white),
                  );
                }
                if (snapshot.hasError) {
                  return Center(
                    child: Text(
                      'Erreur commandes: ${snapshot.error}',
                      style: const TextStyle(color: Colors.white),
                    ),
                  );
                }

                final docs = snapshot.data?.docs ?? [];
                final orders = docs
                    .map(
                      (doc) => <String, dynamic>{'id': doc.id, ...doc.data()},
                    )
                    .where((order) => order['status'] != 'cart')
                    .toList();

                if (orders.isEmpty) {
                  return const Center(
                    child: Text(
                      'Aucune commande pour le moment.',
                      style: TextStyle(color: Colors.white),
                    ),
                  );
                }

                final grouped = <String, List<Map<String, dynamic>>>{};
                for (final order in orders) {
                  final status = (order['status'] as String?) ?? 'unknown';
                  grouped.putIfAbsent(status, () => []).add(order);
                }

                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (!mounted || widget.initialOrderId == null) return;
                  if (_selectedOrder != null) return;
                  for (final order in orders) {
                    if (order['id'] == widget.initialOrderId) {
                      _openOrder(order);
                      break;
                    }
                  }
                });

                final sortedStatuses = grouped.keys.toList()..sort();

                return ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: sortedStatuses.length,
                  itemBuilder: (context, index) {
                    final status = sortedStatuses[index];
                    final statusOrders = grouped[status]!;
                    return Card(
                      margin: const EdgeInsets.only(bottom: 14),
                      child: ExpansionTile(
                        initiallyExpanded: true,
                        title: Text(_statusLabel(status)),
                        subtitle: Text('${statusOrders.length} commande(s)'),
                        children: statusOrders.map((order) {
                          final pricing =
                              order['pricing'] as Map<String, dynamic>?;
                          final total =
                              (pricing?['total'] as num?)?.toDouble() ?? 0;
                          return ListTile(
                            title: Text(
                              order['orderNumber']?.toString() ??
                                  order['id'].toString(),
                            ),
                            subtitle: Text('${total.toStringAsFixed(2)} €'),
                            trailing: const Icon(Icons.menu_open),
                            onTap: () => _openOrder(order),
                          );
                        }).toList(),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ),
      ),
    );
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'awaiting_payment':
        return 'En attente de paiement';
      case 'paid':
        return 'Payées';
      case 'preparing':
        return 'Préparation';
      case 'ready':
        return 'Prêtes';
      case 'delivered':
        return 'Livrées';
      case 'cancelled':
        return 'Annulées';
      case 'refunded':
        return 'Remboursées';
      default:
        return status;
    }
  }
}

class _OrderDrawer extends StatelessWidget {
  final Map<String, dynamic> order;

  const _OrderDrawer({required this.order});

  @override
  Widget build(BuildContext context) {
    final items = (order['items'] as List<dynamic>? ?? const [])
        .map((item) => Map<String, dynamic>.from(item as Map))
        .toList();

    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ListTile(
            title: Text(
              order['orderNumber']?.toString() ?? order['id'].toString(),
            ),
            subtitle: Text(
              _statusText(order['status']?.toString() ?? 'unknown'),
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Articles',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 10),
                ...items.map(
                  (item) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text('${item['qty'] ?? 0}x ${_itemName(item)}'),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Timeline',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 10),
                ..._buildTimeline(order),
              ],
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildTimeline(Map<String, dynamic> order) {
    final status = order['status']?.toString() ?? 'unknown';
    final steps = <String>[
      'Commande créée',
      if (status != 'awaiting_payment') 'Paiement reçu',
      if (status == 'preparing' || status == 'ready' || status == 'delivered')
        'Préparation',
      if (status == 'ready' || status == 'delivered') 'Commande prête',
      if (status == 'delivered') 'Commande livrée',
    ];

    if (steps.isEmpty) {
      steps.add('TODO: timeline backend');
    }

    return steps
        .map(
          (step) => ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.check_circle_outline),
            title: Text(step),
          ),
        )
        .toList();
  }

  String _statusText(String status) {
    switch (status) {
      case 'awaiting_payment':
        return 'En attente de paiement';
      case 'paid':
        return 'Payée';
      case 'preparing':
        return 'En préparation';
      case 'ready':
        return 'Prête';
      case 'delivered':
        return 'Livrée';
      default:
        return status;
    }
  }

  String _itemName(Map<String, dynamic> item) {
    final snapshot = item['productSnapshot'];
    if (snapshot is Map) {
      return snapshot['name']?.toString() ??
          item['productId']?.toString() ??
          'Article';
    }
    return item['productId']?.toString() ?? 'Article';
  }
}
