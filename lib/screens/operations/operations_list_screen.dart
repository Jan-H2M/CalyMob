import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/firebase_config.dart';
import '../../config/app_colors.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../../models/activity_item.dart';
import '../../models/team_channel.dart';
import '../../providers/activity_provider.dart';
import '../../providers/member_provider.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/agenda_activity.dart';
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
    final grouped = groupAgendaActivitiesByMonth(filtered);

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
            AgendaMonthHeader(monthKey),
            // Activities for this month
            for (final item in monthActivities)
              AgendaActivityCard(
                key: ValueKey('activity-card-${item.id}'),
                item: item,
                clubId: _clubId,
                onTap: () => _onActivityTapped(item),
                trailing: _buildUnreadBadgeAndArrow(item),
              ),
          ],
        );
      },
    );
  }

  Widget _buildUnreadBadgeAndArrow(ActivityItem item) {
    final userId = context.watch<AuthProvider>().currentUser?.uid;

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
