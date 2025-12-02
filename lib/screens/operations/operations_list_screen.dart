import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/firebase_config.dart';
import '../../providers/operation_provider.dart';
import '../../widgets/operation_card.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/empty_state_widget.dart';
import 'operation_detail_screen.dart';

/// Liste des événements avec tabs Plongées / Sorties
class OperationsListScreen extends StatefulWidget {
  const OperationsListScreen({Key? key}) : super(key: key);

  @override
  State<OperationsListScreen> createState() => _OperationsListScreenState();
}

class _OperationsListScreenState extends State<OperationsListScreen>
    with SingleTickerProviderStateMixin {
  final String _clubId = FirebaseConfig.defaultClubId;
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    // Démarrer le stream
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<OperationProvider>().listenToOpenEvents(_clubId);
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _refreshOperations() async {
    await context.read<OperationProvider>().refresh(_clubId);
  }

  @override
  Widget build(BuildContext context) {
    final operationProvider = context.watch<OperationProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Événements',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: const Color(0xFF1976D2),
        iconTheme: const IconThemeData(color: Colors.white),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: const [
            Tab(
              icon: Text('🤿', style: TextStyle(fontSize: 20)),
              text: 'Plongées',
            ),
            Tab(
              icon: Text('🎉', style: TextStyle(fontSize: 20)),
              text: 'Sorties',
            ),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // Tab Plongées
          RefreshIndicator(
            onRefresh: _refreshOperations,
            child: _buildEventList(operationProvider, 'plongee'),
          ),
          // Tab Sorties
          RefreshIndicator(
            onRefresh: _refreshOperations,
            child: _buildEventList(operationProvider, 'sortie'),
          ),
        ],
      ),
    );
  }

  Widget _buildEventList(OperationProvider operationProvider, String categorie) {
    final allOperations = operationProvider.operations;

    // Filtrer par catégorie (plongee par défaut si pas de catégorie)
    final operations = allOperations.where((op) {
      final opCategorie = op.categorie ?? 'plongee';
      return opCategorie == categorie;
    }).toList();

    // Loading initial
    if (operationProvider.isLoading && allOperations.isEmpty) {
      return const LoadingWidget(message: 'Chargement des événements...');
    }

    // Empty state
    if (operations.isEmpty) {
      final isPlongee = categorie == 'plongee';
      return EmptyStateWidget(
        icon: isPlongee ? Icons.scuba_diving : Icons.celebration,
        title: isPlongee
            ? 'Aucune plongée disponible'
            : 'Aucune sortie disponible',
        subtitle: isPlongee
            ? 'Les prochaines plongées apparaîtront ici'
            : 'Les prochaines sorties apparaîtront ici',
        onAction: _refreshOperations,
        actionLabel: 'Actualiser',
      );
    }

    // Liste des événements
    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: operations.length,
      itemBuilder: (context, index) {
        final operation = operations[index];
        final participantCount =
            operationProvider.getParticipantCount(operation.id);

        return OperationCard(
          operation: operation,
          participantCount: participantCount,
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
        );
      },
    );
  }
}
