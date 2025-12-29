import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lottie/lottie.dart';
import 'package:intl/intl.dart';
import '../../config/firebase_config.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../models/activity_item.dart';
import '../../providers/activity_provider.dart';
import '../../widgets/loading_widget.dart';
import 'operation_detail_screen.dart';
import '../piscine/session_detail_screen.dart';

/// Liste des événements avec filtre (Tout / Plongées / Piscine / Sorties)
/// Combineert operations en piscine sessions in één overzicht
class OperationsListScreen extends StatefulWidget {
  const OperationsListScreen({Key? key}) : super(key: key);

  @override
  State<OperationsListScreen> createState() => _OperationsListScreenState();
}

class _OperationsListScreenState extends State<OperationsListScreen> {
  final String _clubId = FirebaseConfig.defaultClubId;
  String _selectedFilter = 'all'; // 'all', 'plongee', 'piscine', 'sortie'

  @override
  void initState() {
    super.initState();
    // Start de gecombineerde stream
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ActivityProvider>().listenToActivities(_clubId);
    });
  }

  Future<void> _refreshActivities() async {
    await context.read<ActivityProvider>().refresh(_clubId);
  }

  /// Group activities by month
  Map<String, List<ActivityItem>> _groupByMonth(List<ActivityItem> activities) {
    final Map<String, List<ActivityItem>> grouped = {};

    for (final item in activities) {
      final monthKey = DateFormat('MMMM yyyy', 'fr_FR').format(item.date);

      if (!grouped.containsKey(monthKey)) {
        grouped[monthKey] = [];
      }
      grouped[monthKey]!.add(item);
    }

    // Sort activities within each month by date
    for (final key in grouped.keys) {
      grouped[key]!.sort((a, b) => a.date.compareTo(b.date));
    }

    return grouped;
  }

  void _onActivityTapped(ActivityItem item) {
    if (item.isPiscine && item.piscineSession != null) {
      // Navigeer naar SessionDetailScreen voor piscine
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => SessionDetailScreen(
            session: item.piscineSession!,
          ),
        ),
      );
    } else if (item.isOperation) {
      // Navigeer naar OperationDetailScreen voor reguliere operations
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => OperationDetailScreen(
            operationId: item.id,
            clubId: _clubId,
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final activityProvider = context.watch<ActivityProvider>();

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
                _buildFilterChip('piscine', 'Piscine'),
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
              onRefresh: _refreshActivities,
              child: _buildActivityList(activityProvider),
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

  Widget _buildActivityList(ActivityProvider activityProvider) {
    final allActivities = activityProvider.activities;

    // Loading initial
    if (activityProvider.isLoading && allActivities.isEmpty) {
      return const LoadingWidget(message: 'Chargement des événements...');
    }

    // Filter op categorie
    final filtered = allActivities.where((item) {
      if (_selectedFilter == 'all') return true;
      return item.categorie == _selectedFilter;
    }).toList();

    // Sort by date
    filtered.sort((a, b) => a.date.compareTo(b.date));

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
                  : _selectedFilter == 'piscine'
                      ? Icons.pool
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
        final monthActivities = grouped[monthKey]!;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Month header
            _buildMonthHeader(monthKey),
            // Activities for this month
            ...monthActivities.map((item) => _buildActivityCard(item)),
          ],
        );
      },
    );
  }

  Widget _buildMonthHeader(String monthName) {
    // Capitalize first letter
    final capitalizedMonth =
        monthName[0].toUpperCase() + monthName.substring(1);

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

  Widget _buildActivityCard(ActivityItem item) {
    final dayName = DateFormat('EEEE', 'fr_FR').format(item.date);
    final dayNumber = DateFormat('d', 'fr_FR').format(item.date);

    // Tijd bepalen op basis van type
    String time;
    if (item.isPiscine && item.horaire != null) {
      time = item.horaire!;
    } else if (item.operation?.dateDebut != null) {
      time = DateFormat('HH:mm', 'fr_FR').format(item.operation!.dateDebut!);
    } else {
      time = '--:--';
    }

    // Icoon op basis van categorie
    IconData icon;
    if (item.categorie == 'piscine') {
      icon = Icons.pool;
    } else if (item.categorie == 'plongee') {
      icon = Icons.scuba_diving;
    } else {
      icon = Icons.directions_boat;
    }

    return GestureDetector(
      onTap: () => _onActivityTapped(item),
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
                    colors: item.isPiscine
                        ? [
                            const Color(0xFF00B4DB), // Piscine blauw
                            const Color(0xFF0083B0),
                          ]
                        : [
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
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
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
              // Activity details
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
                            icon,
                            size: 18,
                            color: item.isPiscine
                                ? const Color(0xFF0083B0)
                                : AppColors.middenblauw,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              item.titre,
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
                      // Location (niet tonen voor piscine - dat is al duidelijk)
                      if (item.lieu != null && item.lieu!.isNotEmpty && !item.isPiscine) ...[
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
                                item.lieu!,
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
                      // Extra info (verschilt per type)
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          if (item.isPiscine) ...[
                            // Piscine: toon accueil en encadrants count
                            Icon(
                              Icons.group,
                              size: 14,
                              color: const Color(0xFF0083B0).withOpacity(0.7),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              item.subtitle ?? '',
                              style: TextStyle(
                                fontSize: 13,
                                color: Colors.grey[600],
                              ),
                            ),
                          ] else if (item.capaciteMax != null &&
                              item.capaciteMax! > 0) ...[
                            // Operation: toon capaciteit
                            Icon(
                              Icons.group,
                              size: 14,
                              color: AppColors.middenblauw.withOpacity(0.7),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              'Max ${item.capaciteMax}',
                              style: TextStyle(
                                fontSize: 13,
                                color: Colors.grey[600],
                              ),
                            ),
                          ],
                          const Spacer(),
                          // Price badge (alleen voor operations met prijs)
                          if (!item.isPiscine && item.prix != null && item.prix! > 0)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: AppColors.lichtblauw.withOpacity(0.3),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                '${item.prix!.toStringAsFixed(2)} €',
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
                  color: item.isPiscine
                      ? const Color(0xFF0083B0).withOpacity(0.5)
                      : AppColors.middenblauw.withOpacity(0.5),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
