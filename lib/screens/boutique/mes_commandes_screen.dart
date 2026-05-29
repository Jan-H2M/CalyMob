import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'boutique_order_confirmation_screen.dart';

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
                    final canShowPaymentQr = status == 'awaiting_payment' &&
                        payment['epcPayload'] != null;
                    final items = (order['items'] as List?) ?? const [];
                    final total = _asDouble(pricing['total']);
                    return Material(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(16),
                        onTap: canShowPaymentQr
                            ? () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        BoutiqueOrderConfirmationScreen(
                                      orderNumber:
                                          order['orderNumber']?.toString() ??
                                              '',
                                      ogmDisplay:
                                          payment['ogm_display']?.toString() ??
                                              '',
                                      iban: payment['iban']?.toString() ?? '',
                                      beneficiary:
                                          payment['beneficiary']?.toString() ??
                                              '',
                                      amount: total,
                                      epcPayload:
                                          payment['epcPayload']?.toString(),
                                    ),
                                  ),
                                )
                            : null,
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
                              if ((payment['ogm_display'] ?? '')
                                  .toString()
                                  .isNotEmpty) ...[
                                const SizedBox(height: 6),
                                Text(
                                  payment['ogm_display'].toString(),
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
