import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class MesCommandesScreen extends StatefulWidget {
  const MesCommandesScreen({super.key});

  @override
  State<MesCommandesScreen> createState() => _MesCommandesScreenState();
}

class _MesCommandesScreenState extends State<MesCommandesScreen> {
  late Future<List<Map<String, dynamic>>> _ordersFuture;

  @override
  void initState() {
    super.initState();
    _ordersFuture = _loadOrders();
  }

  Future<List<Map<String, dynamic>>> _loadOrders() async {
    final result = await FirebaseFunctions.instanceFor(region: 'europe-west1')
        .httpsCallable('listBoutiqueOrders')
        .call({'clubId': FirebaseConfig.defaultClubId});
    final data = Map<String, dynamic>.from(result.data as Map);
    final orders = data['orders'];
    if (orders is! List) return const [];
    return orders
        .map((entry) => Map<String, dynamic>.from(entry as Map))
        .toList();
  }

  String _paymentCommunication(Map<String, dynamic> order) {
    final payment = Map<String, dynamic>.from((order['payment'] as Map?) ?? {});
    return order['paymentCommunication']?.toString().trim().isNotEmpty == true
        ? order['paymentCommunication'].toString()
        : payment['paymentCommunication']?.toString().trim().isNotEmpty == true
            ? payment['paymentCommunication'].toString()
            : payment['structuredCommunication']
                        ?.toString()
                        .trim()
                        .isNotEmpty ==
                    true
                ? payment['structuredCommunication'].toString()
                : payment['ogm_display']?.toString() ?? '';
  }

  Future<void> _cancelOrder(Map<String, dynamic> order) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Supprimer la commande ?'),
        content: Text(
          'La commande ${order['orderNumber'] ?? ''} sera annulée. Le stock réservé sera libéré.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    await FirebaseFunctions.instanceFor(region: 'europe-west1')
        .httpsCallable('cancelBoutiqueOrder')
        .call({
      'clubId': FirebaseConfig.defaultClubId,
      'orderId': order['id'],
    });

    if (!mounted) return;
    setState(() => _ordersFuture = _loadOrders());
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Commande supprimée')),
    );
  }

  Future<void> _resendPaymentEmail(Map<String, dynamic> order) async {
    await FirebaseFunctions.instanceFor(region: 'europe-west1')
        .httpsCallable('sendBoutiqueOrderPaymentEmail')
        .call({
      'clubId': FirebaseConfig.defaultClubId,
      'orderId': order['id'],
    });

    if (!mounted) return;
    setState(() => _ordersFuture = _loadOrders());
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Email de paiement envoyé')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(
      locale: 'fr_BE',
      symbol: '€',
      decimalDigits: 2,
    );

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Mes commandes',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.bubbles,
        child: SafeArea(
          child: FutureBuilder<List<Map<String, dynamic>>>(
            future: _ordersFuture,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(
                  child: CircularProgressIndicator(color: Colors.white),
                );
              }
              if (snapshot.hasError) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      'Impossible de charger les commandes: ${snapshot.error}',
                      style: const TextStyle(color: Colors.white),
                      textAlign: TextAlign.center,
                    ),
                  ),
                );
              }

              final orders = snapshot.data ?? const [];
              if (orders.isEmpty) {
                return const Center(
                  child: Text(
                    'Aucune commande',
                    style: TextStyle(color: Colors.white),
                  ),
                );
              }

              return RefreshIndicator(
                onRefresh: () async {
                  setState(() => _ordersFuture = _loadOrders());
                  await _ordersFuture;
                },
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  itemBuilder: (context, index) {
                    final order = orders[index];
                    final pricing = Map<String, dynamic>.from(
                      (order['pricing'] as Map?) ?? {},
                    );
                    final payment = Map<String, dynamic>.from(
                      (order['payment'] as Map?) ?? {},
                    );
                    final status = order['status']?.toString() ?? '';
                    final items = (order['items'] as List?) ?? const [];
                    final total = _asDouble(pricing['total']);
                    final paymentCommunication = _paymentCommunication(order);
                    return Material(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(16),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => _OrderDetailScreen(
                              order: order,
                              paymentCommunication: paymentCommunication,
                              amount: total,
                              onCancel: status == 'awaiting_payment' &&
                                      payment['status'] == 'pending'
                                  ? () => _cancelOrder(order)
                                  : null,
                              onResendEmail: status == 'awaiting_payment' &&
                                      payment['status'] == 'pending'
                                  ? () => _resendPaymentEmail(order)
                                  : null,
                            ),
                          ),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      order['orderNumber']?.toString() ?? '',
                                      style: const TextStyle(
                                        color: AppColors.donkerblauw,
                                        fontWeight: FontWeight.w900,
                                        fontSize: 17,
                                      ),
                                    ),
                                  ),
                                  _StatusBadge(
                                    status: status,
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '${items.length} article(s) · ${formatter.format(total)}',
                                style: TextStyle(color: Colors.grey.shade700),
                              ),
                              if (paymentCommunication.isNotEmpty) ...[
                                const SizedBox(height: 6),
                                Text(
                                  paymentCommunication,
                                  style: const TextStyle(
                                    color: AppColors.middenblauw,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemCount: orders.length,
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  double _asDouble(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }
}

class _OrderDetailScreen extends StatelessWidget {
  final Map<String, dynamic> order;
  final String paymentCommunication;
  final double amount;
  final Future<void> Function()? onCancel;
  final Future<void> Function()? onResendEmail;

  const _OrderDetailScreen({
    required this.order,
    required this.paymentCommunication,
    required this.amount,
    required this.onCancel,
    required this.onResendEmail,
  });

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(
      locale: 'fr_BE',
      symbol: '€',
      decimalDigits: 2,
    );
    final payment = Map<String, dynamic>.from((order['payment'] as Map?) ?? {});
    final items = ((order['items'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final isAwaitingPayment = order['status'] == 'awaiting_payment';
    final isPaid = order['status'] == 'paid' || payment['status'] == 'paid';
    final emailSent = payment['email_status'] == 'sent' ||
        payment['emailStatus'] == 'sent' ||
        payment['email_sent_at'] != null;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: Text(
          order['orderNumber']?.toString() ?? 'Commande',
          style: const TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.bubbles,
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            children: [
              _DetailPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      order['orderNumber']?.toString() ?? '',
                      style: const TextStyle(
                        color: AppColors.donkerblauw,
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      formatter.format(amount),
                      style: const TextStyle(
                        color: AppColors.oranje,
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    if (paymentCommunication.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(
                        paymentCommunication,
                        style: const TextStyle(
                          color: AppColors.middenblauw,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _DetailPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Articles',
                      style: TextStyle(
                        color: AppColors.donkerblauw,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 12),
                    for (final item in items) ...[
                      _OrderItemRow(item: item, formatter: formatter),
                      if (item != items.last) const Divider(height: 22),
                    ],
                  ],
                ),
              ),
              if (isPaid || isAwaitingPayment) ...[
                const SizedBox(height: 12),
                _DetailPanel(
                  child: _PaymentStatusPanel(
                    isPaid: isPaid,
                    emailSent: emailSent,
                  ),
                ),
              ],
              if (onResendEmail != null) ...[
                const SizedBox(height: 12),
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.middenblauw,
                    foregroundColor: Colors.white,
                  ),
                  onPressed: () async {
                    try {
                      await onResendEmail!();
                    } catch (error) {
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('Impossible d’envoyer l’email: $error'),
                        ),
                      );
                    }
                  },
                  icon: Icon(
                    emailSent
                        ? Icons.mark_email_read_outlined
                        : Icons.email_outlined,
                  ),
                  label: Text(
                    emailSent
                        ? 'Renvoyer l’email de paiement'
                        : 'Envoyer l’email de paiement',
                  ),
                ),
              ],
              if (onCancel != null) ...[
                const SizedBox(height: 16),
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.red.shade700,
                    foregroundColor: Colors.white,
                  ),
                  onPressed: () async {
                    await onCancel!();
                    if (context.mounted) Navigator.of(context).pop();
                  },
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('Supprimer la commande'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailPanel extends StatelessWidget {
  final Widget child;

  const _DetailPanel({required this.child});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: child,
      ),
    );
  }
}

class _PaymentStatusPanel extends StatelessWidget {
  final bool isPaid;
  final bool emailSent;

  const _PaymentStatusPanel({
    required this.isPaid,
    required this.emailSent,
  });

  @override
  Widget build(BuildContext context) {
    final title = isPaid
        ? 'Commande payée'
        : emailSent
            ? 'Email de paiement envoyé'
            : 'Email de paiement à envoyer';
    final text = isPaid
        ? 'Le paiement est enregistré.'
        : 'Le QR code de paiement est envoyé par email. Ouvrez ce mail sur ordinateur et scannez le QR avec votre application bancaire.';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          isPaid ? Icons.check_circle_outline : Icons.mark_email_read_outlined,
          color: isPaid ? Colors.green.shade700 : AppColors.middenblauw,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  color: isPaid ? Colors.green.shade800 : AppColors.donkerblauw,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                text,
                style: TextStyle(
                  color: Colors.grey.shade700,
                  fontWeight: FontWeight.w700,
                  height: 1.25,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _OrderItemRow extends StatelessWidget {
  final Map<String, dynamic> item;
  final NumberFormat formatter;

  const _OrderItemRow({
    required this.item,
    required this.formatter,
  });

  @override
  Widget build(BuildContext context) {
    final snapshot = Map<String, dynamic>.from(
      (item['productSnapshot'] as Map?) ?? {},
    );
    final name =
        snapshot['name']?.toString() ?? item['productId']?.toString() ?? '';
    final variant = snapshot['variantLabel']?.toString() ??
        item['variantId']?.toString() ??
        '';
    final customizations = Map<String, dynamic>.from(
      (item['customizations'] as Map?) ?? {},
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          name,
          style: const TextStyle(
            color: AppColors.donkerblauw,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          '$variant · ${item['deliveryMode'] ?? ''}',
          style: TextStyle(color: Colors.grey.shade700),
        ),
        if (customizations.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            customizations.entries
                .where((entry) => entry.key != 'surcharge')
                .map((entry) => '${entry.key}: ${entry.value}')
                .join(' · '),
            style: TextStyle(color: Colors.grey.shade700),
          ),
        ],
        const SizedBox(height: 8),
        Row(
          children: [
            Text('x${item['qty'] ?? 0}'),
            const Spacer(),
            Text(
              formatter.format(_asStaticDouble(item['lineTotal'])),
              style: const TextStyle(
                color: AppColors.oranje,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

double _asStaticDouble(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

class _StatusBadge extends StatelessWidget {
  final String status;

  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final label = switch (status) {
      'awaiting_payment' => 'À payer',
      'paid' => 'Payée',
      'preparing' => 'Préparation',
      'ready' => 'Prête',
      'delivered' => 'Livrée',
      _ => status,
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.middenblauw.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: AppColors.middenblauw,
          fontSize: 12,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}
