import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../config/app_colors.dart';
import '../../models/activity_item.dart';
import '../../models/expense_activity_summary.dart';
import '../../utils/currency_formatter.dart';
import '../../utils/search_highlight.dart';
import '../../widgets/agenda_activity.dart';

class ExpenseActivityPicker extends StatefulWidget {
  const ExpenseActivityPicker({
    super.key,
    required this.clubId,
    required this.watchActivities,
    required this.loadSummary,
    required this.selected,
  });

  final String clubId;
  final Stream<List<ActivityItem>> Function() watchActivities;
  final Future<ExpenseActivitySummary> Function(ActivityItem activity)
      loadSummary;
  final ActivityItem? selected;

  @override
  State<ExpenseActivityPicker> createState() => _ExpenseActivityPickerState();
}

class _ExpenseActivityPickerState extends State<ExpenseActivityPicker> {
  late final Stream<List<ActivityItem>> _activities = widget.watchActivities();
  final Map<String, Future<ExpenseActivitySummary?>> _summaries = {};
  String _search = '';
  bool _choosing = false;

  Future<ExpenseActivitySummary?> _summary(ActivityItem activity) =>
      _summaries.putIfAbsent('${activity.type}/${activity.id}', () async {
        try {
          return await widget.loadSummary(activity);
        } catch (_) {
          return null;
        }
      });

  Future<void> _choose(ActivityItem? activity) async {
    if (_choosing) return;
    setState(() => _choosing = true);
    final summary = activity == null ? null : await _summary(activity);
    if (!mounted) return;
    Navigator.pop(context, (activity: activity, summary: summary));
  }

  @override
  Widget build(BuildContext context) {
    return Dialog.fullscreen(
      child: Scaffold(
        appBar: AppBar(
          leading: const CloseButton(),
          title: const Text('Activité'),
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: TextField(
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  labelText: 'Rechercher par titre',
                ),
                onChanged: (value) =>
                    setState(() => _search = normalizeSearchText(value.trim())),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.link_off),
              title: const Text('Pas liée à une activité'),
              selected: widget.selected == null,
              onTap: () => _choose(null),
            ),
            Expanded(
              child: StreamBuilder<List<ActivityItem>>(
                stream: _activities,
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return const Center(
                      child: Text('Activités indisponibles.'),
                    );
                  }
                  if (!snapshot.hasData) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  final matching = snapshot.data!.where(
                    (activity) =>
                        normalizeSearchText(activity.titre).contains(_search),
                  );
                  final groups = <AgendaActivityCategory, List<ActivityItem>>{};
                  for (final activity in matching) {
                    (groups[activity.agendaCategory] ??= []).add(activity);
                  }
                  if (groups.isEmpty) {
                    return const Center(
                      child: Text('Aucune activité trouvée.'),
                    );
                  }
                  return CustomScrollView(
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    slivers: [
                      for (final category in AgendaActivityCategory.values)
                        if (groups.containsKey(category)) ...[
                          SliverToBoxAdapter(
                            key: ValueKey(category),
                            child: _categoryHeader(category),
                          ),
                          for (final month in groupAgendaActivitiesByMonth(
                            groups[category]!,
                          ).entries) ...[
                            SliverToBoxAdapter(
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                ),
                                child: AgendaMonthHeader(month.key),
                              ),
                            ),
                            SliverPadding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                              ),
                              sliver: SliverList.builder(
                                itemCount: month.value.length,
                                itemBuilder: (context, index) =>
                                    _activityCard(month.value[index]),
                              ),
                            ),
                          ],
                        ],
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _categoryHeader(AgendaActivityCategory category) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Row(
        children: [
          Icon(category.agendaIcon, color: AppColors.middenblauw),
          const SizedBox(width: 8),
          Text(category.label, style: Theme.of(context).textTheme.titleLarge),
        ],
      ),
    );
  }

  Widget _activityCard(ActivityItem item) {
    final selected =
        widget.selected?.id == item.id && widget.selected?.type == item.type;
    return Semantics(
      key: ValueKey('expense-activity-${item.type}-${item.id}'),
      selected: selected,
      button: true,
      child: AgendaActivityCard(
        item: item,
        clubId: widget.clubId,
        onTap: () => _choose(item),
        extraDetails: FutureBuilder<ExpenseActivitySummary?>(
          future: _summary(item),
          builder: (context, snapshot) =>
              _ExpenseActivityPickerDetails(item: item, summary: snapshot.data),
        ),
        trailing: Padding(
          padding: const EdgeInsets.only(right: 12),
          child: Icon(
            selected ? Icons.check_circle : Icons.radio_button_unchecked,
            color: AppColors.middenblauw,
          ),
        ),
      ),
    );
  }
}

class _ExpenseActivityPickerDetails extends StatelessWidget {
  const _ExpenseActivityPickerDetails({
    required this.item,
    required this.summary,
  });

  final ActivityItem item;
  final ExpenseActivitySummary? summary;

  @override
  Widget build(BuildContext context) {
    final time = item.isPiscine
        ? item.horaire
        : item.operation?.dateDebut == null
            ? null
            : DateFormat('HH:mm', 'fr_FR').format(item.operation!.dateDebut!);
    final date = DateFormat('EEE d MMM yyyy', 'fr_FR').format(item.date);
    final details = <Widget>[
      _line(Icons.schedule, '$date${time == null ? '' : ' · $time'}'),
      if (summary?.organizer != null)
        _line(Icons.person_outline, 'Organisateur · ${summary!.organizer}'),
      if (summary?.registeredCount != null || summary?.presentCount != null)
        _line(
          Icons.groups_outlined,
          [
            if (summary?.registeredCount != null)
              '${summary!.registeredCount} inscrits',
            if (summary?.presentCount != null)
              '${summary!.presentCount} présents',
            if (summary?.diverCount != null) '${summary!.diverCount} plongeurs',
          ].join(' · '),
        ),
      if (summary?.expectedRefund != null)
        _line(
          Icons.receipt_long_outlined,
          'Remboursement attendu · '
          '${CurrencyFormatter.format(summary!.expectedRefund!)}'
          '${summary!.siteName == null ? '' : ' · ${summary!.siteName}'}',
          emphasized: true,
        ),
      if (summary?.recordedPayments != null &&
          summary?.registrationExpectedPayments != null)
        _line(
          Icons.payments_outlined,
          'Paiements · ${CurrencyFormatter.format(summary!.recordedPayments!)}'
          ' / ${CurrencyFormatter.format(summary!.registrationExpectedPayments!)} attendus',
        ),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: 1),
        const SizedBox(height: 8),
        ...details.expand((detail) => [detail, const SizedBox(height: 5)]),
      ],
    );
  }

  Widget _line(IconData icon, String text, {bool emphasized = false}) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15, color: AppColors.middenblauw),
          const SizedBox(width: 5),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 12,
                color: emphasized ? AppColors.donkerblauw : Colors.grey[700],
                fontWeight: emphasized ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
        ],
      );
}
