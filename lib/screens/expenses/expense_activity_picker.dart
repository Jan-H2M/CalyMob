import 'package:flutter/material.dart';

import '../../config/app_colors.dart';
import '../../models/activity_item.dart';
import '../../utils/search_highlight.dart';
import '../../widgets/agenda_activity.dart';

class ExpenseActivityPicker extends StatefulWidget {
  const ExpenseActivityPicker({
    super.key,
    required this.clubId,
    required this.watchActivities,
    required this.selected,
  });

  final String clubId;
  final Stream<List<ActivityItem>> Function() watchActivities;
  final ActivityItem? selected;

  @override
  State<ExpenseActivityPicker> createState() => _ExpenseActivityPickerState();
}

class _ExpenseActivityPickerState extends State<ExpenseActivityPicker> {
  late final Stream<List<ActivityItem>> _activities = widget.watchActivities();
  String _search = '';

  void _choose(ActivityItem? activity) =>
      Navigator.pop(context, (activity: activity));

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
                        child: Text('Activités indisponibles.'));
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
                        child: Text('Aucune activité trouvée.'));
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
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 16),
                                child: AgendaMonthHeader(month.key),
                              ),
                            ),
                            SliverPadding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 16),
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
