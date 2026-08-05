import 'package:flutter/material.dart';
import '../config/app_colors.dart';
import '../utils/country_codes.dart';

/// Shared read-only location presentation for logbook details and visual QA.
class LogbookLocationCard extends StatelessWidget {
  final String name;
  final String? country;
  final bool isSea;

  const LogbookLocationCard({
    super.key,
    required this.name,
    this.country,
    required this.isSea,
  });

  @override
  Widget build(BuildContext context) {
    final code = normalizeCountryCode(country);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: AppColors.donkerblauw.withValues(alpha: 0.18),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          Icon(
            isSea ? Icons.waves : Icons.terrain,
            color: isSea ? Colors.cyan.shade700 : Colors.green.shade700,
            size: 36,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
                if (code != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      countryDisplayNameForContext(
                        context,
                        code,
                        includeCode: true,
                      ),
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
