import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../utils/epc_qr_code.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'boutique_feature_guard.dart';
import 'boutique_order_confirmation_screen.dart';

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
                if (userId.isEmpty || snapshot.connectionState == ConnectionState.waiting) {
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

                final orders = snapshot.data?.docs
                        .map((doc) => <String, dynamic>{'id': doc.id, ...doc.data()})
                        .where((order) => order['status'] != 'cart')
                        .toList() ??
                    const <Map<String, dynamic>>[];

                if (orders.isEmpty) {
                  return const Center(
                    child: Text(
                      'Aucune commande pour le moment.',
                      style: TextStyle(color: Colors.white),
                    ),
                  );
                }

                orders.sort((a, b) {
                  final aDate = _timestampToDate(a['createdAt']);
                  final bDate = _timestampToDate(b['createdAt']);
                  if (aDate == null && bDate == null) return 0;
                  if (aDate == null) return 1;
                  if (bDate == null) return -1;
                  return bDate.compareTo(aDate);
                });

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

                return ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: orders.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (context, index) {
                    final order = orders[index];
                    final pricing = _asMap(order['pricing']);
                    final total = _asDouble(pricing['total']);
                    final status = order['status']?.toString() ?? 'unknown';

                    return Card(
                      child: ListTile(
                        contentPadding: const EdgeInsets.all(16),
                        title: Text(
                          order['orderNumber']?.toString() ?? order['id'].toString(),
                        ),
                        subtitle: Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _StatusBadge(status: status),
                              const SizedBox(height: 8),
                              Text('${total.toStringAsFixed(2)} €'),
                            ],
                          ),
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => _openOrder(order),
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
}

class _OrderDrawer extends StatelessWidget {
  final Map<String, dynamic> order;

  const _OrderDrawer({required this.order});

  @override
  Widget build(BuildContext context) {
    final items = (order['items'] as List<dynamic>? ?? const [])
        .map((item) => Map<String, dynamic>.from(item as Map))
        .toList();
    final payment = _asMap(order['payment']);
    final pricing = _asMap(order['pricing']);
    final status = order['status']?.toString() ?? 'unknown';
    final ogmDisplay = payment['ogm_display']?.toString() ??
        order['structuredCommunication']?.toString() ??
        '';

    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  order['orderNumber']?.toString() ?? order['id'].toString(),
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                _StatusBadge(status: status),
              ],
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
                    child: Text(
                      '${item['qty'] ?? 0}x ${_itemName(item)}',
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Paiement',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 10),
                Text('Communication: $ogmDisplay'),
                Text('Total: ${_asDouble(pricing['total']).toStringAsFixed(2)} €'),
                if (_timestampToDate(payment['paidAt'] ?? payment['paid_at']) != null)
                  Text(
                    'Payé le ${_formatDateTime(_timestampToDate(payment['paidAt'] ?? payment['paid_at'])!)}',
                  ),
                if (status == 'awaiting_payment') ...[
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => BoutiqueOrderConfirmationScreen(
                            orderData: _confirmationDataFromOrder(order),
                          ),
                        ),
                      );
                    },
                    child: const Text('Voir QR'),
                  ),
                ],
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
    final events = _timelineEvents(order);
    return events.map((event) {
      return ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(event.icon, color: event.date != null ? Colors.green : Colors.grey),
        title: Text(event.label),
        subtitle: event.date == null ? null : Text(_formatDateTime(event.date!)),
      );
    }).toList();
  }
}

class _TimelineEvent {
  final String label;
  final IconData icon;
  final DateTime? date;

  const _TimelineEvent({
    required this.label,
    required this.icon,
    required this.date,
  });
}

class _StatusBadge extends StatelessWidget {
  final String status;

  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: _statusColor(status).withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        _statusText(status),
        style: TextStyle(
          color: _statusColor(status),
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

String _itemName(Map<String, dynamic> item) {
  final snapshot = item['productSnapshot'];
  if (snapshot is Map) {
    return snapshot['name']?.toString() ?? item['productId']?.toString() ?? 'Article';
  }
  return item['productId']?.toString() ?? 'Article';
}

List<_TimelineEvent> _timelineEvents(Map<String, dynamic> order) {
  final payment = _asMap(order['payment']);
  final items = (order['items'] as List<dynamic>? ?? const [])
      .map((item) => Map<String, dynamic>.from(item as Map))
      .toList();
  final status = order['status']?.toString() ?? 'unknown';

  DateTime? firstItemDate(String key) {
    for (final item in items) {
      final date = _timestampToDate(item[key]);
      if (date != null) return date;
    }
    return null;
  }

  return [
    _TimelineEvent(
      label: 'Commande créée',
      icon: Icons.receipt_long,
      date: _timestampToDate(order['createdAt']),
    ),
    _TimelineEvent(
      label: 'En attente de paiement',
      icon: Icons.hourglass_top,
      date: _timestampToDate(order['createdAt']),
    ),
    _TimelineEvent(
      label: 'Paiement reçu',
      icon: Icons.payments,
      date: _timestampToDate(payment['paidAt'] ?? payment['paid_at']),
    ),
    _TimelineEvent(
      label: 'Préparation',
      icon: Icons.inventory_2,
      date: _eventDateForStatus(
        status: status,
        currentStatus: 'preparing',
        explicit: _timestampToDate(order['preparingAt']) ?? firstItemDate('preparingAt'),
        fallback: _timestampToDate(order['updatedAt']),
      ),
    ),
    _TimelineEvent(
      label: 'Commande prête',
      icon: Icons.store_mall_directory,
      date: _eventDateForStatus(
        status: status,
        currentStatus: 'ready',
        explicit: _timestampToDate(order['readyAt']) ?? firstItemDate('readyAt'),
        fallback: _timestampToDate(order['updatedAt']),
      ),
    ),
    _TimelineEvent(
      label: 'Livrée',
      icon: Icons.local_shipping,
      date: _eventDateForStatus(
        status: status,
        currentStatus: 'delivered',
        explicit: _timestampToDate(order['deliveredAt']) ?? firstItemDate('deliveredAt'),
        fallback: _timestampToDate(order['updatedAt']),
      ),
    ),
  ];
}

DateTime? _eventDateForStatus({
  required String status,
  required String currentStatus,
  required DateTime? explicit,
  required DateTime? fallback,
}) {
  if (explicit != null) return explicit;
  const statusOrder = [
    'awaiting_payment',
    'paid',
    'preparing',
    'ready',
    'delivered',
  ];
  if (statusOrder.indexOf(status) >= statusOrder.indexOf(currentStatus)) {
    return fallback;
  }
  return null;
}

Map<String, dynamic> _confirmationDataFromOrder(Map<String, dynamic> order) {
  final payment = _asMap(order['payment']);
  final pricing = _asMap(order['pricing']);
  final structuredCommunication =
      payment['ogm_display']?.toString() ?? order['structuredCommunication']?.toString() ?? '';

  final enrichedPayment = {
    ...payment,
    'ogm_display': structuredCommunication,
    'amount': payment['amount'] ?? pricing['total'] ?? 0,
  };

  if ((enrichedPayment['epcPayload']?.toString() ?? '').isEmpty &&
      (payment['iban']?.toString() ?? '').isNotEmpty) {
    enrichedPayment['epcPayload'] = buildEpcQrPayload(
      iban: payment['iban'].toString(),
      beneficiary: payment['beneficiary']?.toString() ?? 'Calypso',
      amount: _asDouble(enrichedPayment['amount']),
      structuredCommunication: structuredCommunication,
      bic: payment['bic']?.toString(),
    );
  }

  return {
    ...order,
    'payment': enrichedPayment,
  };
}

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return const <String, dynamic>{};
}

double _asDouble(Object? value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

DateTime? _timestampToDate(Object? value) {
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  if (value is String) return DateTime.tryParse(value);
  return null;
}

String _formatDateTime(DateTime date) {
  final day = date.day.toString().padLeft(2, '0');
  final month = date.month.toString().padLeft(2, '0');
  final hour = date.hour.toString().padLeft(2, '0');
  final minute = date.minute.toString().padLeft(2, '0');
  return '$day/$month/${date.year} à $hour:$minute';
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
    case 'cancelled':
      return 'Annulée';
    case 'refunded':
      return 'Remboursée';
    default:
      return status;
  }
}

Color _statusColor(String status) {
  switch (status) {
    case 'awaiting_payment':
      return Colors.orange.shade800;
    case 'paid':
      return Colors.green.shade700;
    case 'preparing':
      return Colors.blue.shade700;
    case 'ready':
      return Colors.teal.shade700;
    case 'delivered':
      return Colors.indigo.shade700;
    case 'cancelled':
    case 'refunded':
      return Colors.red.shade700;
    default:
      return Colors.grey.shade700;
  }
}
