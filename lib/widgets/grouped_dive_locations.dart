import 'package:flutter/material.dart';
import '../config/app_colors.dart';
import '../models/dive_location.dart';

/// Value-only category layout, shared by the event wizard and isolated QA.
/// The caller owns loading, filtering and actions; this widget performs no I/O.
class GroupedDiveLocations extends StatelessWidget {
  const GroupedDiveLocations(
      {super.key, required this.locations, required this.itemBuilder});
  final List<DiveLocation> locations;
  final Widget Function(DiveLocation) itemBuilder;

  @override
  Widget build(BuildContext context) {
    final groups = groupDiveLocationsByEnvironment(locations);
    return Column(children: [
      for (final environment in DiveEnvironment.values)
        if (groups[environment]?.isNotEmpty == true) ...[
          Padding(
              padding: const EdgeInsets.only(top: 12, bottom: 6),
              child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text('${environment.icon} ${environment.label}',
                      style: const TextStyle(
                          color: AppColors.donkerblauw,
                          fontWeight: FontWeight.w700,
                          fontSize: 14)))),
          for (final location in groups[environment]!) itemBuilder(location),
        ],
    ]);
  }
}
