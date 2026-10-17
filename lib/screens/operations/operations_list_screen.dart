import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../config/firebase_config.dart';
import '../../config/app_colors.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../../models/activity_item.dart';
import '../../models/team_channel.dart';
import '../../providers/activity_provider.dart';
import '../../providers/member_provider.dart';
import '../../widgets/loading_widget.dart';
import '../../services/unread_count_service.dart';
import '../../providers/auth_provider.dart';
import '../../providers/unread_count_provider.dart';
import 'operation_detail_screen.dart';
import 'operations_list_filter.dart';
import 'operations_filter_bar.dart';
import 'event_search_screen.dart';
import 'event_type_selector.dart';
import 'create_event_wizard.dart';
import '../piscine/session_detail_screen.dart';
import '../teams/team_chat_screen.dart';

/// Liste des événements avec filtre (Tout / Plongées / Piscine / Sorties)
/// Combineert operations en piscine sessions in één overzicht
class OperationsListScreen extends StatefulWidget {
  const OperationsListScreen({Key? key}) : super(key: key);

  @override
  State<OperationsListScreen> createState() => _OperationsListScreenState();
}

@visibleForTesting
class OperationsLoadFailureNotice extends StatelessWidget {
  const OperationsLoadFailureNotice({
    super.key,
    required this.hasRetainedRows,
    required this.onRetry,
  });

  final bool hasRetainedRows;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (hasRetainedRows) {
      return Card(
        color: Colors.orange.shade50,
        child: ListTile(
          leading: Icon(
            Icons.sync_problem_rounded,
            color: Colors.orange.shade800,
          ),
          title: const Text(
            'Mise à jour indisponible. La dernière liste reste affichée.',
          ),
          trailing: TextButton(
            onPressed: onRetry,
            child: const Text('Réessayer'),
          ),
        ),
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.sync_problem_rounded, size: 42, color: Colors.white),
        const SizedBox(height: 8),
        const Text(
          'Chargement indisponible.',
          style: TextStyle(color: Colors.white),
        ),
        TextButton(onPressed: onRetry, child: const Text('Réessayer')),
      ],
    );
  }
}

class _OperationsListScreenState extends State<OperationsListScreen> {
  final String _clubId = FirebaseConfig.defaultClubId;
  String _selectedFilter = 'all'; // 'all', 'plongee', 'piscine', 'sortie'

  @override
  void initState() {
    super.initState();
    // Start de gecombineerde stream
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final userId = context.read<AuthProvider>().currentUser?.uid;
      context.read<ActivityProvider>().listenToActivities(
        _clubId,
        currentUserId: userId,
      );
    });
  }

  Future<void> _refreshActivities() async {
    await context.read<ActivityProvider>().refresh(_clubId);
  }

  Future<void> _markEventsAsRead() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Tout marquer comme lu ?'),
        content: const Text(
          'Toutes les discussions d’événements seront marquées comme lues.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirmer'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await context.read<UnreadCountProvider>().markEventsSeen();
  }

  /// Open the activity creation flow (Stap 0: type selection)
  void _openCreateActivity() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => EventTypeSelector(
          onClose: () => Navigator.pop(context),
          onCategorySelected: (category) {
            // Pop the type selector
            Navigator.pop(context);
            // Open the wizard with selected category
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => CreateEventWizard(eventCategory: category),
              ),
            );
          },
        ),
      ),
    );
  }

  /// Lance une enquête d'intérêt dans le canal général avant de créer
  /// un événement. Le sondage reste visible par tous les membres du club.
  void _openInterestPoll() {
    const channelType = TeamChannelType.general;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => TeamChatScreen(
          channel: TeamChannel(
            id: channelType.id,
            name: channelType.displayName,
            type: channelType,
            description: channelType.description,
            createdAt: DateTime.now(),
          ),
          openPollComposer: true,
        ),
      ),
    );
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
          builder: (_) => SessionDetailScreen(session: item.piscineSession!),
        ),
      );
    } else if (item.isOperation) {
      // Navigeer naar OperationDetailScreen voor reguliere operations
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) =>
              OperationDetailScreen(operationId: item.id, clubId: _clubId),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final activityProvider = context.watch<ActivityProvider>();
    final memberProvider = context.watch<MemberProvider>();
    final unreadProvider = context.watch<UnreadCountProvider>();
    final canCreateEvents = memberProvider.canCreateEvents;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Événements', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          if (unreadProvider.usesCursorReadState &&
              unreadProvider.isCursorReady)
            IconButton(
              icon: const Icon(Icons.done_all_outlined),
              tooltip: 'Tout marquer comme lu',
              onPressed: _markEventsAsRead,
            ),
          IconButton(
            icon: const Icon(Icons.search, size: 26),
            tooltip: 'Rechercher',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const EventSearchScreen()),
            ),
          ),
          if (canCreateEvents)
            IconButton(
              icon: const Icon(Icons.poll_outlined, size: 27),
              tooltip: 'Créer un sondage d\'intérêt',
              onPressed: _openInterestPoll,
            ),
          if (canCreateEvents)
            IconButton(
              icon: const Icon(Icons.add_circle_outline, size: 28),
              tooltip: 'Créer un événement',
              onPressed: _openCreateActivity,
            ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(60),
          child: OperationsFilterBar(
            selectedFilter: _selectedFilter,
            canCreateEvents: canCreateEvents,
            includePast: activityProvider.includePast,
            onFilterSelected: (value) {
              // Lazy: subscribe to closed events only when the filter is used.
              if (value == 'closed') {
                context.read<ActivityProvider>().listenToClosedActivities(
                  _clubId,
                );
              }
              setState(() => _selectedFilter = value);
            },
            onPastToggled: () {
              if (!activityProvider.includePast) {
                // Show every category when looking for an unread past event.
                setState(() => _selectedFilter = 'all');
              }
              context.read<ActivityProvider>().setIncludePast(
                _clubId,
                !activityProvider.includePast,
              );
            },
          ),
        ),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfish,
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: _refreshActivities,
            child: _buildActivityList(activityProvider),
          ),
        ),
      ),
    );
  }

  Widget _buildActivityList(ActivityProvider activityProvider) {
    final isClosedMode = _selectedFilter == 'closed';
    final source = isClosedMode
        ? activityProvider.closedActivities
        : activityProvider.activities;

    // Loading initial
    final loading = isClosedMode
        ? activityProvider.isLoadingClosed
        : activityProvider.isLoading;
    final stalled = isClosedMode
        ? activityProvider.isClosedLoadStalled
        : activityProvider.isLoadStalled;
    final hasLoadError = isClosedMode
        ? activityProvider.closedErrorMessage != null
        : activityProvider.errorMessage != null;
    void retry() {
      if (isClosedMode) {
        activityProvider.retryClosedActivities();
      } else {
        activityProvider.retryActivities();
      }
    }

    if (loading && source.isEmpty) {
      return const LoadingWidget(message: 'Chargement des événements...');
    }

    final filtered = filterOperationsForView(
      source,
      selectedFilter: _selectedFilter,
      includePast: activityProvider.includePast,
      now: DateTime.now(),
    );

    // Group by month
    final grouped = _groupByMonth(filtered);

    if (filtered.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (stalled || hasLoadError) ...[
              OperationsLoadFailureNotice(
                hasRetainedRows: false,
                onRetry: retry,
              ),
              const SizedBox(height: 16),
            ],
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
              _selectedFilter == 'closed'
                  ? 'Aucun événement clôturé'
                  : 'Aucun événement trouvé',
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
      itemCount: grouped.length + ((stalled || hasLoadError) ? 1 : 0),
      itemBuilder: (context, index) {
        if ((stalled || hasLoadError) && index == 0) {
          return OperationsLoadFailureNotice(
            hasRetainedRows: true,
            onRetry: retry,
          );
        }
        final groupIndex = index - ((stalled || hasLoadError) ? 1 : 0);
        final monthKey = grouped.keys.elementAt(groupIndex);
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
          colors: [AppColors.donkerblauw, AppColors.middenblauw],
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
          color: item.isCancelled ? const Color(0xFFFFE4E6) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: item.isCancelled
              ? Border.all(color: const Color(0xFFDC2626), width: 3)
              : null,
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
          child: Stack(
            children: [
              IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Date badge on the left
                    Container(
                      width: 70,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: item.isDraft
                              ? const [Color(0xFFF59E0B), Color(0xFFB45309)]
                              : item.isCancelled
                              ? const [Color(0xFFEF4444), Color(0xFF991B1B)]
                              : item.isPiscine
                              ? [
                                  AppColors.piscineBlauwLight, // Piscine blauw
                                  AppColors.piscineBlauw,
                                ]
                              : [AppColors.middenblauw, AppColors.donkerblauw],
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
                              horizontal: 8,
                              vertical: 2,
                            ),
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
                                      ? AppColors.piscineBlauw
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
                            if (item.lieu != null &&
                                item.lieu!.isNotEmpty &&
                                !item.isPiscine) ...[
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
                                if (item.isDraft) ...[
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 3,
                                    ),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFFFF3C4),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(
                                      item.statusLabel!,
                                      style: const TextStyle(
                                        color: Color(0xFF92400E),
                                        fontSize: 12,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                ],
                                if (item.isPiscine) ...[
                                  // Piscine: toon accueil en encadrants count
                                  Icon(
                                    Icons.group,
                                    size: 14,
                                    color: AppColors.piscineBlauw.withOpacity(
                                      0.7,
                                    ),
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
                                    color: AppColors.middenblauw.withOpacity(
                                      0.7,
                                    ),
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
                                if (!item.isPiscine &&
                                    item.operation?.priceTbd == true)
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 4,
                                    ),
                                    decoration: BoxDecoration(
                                      color: Colors.orange.withOpacity(0.25),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Text(
                                      'Prix à confirmer',
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.bold,
                                        color: Color(0xFFB45309),
                                      ),
                                    ),
                                  )
                                else if (!item.isPiscine &&
                                    item.prix != null &&
                                    item.prix! > 0)
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 4,
                                    ),
                                    decoration: BoxDecoration(
                                      color: AppColors.lichtblauw.withOpacity(
                                        0.3,
                                      ),
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
                    // Unread badge + arrow indicator
                    _buildUnreadBadgeAndArrow(item),
                  ],
                ),
              ),
              if (item.isCancelled)
                Positioned.fill(
                  child: IgnorePointer(
                    child: Center(
                      child: Transform.rotate(
                        angle: -0.22,
                        child: Text(
                          'ANNULÉ',
                          style: TextStyle(
                            color: const Color(0xFFB91C1C).withOpacity(0.72),
                            fontSize: 34,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 4,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildUnreadBadgeAndArrow(ActivityItem item) {
    final userId = context.watch<AuthProvider>().currentUser?.uid;
    final unreadProvider = context.watch<UnreadCountProvider>();

    if (userId == null) {
      return Padding(
        padding: const EdgeInsets.only(right: 12),
        child: Icon(
          Icons.chevron_right,
          color: item.isPiscine
              ? AppColors.piscineBlauw.withOpacity(0.5)
              : AppColors.middenblauw.withOpacity(0.5),
        ),
      );
    }

    late final Stream<int> unreadStream;

    // Individuele unread count per operatie via UnreadCountService
    final clubId = FirebaseConfig.defaultClubId;
    final opId = item.operation?.id;
    final snapshotCount = opId == null
        ? 0
        : unreadProvider.eventUnreadFor(opId);
    if (snapshotCount != null) {
      return _buildUnreadBadgeValue(item, snapshotCount);
    }
    if (opId == null) {
      unreadStream = Stream.value(0);
    } else {
      unreadStream = Stream.fromFuture(
        UnreadCountService().countUnreadForOperation(clubId, opId),
      );
    }

    return StreamBuilder<int>(
      stream: unreadStream,
      builder: (context, snapshot) {
        final unreadCount = snapshot.data;
        return _buildUnreadBadgeValue(
          item,
          unreadCount ?? 0,
          unavailable: snapshot.hasError || !snapshot.hasData,
        );
      },
    );
  }

  Widget _buildUnreadBadgeValue(
    ActivityItem item,
    int unreadCount, {
    bool unavailable = false,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 12),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (unavailable)
            const Tooltip(
              message: 'Compteur temporairement indisponible',
              child: Icon(Icons.error_outline, color: Colors.red, size: 20),
            )
          else if (unreadCount > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.red,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                unreadCount > 99 ? '99+' : unreadCount.toString(),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          if (unavailable || unreadCount > 0) const SizedBox(width: 6),
          Icon(
            Icons.chevron_right,
            color: item.isPiscine
                ? AppColors.piscineBlauw.withOpacity(0.5)
                : AppColors.middenblauw.withOpacity(0.5),
          ),
        ],
      ),
    );
  }
}
