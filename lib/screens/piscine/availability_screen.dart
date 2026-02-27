import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../config/app_colors.dart';
import '../../config/piscine_slots.dart';
import '../../providers/auth_provider.dart';
import '../../providers/availability_provider.dart';
import '../../widgets/piscine_animated_background.dart';
import '../../widgets/glossy_button.dart';

/// Écran de gestion des disponibilités pour les séances piscine
/// Permet aux Accueil et Encadrants d'indiquer leurs disponibilités
/// Supporte plusieurs rôles avec tabs si l'utilisateur a les deux
class AvailabilityScreen extends StatefulWidget {
  final List<String> userRoles; // ['accueil', 'encadrant'] ou ['accueil']

  const AvailabilityScreen({
    super.key,
    required this.userRoles,
  });

  @override
  State<AvailabilityScreen> createState() => _AvailabilityScreenState();
}

class _AvailabilityScreenState extends State<AvailabilityScreen>
    with SingleTickerProviderStateMixin {
  late AvailabilityProvider _availabilityProvider;
  bool _isInitialized = false;
  TabController? _tabController;
  late String _currentRole;

  @override
  void initState() {
    super.initState();
    _currentRole = widget.userRoles.first;

    // Create tab controller if multiple roles
    if (widget.userRoles.length > 1) {
      _tabController = TabController(
        length: widget.userRoles.length,
        vsync: this,
      );
      _tabController!.addListener(_onTabChanged);
    }

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initializeProvider();
    });
  }

  void _onTabChanged() {
    if (_tabController != null && !_tabController!.indexIsChanging) {
      final newRole = widget.userRoles[_tabController!.index];
      if (newRole != _currentRole) {
        setState(() {
          _currentRole = newRole;
        });
        _reinitializeProvider(newRole);
      }
    }
  }

  Future<void> _initializeProvider() async {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final user = authProvider.currentUser;

    if (user != null) {
      _availabilityProvider =
          Provider.of<AvailabilityProvider>(context, listen: false);
      _availabilityProvider.initialize(
        clubId: 'calypso',
        userId: user.uid,
        role: _currentRole,
      );
      setState(() {
        _isInitialized = true;
      });
    }
  }

  Future<void> _reinitializeProvider(String role) async {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final user = authProvider.currentUser;

    if (user != null) {
      _availabilityProvider.initialize(
        clubId: 'calypso',
        userId: user.uid,
        role: role,
      );
    }
  }

  @override
  void dispose() {
    _tabController?.removeListener(_onTabChanged);
    _tabController?.dispose();
    super.dispose();
  }

  String _getRoleDisplayName(String role) {
    switch (role.toLowerCase()) {
      case 'accueil':
        return 'Accueil';
      case 'encadrant':
        return 'Encadrant';
      case 'gonflage':
        return 'Gonflage';
      case 'theorie':
        return 'Théorie';
      default:
        return role;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PiscineAnimatedBackground(
        showJellyfish: true,
        showSeaweed: true,
        showBubbles: false,
        jellyfishCount: 2,
        child: SafeArea(
          child: Column(
            children: [
              _buildHeader(),
              // Tab bar if multiple roles
              if (widget.userRoles.length > 1) _buildTabBar(),
              Expanded(
                child: _isInitialized
                    ? _buildContent()
                    : const Center(
                        child: CircularProgressIndicator(color: Colors.white),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white, size: 28),
            onPressed: () => Navigator.pop(context),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Mes Disponibilités',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                // Only show role subtitle if single role
                if (widget.userRoles.length == 1)
                  Text(
                    'Rôle: ${_getRoleDisplayName(_currentRole)}',
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.8),
                      fontSize: 14,
                    ),
                  ),
              ],
            ),
          ),
          GlossyButton(
            icon: Icons.today,
            label: '',
            size: 50,
            onTap: () {
              _availabilityProvider.goToCurrentMonth();
            },
          ),
        ],
      ),
    );
  }

  Widget _buildTabBar() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
        ),
        indicatorSize: TabBarIndicatorSize.tab,
        indicatorPadding: const EdgeInsets.all(4),
        labelColor: AppColors.donkerblauw,
        unselectedLabelColor: Colors.white,
        labelStyle: const TextStyle(
          fontWeight: FontWeight.bold,
          fontSize: 14,
        ),
        unselectedLabelStyle: const TextStyle(
          fontWeight: FontWeight.w500,
          fontSize: 14,
        ),
        dividerColor: Colors.transparent,
        tabs: widget.userRoles.map((role) {
          return Tab(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  role == 'accueil'
                      ? Icons.badge
                      : role == 'gonflage'
                          ? Icons.air
                          : Icons.school,
                  size: 18,
                ),
                const SizedBox(width: 8),
                Text(_getRoleDisplayName(role)),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildContent() {
    return Consumer<AvailabilityProvider>(
      builder: (context, provider, child) {
        if (provider.isLoading) {
          return const Center(
            child: CircularProgressIndicator(color: Colors.white),
          );
        }

        if (provider.error != null) {
          return _buildErrorWidget(provider.error!);
        }

        return RefreshIndicator(
          onRefresh: provider.refresh,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                const SizedBox(height: 16),
                _buildMonthNavigation(provider),
                const SizedBox(height: 24),
                _buildCalendar(provider),
                const SizedBox(height: 24),
                _buildSummary(provider),
                const SizedBox(height: 16),
                _buildHelpText(),
                const SizedBox(height: 100), // Space for seaweed
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildMonthNavigation(AvailabilityProvider provider) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.15),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left, color: Colors.white, size: 32),
            onPressed: provider.previousMonth,
          ),
          Text(
            provider.currentMonthName,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          IconButton(
            icon:
                const Icon(Icons.chevron_right, color: Colors.white, size: 32),
            onPressed: provider.nextMonth,
          ),
        ],
      ),
    );
  }

  Widget _buildCalendar(AvailabilityProvider provider) {
    final tuesdays = provider.currentMonthTuesdays;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.95),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.pool, color: AppColors.middenblauw, size: 24),
              const SizedBox(width: 8),
              Text(
                'Séances Piscine (Mardis)',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: AppColors.donkerblauw,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (tuesdays.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Aucun mardi ce mois',
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 16,
                  ),
                ),
              ),
            )
          else
            ...tuesdays.map((tuesday) => _buildTuesdayTile(tuesday, provider)),
        ],
      ),
    );
  }

  /// Whether the current role uses time slots (encadrant or gonflage)
  bool get _roleHasSlots => roleHasSlots(_currentRole);

  Widget _buildTuesdayTile(DateTime tuesday, AvailabilityProvider provider) {
    final availability = provider.getAvailabilityForDate(tuesday);
    final isAvailable = availability?.available ?? false;
    final isNotIndicated = availability == null;
    final isPast = tuesday.isBefore(DateTime.now().subtract(const Duration(days: 1)));
    final selectedSlots = availability?.timeSlots ?? [];

    final dateFormat = DateFormat('EEEE d MMMM', 'fr_FR');
    final formattedDate = dateFormat.format(tuesday);
    final displayDate =
        formattedDate[0].toUpperCase() + formattedDate.substring(1);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: isPast
            ? null
            : () async {
                if (_roleHasSlots) {
                  // Open slot selection bottom sheet for encadrant/gonflage
                  await _showSlotSelectionSheet(
                    context: context,
                    date: tuesday,
                    provider: provider,
                    currentAvailability: availability,
                  );
                } else {
                  // Simple toggle cycle for accueil
                  final authProvider =
                      Provider.of<AuthProvider>(context, listen: false);
                  final displayName = authProvider.displayName ?? 'Membre';
                  final nameParts = displayName.split(' ');
                  final prenom = nameParts.first;
                  final nom = nameParts.length > 1
                      ? nameParts.sublist(1).join(' ')
                      : '';

                  try {
                    await provider.toggleAvailability(
                      date: tuesday,
                      userNom: nom,
                      userPrenom: prenom,
                    );
                  } catch (e) {
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('Erreur: $e'),
                          backgroundColor: Colors.red,
                        ),
                      );
                    }
                  }
                }
              },
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: isPast
                ? Colors.grey.withOpacity(0.1)
                : isAvailable
                    ? AppColors.success.withOpacity(0.15)
                    : isNotIndicated
                        ? Colors.grey.withOpacity(0.1)
                        : Colors.red.withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isPast
                  ? Colors.grey.withOpacity(0.3)
                  : isAvailable
                      ? AppColors.success
                      : isNotIndicated
                          ? Colors.grey.withOpacity(0.3)
                          : Colors.red.withOpacity(0.5),
              width: 1.5,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    isPast
                        ? Icons.event_busy
                        : isAvailable
                            ? Icons.check_circle
                            : isNotIndicated
                                ? Icons.help_outline
                                : Icons.cancel,
                    color: isPast
                        ? Colors.grey
                        : isAvailable
                            ? AppColors.success
                            : isNotIndicated
                                ? Colors.grey
                                : Colors.red,
                    size: 28,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          displayDate,
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: isPast
                                ? Colors.grey
                                : AppColors.donkerblauw,
                          ),
                        ),
                        Text(
                          isPast
                              ? 'Passé'
                              : isAvailable
                                  ? 'Disponible'
                                  : isNotIndicated
                                      ? 'Pas encore indiqué'
                                      : 'Non disponible',
                          style: TextStyle(
                            fontSize: 13,
                            color: isPast
                                ? Colors.grey
                                : isAvailable
                                    ? AppColors.success
                                    : isNotIndicated
                                        ? Colors.grey
                                        : Colors.red,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (!isPast)
                    Icon(
                      _roleHasSlots ? Icons.edit : Icons.touch_app,
                      color: Colors.grey.withOpacity(0.5),
                      size: 20,
                    ),
                ],
              ),
              // Show selected time slots chips when available and role has slots
              if (!isPast && isAvailable && _roleHasSlots && selectedSlots.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: selectedSlots.map((slot) {
                    final label = getSlotLabel(_currentRole, slot);
                    return Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.success.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: AppColors.success.withOpacity(0.5),
                        ),
                      ),
                      child: Text(
                        label,
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.success,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ],
              // Show "tous créneaux" hint when available but no slots selected (legacy)
              if (!isPast && isAvailable && _roleHasSlots && selectedSlots.isEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  'Appuyer pour préciser les créneaux',
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade600,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  /// Bottom sheet for selecting time slots (encadrant / gonflage roles)
  Future<void> _showSlotSelectionSheet({
    required BuildContext context,
    required DateTime date,
    required AvailabilityProvider provider,
    required dynamic currentAvailability, // Availability?
  }) async {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final displayName = authProvider.displayName ?? 'Membre';
    final nameParts = displayName.split(' ');
    final prenom = nameParts.first;
    final nom = nameParts.length > 1 ? nameParts.sublist(1).join(' ') : '';

    final slots = getSlotsForRole(_currentRole);
    final dateFormat = DateFormat('EEEE d MMMM', 'fr_FR');
    final formattedDate = dateFormat.format(date);
    final displayDate =
        formattedDate[0].toUpperCase() + formattedDate.substring(1);

    // Pre-fill selected slots from existing availability
    final initialSlots = (currentAvailability?.timeSlots as List<String>?) ?? [];

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            final selectedSlots = List<String>.from(initialSlots);

            return _SlotSelectionSheet(
              date: displayDate,
              role: _currentRole,
              slots: slots,
              initialSelectedSlots: initialSlots,
              currentAvailability: currentAvailability,
              onConfirmAvailable: (chosenSlots) async {
                Navigator.pop(ctx);
                try {
                  await provider.setAvailability(
                    date: date,
                    userNom: nom,
                    userPrenom: prenom,
                    available: true,
                    timeSlots: chosenSlots.isEmpty ? null : chosenSlots,
                  );
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                          content: Text('Erreur: $e'),
                          backgroundColor: Colors.red),
                    );
                  }
                }
              },
              onMarkUnavailable: () async {
                Navigator.pop(ctx);
                try {
                  await provider.setAvailability(
                    date: date,
                    userNom: nom,
                    userPrenom: prenom,
                    available: false,
                  );
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                          content: Text('Erreur: $e'),
                          backgroundColor: Colors.red),
                    );
                  }
                }
              },
              onDelete: currentAvailability != null
                  ? () async {
                      Navigator.pop(ctx);
                      try {
                        await provider.removeAvailability(date: date);
                      } catch (e) {
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                                content: Text('Erreur: $e'),
                                backgroundColor: Colors.red),
                          );
                        }
                      }
                    }
                  : null,
            );
          },
        );
      },
    );
  }

  Widget _buildSummary(AvailabilityProvider provider) {
    final tuesdays = provider.currentMonthTuesdays;
    final availableCount = provider.availableDates
        .where((d) =>
            d.year == provider.currentYear &&
            d.month == provider.currentMonth)
        .length;
    final notIndicatedCount = tuesdays
        .where((t) =>
            provider.getAvailabilityForDate(t) == null &&
            !t.isBefore(DateTime.now().subtract(const Duration(days: 1))))
        .length;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.15),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildSummaryItem(
            icon: Icons.check_circle,
            label: 'Disponible',
            count: availableCount,
            color: AppColors.success,
          ),
          Container(
            width: 1,
            height: 40,
            color: Colors.white.withOpacity(0.3),
          ),
          _buildSummaryItem(
            icon: Icons.help_outline,
            label: 'À indiquer',
            count: notIndicatedCount,
            color: Colors.white,
          ),
          Container(
            width: 1,
            height: 40,
            color: Colors.white.withOpacity(0.3),
          ),
          _buildSummaryItem(
            icon: Icons.event,
            label: 'Total',
            count: tuesdays.length,
            color: AppColors.lichtblauw,
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryItem({
    required IconData icon,
    required String label,
    required int count,
    required Color color,
  }) {
    return Column(
      children: [
        Row(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 4),
            Text(
              count.toString(),
              style: TextStyle(
                color: color,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withOpacity(0.8),
            fontSize: 12,
          ),
        ),
      ],
    );
  }

  Widget _buildHelpText() {
    final hint = _roleHasSlots
        ? 'Appuyez sur une date pour sélectionner vos créneaux. '
            'Les administrateurs verront vos disponibilités lors de la planification.'
        : 'Appuyez sur une date pour changer votre disponibilité. '
            'Les administrateurs verront vos disponibilités lors de la planification.';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.lichtblauw.withOpacity(0.2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.lichtblauw.withOpacity(0.5),
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.lightbulb_outline, color: Colors.white.withOpacity(0.9)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              hint,
              style: TextStyle(
                color: Colors.white.withOpacity(0.9),
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorWidget(String error) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 64, color: Colors.red.shade300),
            const SizedBox(height: 16),
            const Text(
              'Erreur',
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              error,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withOpacity(0.8),
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () {
                _availabilityProvider.clearError();
                _availabilityProvider.refresh();
              },
              icon: const Icon(Icons.refresh),
              label: const Text('Réessayer'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.middenblauw,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Slot Selection Bottom Sheet (stateful widget)
// ---------------------------------------------------------------------------

class _SlotSelectionSheet extends StatefulWidget {
  final String date;
  final String role;
  final List<String> slots;
  final List<String> initialSelectedSlots;
  final dynamic currentAvailability; // Availability?
  final Future<void> Function(List<String> selectedSlots) onConfirmAvailable;
  final Future<void> Function() onMarkUnavailable;
  final Future<void> Function()? onDelete;

  const _SlotSelectionSheet({
    required this.date,
    required this.role,
    required this.slots,
    required this.initialSelectedSlots,
    required this.currentAvailability,
    required this.onConfirmAvailable,
    required this.onMarkUnavailable,
    this.onDelete,
  });

  @override
  State<_SlotSelectionSheet> createState() => _SlotSelectionSheetState();
}

class _SlotSelectionSheetState extends State<_SlotSelectionSheet> {
  late List<String> _selectedSlots;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _selectedSlots = List<String>.from(widget.initialSelectedSlots);
  }

  void _toggleSlot(String slot) {
    setState(() {
      if (_selectedSlots.contains(slot)) {
        _selectedSlots.remove(slot);
      } else {
        _selectedSlots.add(slot);
      }
    });
  }

  String _getRoleTitle() {
    switch (widget.role) {
      case 'encadrant':
        return 'Disponibilité Encadrant';
      case 'gonflage':
        return 'Disponibilité Gonflage';
      default:
        return 'Disponibilité';
    }
  }

  String _getSlotHint() {
    switch (widget.role) {
      case 'encadrant':
        return 'Sélectionnez les heures où vous serez disponible';
      case 'gonflage':
        return 'Sélectionnez les créneaux de gonflage';
      default:
        return 'Sélectionnez vos créneaux';
    }
  }

  @override
  Widget build(BuildContext context) {
    final isCurrentlyAvailable =
        widget.currentAvailability?.available == true;

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle bar
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Title
          Text(
            _getRoleTitle(),
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: AppColors.donkerblauw,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            widget.date,
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey.shade600,
            ),
          ),
          const SizedBox(height: 20),

          // Slot selection section
          Text(
            _getSlotHint(),
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: AppColors.donkerblauw,
            ),
          ),
          const SizedBox(height: 12),

          // Slot chips
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: widget.slots.map((slot) {
              final isSelected = _selectedSlots.contains(slot);
              final label = getSlotLabel(widget.role, slot);
              return GestureDetector(
                onTap: () => _toggleSlot(slot),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? AppColors.middenblauw
                        : Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                      color: isSelected
                          ? AppColors.middenblauw
                          : Colors.grey.shade300,
                      width: 2,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (isSelected) ...[
                        const Icon(Icons.check, color: Colors.white, size: 16),
                        const SizedBox(width: 6),
                      ],
                      Text(
                        label,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: isSelected
                              ? Colors.white
                              : Colors.grey.shade700,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),

          const SizedBox(height: 8),
          Text(
            _selectedSlots.isEmpty
                ? 'Aucun créneau sélectionné — sera enregistré sans préférence'
                : '${_selectedSlots.length} créneau(x) sélectionné(s)',
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey.shade500,
              fontStyle: FontStyle.italic,
            ),
          ),

          const SizedBox(height: 24),

          // Action buttons
          if (_isSaving)
            const Center(child: CircularProgressIndicator())
          else
            Column(
              children: [
                // Confirm available button
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () async {
                      setState(() => _isSaving = true);
                      await widget.onConfirmAvailable(_selectedSlots);
                    },
                    icon: const Icon(Icons.check_circle),
                    label: Text(
                      isCurrentlyAvailable
                          ? 'Mettre à jour les créneaux'
                          : 'Je suis disponible',
                      style: const TextStyle(fontSize: 16),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.success,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 10),

                // Mark unavailable button
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      setState(() => _isSaving = true);
                      await widget.onMarkUnavailable();
                    },
                    icon: const Icon(Icons.cancel),
                    label: const Text(
                      'Non disponible',
                      style: TextStyle(fontSize: 16),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                      side: const BorderSide(color: Colors.red),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),

                // Delete button (only if availability exists)
                if (widget.onDelete != null) ...[
                  const SizedBox(height: 10),
                  TextButton.icon(
                    onPressed: () async {
                      setState(() => _isSaving = true);
                      await widget.onDelete!();
                    },
                    icon: Icon(Icons.delete_outline,
                        color: Colors.grey.shade500),
                    label: Text(
                      'Supprimer (retour à "pas encore indiqué")',
                      style: TextStyle(color: Colors.grey.shade500),
                    ),
                  ),
                ],
              ],
            ),
        ],
      ),
    );
  }
}
