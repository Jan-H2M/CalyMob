import 'package:flutter/material.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../utils/permission_helper.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../profile/who_is_who_screen.dart';
import '../training/actions_evaluations_screen.dart';
import 'apnee_dossier_screen.dart';

/// Direct instructor entry point for the existing formation overview.
///
/// The underlying list and student 360° page remain the single source of
/// truth already used by Who's Who → Formation.
class InstructorFormationOverviewScreen extends StatefulWidget {
  final FormationTrackingScope scope;

  const InstructorFormationOverviewScreen({super.key, required this.scope});

  @override
  State<InstructorFormationOverviewScreen> createState() =>
      _InstructorFormationOverviewScreenState();
}

class _InstructorFormationOverviewScreenState
    extends State<InstructorFormationOverviewScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: OceanGradientBackground(
          creatures: CreatureSet.fishAndBubbles,
          child: SafeArea(
            child: Column(
              children: [
                _buildHeader(context),
                const TabBar(
                  labelColor: Colors.white,
                  unselectedLabelColor: Colors.white70,
                  tabs: [
                    Tab(text: 'Élèves'),
                    Tab(text: 'Apnée'),
                    Tab(text: 'Actions en attente'),
                  ],
                ),
                Expanded(
                  child: TabBarView(
                    children: [
                      FormationListView(
                        clubId: FirebaseConfig.defaultClubId,
                        searchQuery: _searchQuery,
                        scope: widget.scope,
                      ),
                      ApneeStudentList(clubId: FirebaseConfig.defaultClubId, search: _searchQuery,
                        poolOnly: widget.scope == FormationTrackingScope.piscineOnly),
                      const ActionsEvaluationsScreen(embedded: true),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 14),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.donkerblauw, AppColors.middenblauw],
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              IconButton(
                tooltip: 'Retour',
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.arrow_back, color: Colors.white),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Avancement des élèves',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 23,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      widget.scope == FormationTrackingScope.piscineOnly
                          ? 'Progression et remarques piscine'
                          : 'Carrière, piscine, théorie et expériences acquises',
                      style: const TextStyle(
                        color: Color(0xD9FFFFFF),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _searchController,
            onChanged: (value) => setState(() => _searchQuery = value),
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.95),
              prefixIcon: const Icon(Icons.search, size: 20),
              hintText: 'Rechercher un élève',
              isDense: true,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(999),
                borderSide: BorderSide.none,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
