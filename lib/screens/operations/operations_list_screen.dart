import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lottie/lottie.dart';
import 'package:syncfusion_flutter_calendar/calendar.dart';
import 'package:intl/intl.dart';
import '../../config/firebase_config.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../models/operation.dart';
import '../../providers/operation_provider.dart';
import '../../widgets/loading_widget.dart';
import 'operation_detail_screen.dart';

/// Liste des événements avec tabs Plongées / Sorties et vue calendrier
class OperationsListScreen extends StatefulWidget {
  const OperationsListScreen({Key? key}) : super(key: key);

  @override
  State<OperationsListScreen> createState() => _OperationsListScreenState();
}

class _OperationsListScreenState extends State<OperationsListScreen>
    with SingleTickerProviderStateMixin {
  final String _clubId = FirebaseConfig.defaultClubId;
  late TabController _tabController;

  // Calendar state
  CalendarView _calendarView = CalendarView.schedule; // Default to agenda view
  final CalendarController _calendarController = CalendarController();

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
    _calendarController.dispose();
    super.dispose();
  }

  Future<void> _refreshOperations() async {
    await context.read<OperationProvider>().refresh(_clubId);
  }

  /// Convert operations to Syncfusion appointments
  List<Appointment> _getAppointments(List<Operation> operations, String categorie) {
    final filtered = operations.where((op) {
      final opCategorie = op.categorie ?? 'plongee';
      return opCategorie == categorie;
    }).toList();

    return filtered.map((op) {
      final startDate = op.dateDebut ?? DateTime.now();
      final endDate = op.dateFin ?? startDate.add(const Duration(hours: 2));
      final isPlongee = categorie == 'plongee';

      return Appointment(
        startTime: startDate,
        endTime: endDate,
        subject: op.titre,
        color: AppColors.middenblauw,
        id: op.id,
        location: op.lieu,
        notes: op.description,
      );
    }).toList();
  }

  void _onCalendarTapped(CalendarTapDetails details) {
    if (details.targetElement == CalendarElement.appointment &&
        details.appointments != null &&
        details.appointments!.isNotEmpty) {
      final appointment = details.appointments!.first as Appointment;
      final operationId = appointment.id as String;

      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => OperationDetailScreen(
            operationId: operationId,
            clubId: _clubId,
          ),
        ),
      );
    }
  }

  String _getMonthName(DateTime date) {
    return DateFormat('MMMM yyyy', 'fr_FR').format(date);
  }

  void _changeCalendarView() {
    setState(() {
      // Cycle through views: Month -> Week -> Schedule -> Month
      switch (_calendarView) {
        case CalendarView.month:
          _calendarView = CalendarView.week;
          break;
        case CalendarView.week:
          _calendarView = CalendarView.schedule;
          break;
        case CalendarView.schedule:
          _calendarView = CalendarView.month;
          break;
        default:
          _calendarView = CalendarView.month;
      }
      _calendarController.view = _calendarView;
    });
  }

  IconData _getViewIcon() {
    switch (_calendarView) {
      case CalendarView.month:
        return Icons.calendar_view_month;
      case CalendarView.week:
        return Icons.calendar_view_week;
      case CalendarView.schedule:
        return Icons.view_agenda;
      default:
        return Icons.calendar_month;
    }
  }

  String _getViewTooltip() {
    switch (_calendarView) {
      case CalendarView.month:
        return 'Vue semaine';
      case CalendarView.week:
        return 'Vue agenda';
      case CalendarView.schedule:
        return 'Vue mois';
      default:
        return 'Changer vue';
    }
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
        actions: [
          // Change calendar view - bigger button
          Container(
            margin: const EdgeInsets.only(right: 8),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: IconButton(
              icon: Icon(_getViewIcon(), color: Colors.white, size: 28),
              onPressed: _changeCalendarView,
              tooltip: _getViewTooltip(),
            ),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          indicatorWeight: 3,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          dividerColor: Colors.transparent,
          tabs: [
            Tab(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text('Plongées', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              ),
            ),
            Tab(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text('Sorties', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              ),
            ),
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
          // Content (calendar view)
          SafeArea(
            child: TabBarView(
              controller: _tabController,
              children: [
                // Tab Plongées
                RefreshIndicator(
                  onRefresh: _refreshOperations,
                  child: _buildSyncfusionCalendar(operationProvider, 'plongee'),
                ),
                // Tab Sorties
                RefreshIndicator(
                  onRefresh: _refreshOperations,
                  child: _buildSyncfusionCalendar(operationProvider, 'sortie'),
                ),
              ],
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

  Widget _buildSyncfusionCalendar(OperationProvider operationProvider, String categorie) {
    final allOperations = operationProvider.operations;

    // Loading initial
    if (operationProvider.isLoading && allOperations.isEmpty) {
      return const LoadingWidget(message: 'Chargement des événements...');
    }

    final appointments = _getAppointments(allOperations, categorie);
    final isPlongee = categorie == 'plongee';

    return Container(
      margin: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.white.withOpacity(0.95),
            AppColors.lichtblauw.withOpacity(0.15),
          ],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppColors.middenblauw.withOpacity(0.2),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.donkerblauw.withOpacity(0.1),
            blurRadius: 15,
            spreadRadius: 2,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: SfCalendar(
          controller: _calendarController,
          view: _calendarView,
          dataSource: _OperationDataSource(appointments),
          onTap: _onCalendarTapped,
          firstDayOfWeek: 1, // Monday
          showNavigationArrow: true,
          showDatePickerButton: true,
          allowViewNavigation: true,
          // Show 6 months ahead
          minDate: DateTime.now().subtract(const Duration(days: 30)),
          maxDate: DateTime.now().add(const Duration(days: 365)),

          // Month view settings
          monthViewSettings: MonthViewSettings(
            showAgenda: true,
            agendaViewHeight: 150,
            appointmentDisplayMode: MonthAppointmentDisplayMode.appointment,
            appointmentDisplayCount: 2,
            agendaItemHeight: 60,
            agendaStyle: AgendaStyle(
              backgroundColor: Colors.transparent,
              appointmentTextStyle: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: Colors.white,
              ),
              dateTextStyle: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.donkerblauw,
              ),
              dayTextStyle: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: AppColors.donkerblauw,
              ),
            ),
            monthCellStyle: MonthCellStyle(
              textStyle: const TextStyle(
                fontSize: 12,
                color: Colors.black87,
              ),
              trailingDatesTextStyle: TextStyle(
                fontSize: 12,
                color: Colors.grey.shade400,
              ),
              leadingDatesTextStyle: TextStyle(
                fontSize: 12,
                color: Colors.grey.shade400,
              ),
            ),
          ),

          // Custom appointment builder for centered text
          appointmentBuilder: (context, calendarAppointmentDetails) {
            final appointment = calendarAppointmentDetails.appointments.first;
            return Container(
              decoration: BoxDecoration(
                color: appointment.color,
                borderRadius: BorderRadius.circular(4),
              ),
              alignment: Alignment.center,
              child: Text(
                appointment.subject,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
              ),
            );
          },

          // Custom month header builder for centered text
          scheduleViewMonthHeaderBuilder: (context, details) {
            final monthName = _getMonthName(details.date);
            return Container(
              color: AppColors.donkerblauw,
              alignment: Alignment.center,
              child: Text(
                monthName,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                  letterSpacing: 1.0,
                ),
              ),
            );
          },

          // Schedule view settings - Thème maritime
          scheduleViewSettings: ScheduleViewSettings(
            appointmentItemHeight: 70,
            hideEmptyScheduleWeek: true,
            monthHeaderSettings: const MonthHeaderSettings(
              height: 70,
            ),
            weekHeaderSettings: WeekHeaderSettings(
              startDateFormat: 'd MMM',
              endDateFormat: 'd MMM',
              height: 0, // Hide week headers for cleaner look
              textAlign: TextAlign.center,
              backgroundColor: AppColors.lichtblauw.withOpacity(0.1),
              weekTextStyle: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.middenblauw,
              ),
            ),
            dayHeaderSettings: DayHeaderSettings(
              dayFormat: 'EEEE',
              width: 70,
              dateTextStyle: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
                color: AppColors.donkerblauw,
              ),
              dayTextStyle: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.middenblauw,
              ),
            ),
          ),

          // Week view settings
          timeSlotViewSettings: const TimeSlotViewSettings(
            startHour: 6,
            endHour: 22,
            timeFormat: 'HH:mm',
            timeIntervalHeight: 60,
            timeTextStyle: TextStyle(
              fontSize: 12,
              color: Colors.grey,
            ),
          ),

          // Header styling
          headerStyle: CalendarHeaderStyle(
            textAlign: TextAlign.center,
            backgroundColor: Colors.transparent,
            textStyle: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppColors.donkerblauw,
            ),
          ),

          // View header (days of week)
          viewHeaderStyle: ViewHeaderStyle(
            backgroundColor: Colors.grey.shade50,
            dayTextStyle: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.donkerblauw,
            ),
            dateTextStyle: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: AppColors.donkerblauw,
            ),
          ),

          // Today highlight
          todayHighlightColor: isPlongee ? AppColors.middenblauw : AppColors.middenblauw,

          // Selection
          selectionDecoration: BoxDecoration(
            color: Colors.transparent,
            border: Border.all(
              color: isPlongee ? AppColors.middenblauw : AppColors.middenblauw,
              width: 2,
            ),
            borderRadius: BorderRadius.circular(4),
          ),

          // Cell border
          cellBorderColor: Colors.grey.shade200,
        ),
      ),
    );
  }

}

/// Custom data source for Syncfusion calendar
class _OperationDataSource extends CalendarDataSource {
  _OperationDataSource(List<Appointment> source) {
    appointments = source;
  }
}
