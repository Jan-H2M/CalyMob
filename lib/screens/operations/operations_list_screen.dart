import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lottie/lottie.dart';
import 'package:intl/intl.dart';
import '../../config/firebase_config.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../models/operation.dart';
import '../../providers/operation_provider.dart';
import '../../widgets/loading_widget.dart';
import 'operation_detail_screen.dart';

/// Liste des événements avec filtre (Tout / Plongées / Sorties)
class OperationsListScreen extends StatefulWidget {
  const OperationsListScreen({Key? key}) : super(key: key);

  @override
  State<OperationsListScreen> createState() => _OperationsListScreenState();
}

class _OperationsListScreenState extends State<OperationsListScreen> {
  final String _clubId = FirebaseConfig.defaultClubId;
  String _selectedFilter = 'all'; // 'all', 'plongee', 'sortie'

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

  /// Group operations by month
  Map<String, List<Operation>> _groupByMonth(List<Operation> operations) {
    final Map<String, List<Operation>> grouped = {};

    for (final op in operations) {
      final date = op.dateDebut ?? DateTime.now();
      final monthKey = DateFormat('MMMM yyyy', 'fr_FR').format(date);

      if (!grouped.containsKey(monthKey)) {
        grouped[monthKey] = [];
      }
      grouped[monthKey]!.add(op);
    }

    // Sort operations within each month by date
    for (final key in grouped.keys) {
      grouped[key]!.sort((a, b) {
        final dateA = a.dateDebut ?? DateTime.now();
        final dateB = b.dateDebut ?? DateTime.now();
        return dateA.compareTo(dateB);
      });
    }

    return grouped;
  }

  void _onEventTapped(Operation operation) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => OperationDetailScreen(
          operationId: operation.id,
          clubId: _clubId,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final operationProvider = context.watch<OperationProvider>();

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Événements',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(60),
          child: Container(
            height: 50,
            margin: const EdgeInsets.only(bottom: 10),
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _buildFilterChip('all', 'Tout'),
                const SizedBox(width: 12),
                _buildFilterChip('plongee', 'Plongées'),
                const SizedBox(width: 12),
                _buildFilterChip('sortie', 'Sorties'),
              ],
            ),
          ),
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
              onRefresh: _refreshOperations,
              child: _buildEventsList(operationProvider),
            ),
          ),
          // Seaweed 1 - far left, smaller and transparent
          Positioned(
            bottom: -30,
            left: -40,
            child: IgnorePointer(
              child: Opacity(
                opacity: 0.3,
                child: Lottie.asset(
                  'assets/animations/seaweed.json',
                  width: 150,
                  height: 300,
                  fit: BoxFit.contain,
                ),
              ),
            ),
          ),
          // Seaweed 2 - right side
          Positioned(
            bottom: -20,
            right: -30,
            child: IgnorePointer(
              child: Opacity(
                opacity: 0.3,
                child: Lottie.asset(
                  'assets/animations/seaweed.json',
                  width: 120,
                  height: 250,
                  fit: BoxFit.contain,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String value, String label) {
    final isSelected = _selectedFilter == value;
    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedFilter = value;
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : Colors.white.withOpacity(0.2),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: Colors.white.withOpacity(0.3),
            width: 1,
          ),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? AppColors.donkerblauw : Colors.white,
            fontWeight: FontWeight.w600,
            fontSize: 14,
          ),
        ),
      ),
    );
  }

  Widget _buildEventsList(OperationProvider operationProvider) {
    final allOperations = operationProvider.operations;

    // Loading initial
    if (operationProvider.isLoading && allOperations.isEmpty) {
      return const LoadingWidget(message: 'Chargement des événements...');
    }

    // Filter
    final filtered = allOperations.where((op) {
      if (_selectedFilter == 'all') return true;
      final opCategorie = op.categorie ?? 'plongee';
      return opCategorie == _selectedFilter;
    }).toList();

    // Sort by date
    filtered.sort((a, b) {
      final dateA = a.dateDebut ?? DateTime.now();
      final dateB = b.dateDebut ?? DateTime.now();
      return dateA.compareTo(dateB);
    });

    // Group by month
    final grouped = _groupByMonth(filtered);

    if (filtered.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              _selectedFilter == 'plongee'
                  ? Icons.scuba_diving
                  : _selectedFilter == 'sortie'
                      ? Icons.directions_boat
                      : Icons.event_busy,
              size: 64,
              color: Colors.white.withOpacity(0.7),
            ),
            const SizedBox(height: 16),
            Text(
              'Aucun événement trouvé',
              style: TextStyle(
                fontSize: 18,
                color: Colors.white.withOpacity(0.9),
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
      itemCount: grouped.length,
      itemBuilder: (context, index) {
        final monthKey = grouped.keys.elementAt(index);
        final monthEvents = grouped[monthKey]!;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Month header
            _buildMonthHeader(monthKey),
            // Events for this month
            ...monthEvents.map((op) => _buildEventCard(op)),
          ],
        );
      },
    );
  }

  Widget _buildMonthHeader(String monthName) {
    // Capitalize first letter
    final capitalizedMonth = monthName[0].toUpperCase() + monthName.substring(1);

    return Container(
      margin: const EdgeInsets.only(top: 16, bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.donkerblauw,
            AppColors.middenblauw,
          ],
        ),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: AppColors.donkerblauw.withOpacity(0.3),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          Icon(
            Icons.calendar_month,
            color: Colors.white.withOpacity(0.9),
            size: 20,
          ),
          const SizedBox(width: 10),
          Text(
            capitalizedMonth,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.white,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEventCard(Operation operation) {
    final date = operation.dateDebut ?? DateTime.now();
    final dayName = DateFormat('EEEE', 'fr_FR').format(date);
    final dayNumber = DateFormat('d', 'fr_FR').format(date);
    final time = DateFormat('HH:mm', 'fr_FR').format(date);
    final isPlongee = (operation.categorie ?? 'plongee') == 'plongee';

    return GestureDetector(
      onTap: () => _onEventTapped(operation),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: AppColors.donkerblauw.withOpacity(0.15),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Row(
            children: [
              // Date badge on the left
              Container(
                width: 70,
                padding: const EdgeInsets.symmetric(vertical: 16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      AppColors.middenblauw,
                      AppColors.donkerblauw,
                    ],
                  ),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      dayNumber,
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                        height: 1,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      dayName.substring(0, 3).toUpperCase(),
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Colors.white.withOpacity(0.9),
                        letterSpacing: 1,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        time,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              // Event details
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Title row with icon
                      Row(
                        children: [
                          Icon(
                            isPlongee ? Icons.scuba_diving : Icons.directions_boat,
                            size: 18,
                            color: AppColors.middenblauw,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              operation.titre,
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: AppColors.donkerblauw,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      // Location
                      if (operation.lieu != null && operation.lieu!.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Icon(
                              Icons.location_on,
                              size: 14,
                              color: Colors.grey[600],
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                operation.lieu!,
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Colors.grey[700],
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ],
                      // Capacity and price info
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          if (operation.capaciteMax != null && operation.capaciteMax! > 0) ...[
                            Icon(
                              Icons.group,
                              size: 14,
                              color: AppColors.middenblauw.withOpacity(0.7),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              'Max ${operation.capaciteMax}',
                              style: TextStyle(
                                fontSize: 13,
                                color: Colors.grey[600],
                              ),
                            ),
                          ],
                          const Spacer(),
                          // Price badge if applicable
                          if (operation.prixMembre != null && operation.prixMembre! > 0)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: AppColors.lichtblauw.withOpacity(0.3),
                                borderRadius: BorderRadius.circular(8),
                                ),
                              child: Text(
                                '${operation.prixMembre!.toStringAsFixed(2)} €',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.donkerblauw,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              // Arrow indicator
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Icon(
                  Icons.chevron_right,
                  color: AppColors.middenblauw.withOpacity(0.5),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
