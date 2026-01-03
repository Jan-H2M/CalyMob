import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../config/app_assets.dart';
import '../../providers/auth_provider.dart';
import '../../providers/operation_provider.dart';
import '../../models/user_event_registration.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/empty_state_widget.dart';
import 'operation_detail_screen.dart';

/// Écran "Mes événements" - Liste des inscriptions de l'utilisateur
class MyEventsScreen extends StatefulWidget {
  const MyEventsScreen({Key? key}) : super(key: key);

  @override
  State<MyEventsScreen> createState() => _MyEventsScreenState();
}

class _MyEventsScreenState extends State<MyEventsScreen> with SingleTickerProviderStateMixin {
  final String _clubId = 'calypso';
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);

    // Démarrer le stream des inscriptions
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final authProvider = context.read<AuthProvider>();
      final userId = authProvider.currentUser?.uid;

      if (userId != null) {
        context.read<OperationProvider>().listenToUserRegistrations(_clubId, userId);
      }
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _refreshRegistrations() async {
    final authProvider = context.read<AuthProvider>();
    final userId = authProvider.currentUser?.uid;

    if (userId != null) {
      await context.read<OperationProvider>().loadUserRegistrations(_clubId, userId);
    }
  }

  @override
  Widget build(BuildContext context) {
    final operationProvider = context.watch<OperationProvider>();

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Mes événements',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: const [
            Tab(text: 'À venir'),
            Tab(text: 'Passés'),
          ],
        ),
      ),
      body: Stack(
        children: [
          // Ocean background
          Positioned.fill(
            child: Image.asset(
              AppAssets.backgroundFull,
              fit: BoxFit.cover,
            ),
          ),
          // Content
          SafeArea(
            child: RefreshIndicator(
              onRefresh: _refreshRegistrations,
              child: TabBarView(
                controller: _tabController,
                children: [
                  _buildEventsList(operationProvider.upcomingEvents, isUpcoming: true),
                  _buildEventsList(operationProvider.pastEvents, isUpcoming: false),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEventsList(List<UserEventRegistration> registrations, {required bool isUpcoming}) {
    final operationProvider = context.watch<OperationProvider>();

    // Loading initial
    if (operationProvider.isLoading && registrations.isEmpty) {
      return const LoadingWidget(message: 'Chargement de vos inscriptions...');
    }

    // Empty state
    if (registrations.isEmpty) {
      return EmptyStateWidget(
        icon: isUpcoming ? Icons.event_available : Icons.history,
        title: isUpcoming ? 'Aucune inscription à venir' : 'Aucun événement passé',
        subtitle: isUpcoming
          ? 'Inscrivez-vous à un événement pour le voir ici'
          : 'Vos événements passés apparaîtront ici',
        onAction: _refreshRegistrations,
        actionLabel: 'Actualiser',
      );
    }

    // Liste des inscriptions
    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: registrations.length,
      itemBuilder: (context, index) {
        final registration = registrations[index];
        return _buildEventCard(registration);
      },
    );
  }

  Widget _buildEventCard(UserEventRegistration registration) {
    final operation = registration.operation;
    final participant = registration.participant;
    final dateFormat = DateFormat('dd/MM/yyyy à HH:mm', 'fr_FR');

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => OperationDetailScreen(
                operationId: operation.id,
                clubId: _clubId,
              ),
            ),
          );
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Titre et badge statut
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      operation.titre,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  _buildStatusBadge(registration),
                ],
              ),

              const SizedBox(height: 12),

              // Date
              if (operation.dateDebut != null)
                Row(
                  children: [
                    const Icon(Icons.calendar_today, size: 16, color: Colors.grey),
                    const SizedBox(width: 8),
                    Text(
                      dateFormat.format(operation.dateDebut!),
                      style: const TextStyle(fontSize: 14, color: Colors.grey),
                    ),
                  ],
                ),

              const SizedBox(height: 8),

              // Lieu
              if (operation.lieu != null)
                Row(
                  children: [
                    const Icon(Icons.location_on, size: 16, color: Colors.grey),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        operation.lieu!,
                        style: const TextStyle(fontSize: 14, color: Colors.grey),
                      ),
                    ),
                  ],
                ),

              const SizedBox(height: 12),
              const Divider(),
              const SizedBox(height: 8),

              // Prix et statut paiement
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.euro, size: 16, color: Colors.grey),
                      const SizedBox(width: 4),
                      Text(
                        '${participant.totalPrix.toStringAsFixed(2)} €',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Colors.black87,
                        ),
                      ),
                    ],
                  ),

                  // Bouton payer si non payé et événement à venir
                  if (!participant.paye && !registration.isPast)
                    ElevatedButton.icon(
                      onPressed: () {
                        // TODO: Implémenter paiement (Phase 3)
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Paiement à implémenter (Phase 3)'),
                          ),
                        );
                      },
                      icon: const Icon(Icons.payment, size: 16),
                      label: const Text('Payer'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1976D2),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      ),
                    ),
                ],
              ),

              // Supplement details (si présents)
              if (participant.selectedSupplements.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: participant.selectedSupplements
                        .where((s) => s.name.isNotEmpty)
                        .map((s) => Text(
                              '+ ${s.name}: ${s.price.toStringAsFixed(2)} €',
                              style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                            ))
                        .toList(),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatusBadge(UserEventRegistration registration) {
    // Determine color based on payment status
    Color color;
    IconData icon;

    if (!registration.isPaid) {
      color = Colors.orange;
      icon = Icons.pending;
    } else if (registration.isPaidAwaitingBank) {
      color = Colors.amber.shade700;
      icon = Icons.schedule;
    } else {
      color = Colors.green;
      icon = Icons.check_circle;
    }

    final label = registration.statusLabel;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        border: Border.all(color: color, width: 1.5),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
