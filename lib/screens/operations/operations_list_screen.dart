import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../providers/operation_provider.dart';
import '../../widgets/operation_card.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/empty_state_widget.dart';
import 'operation_detail_screen.dart';

/// Liste des événements (sans bottom navigation)
class OperationsListScreen extends StatefulWidget {
  const OperationsListScreen({Key? key}) : super(key: key);

  @override
  State<OperationsListScreen> createState() => _OperationsListScreenState();
}

class _OperationsListScreenState extends State<OperationsListScreen> {
  final String _clubId = FirebaseConfig.defaultClubId;

  @override
  void initState() {
    super.initState();
    // Démarrer le stream
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<OperationProvider>().listenToOpenEvents(_clubId);
    });
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
        backgroundColor: const Color(0xFF1976D2), // Blue
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: RefreshIndicator(
        onRefresh: _refreshOperations,
        child: _buildBody(operationProvider),
      ),
    );
  }

  Widget _buildBody(OperationProvider operationProvider) {
    final operations = operationProvider.operations;

    // Loading initial
    if (operationProvider.isLoading && operations.isEmpty) {
      return const LoadingWidget(message: 'Chargement des événements...');
    }

    // Empty state
    if (operations.isEmpty) {
      return EmptyStateWidget(
        icon: Icons.event_busy,
        title: 'Aucun événement disponible',
        subtitle: 'Les nouveaux événements apparaîtront ici',
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
        final participantCount = operationProvider.getParticipantCount(operation.id);

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
