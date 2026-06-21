import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/activity_item.dart';
import '../../models/event_search_filters.dart';
import '../../models/member_profile.dart';
import '../../services/activity_service.dart';
import '../../services/event_search_service.dart';
import '../../services/member_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'operation_detail_screen.dart';
import '../piscine/session_detail_screen.dart';

const List<String> _kMonthsFr = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

String _typeLabel(String categorie) {
  switch (categorie) {
    case 'piscine':
      return 'Piscine';
    case 'sortie':
      return 'Sortie';
    default:
      return 'Plongée';
  }
}

/// Apart 'Recherche'-scherm: globale, uitgebreide event-zoekfunctie (D5).
class EventSearchScreen extends StatefulWidget {
  const EventSearchScreen({Key? key}) : super(key: key);

  @override
  State<EventSearchScreen> createState() => _EventSearchScreenState();
}

class _EventSearchScreenState extends State<EventSearchScreen> {
  final String _clubId = FirebaseConfig.defaultClubId;
  final ActivityService _activityService = ActivityService();
  final EventSearchService _searchService = EventSearchService();
  final TextEditingController _searchCtrl = TextEditingController();

  late EventSearchFilters _filters;
  List<ActivityItem> _all = [];
  bool _loading = true;
  Set<String>? _participantOpIds; // null = geen personnes-filter actief
  bool _computingParticipants = false;
  StreamSubscription<List<ActivityItem>>? _sub;

  @override
  void initState() {
    super.initState();
    _filters = EventSearchStore.instance.last;
    _searchCtrl.text = _filters.query;
    _sub = _activityService
        .getAllActivitiesStream(_clubId, includeClosed: true)
        .listen((items) {
      if (!mounted) return;
      setState(() {
        _all = items;
        _loading = false;
      });
    });
    if (_filters.participants.isNotEmpty) {
      _recomputeParticipants();
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  void _persist() => EventSearchStore.instance.last = _filters;

  Future<void> _recomputeParticipants() async {
    final ids = _filters.participants.map((p) => p.id).toList();
    if (ids.isEmpty) {
      setState(() => _participantOpIds = null);
      return;
    }
    setState(() => _computingParticipants = true);
    try {
      final ops = await _searchService.operationIdsForAllMembers(_clubId, ids);
      if (!mounted) return;
      setState(() {
        _participantOpIds = ops;
        _computingParticipants = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _participantOpIds = <String>{};
        _computingParticipants = false;
      });
    }
  }

  bool _samePersons(List<SearchPerson> a, List<SearchPerson> b) {
    if (a.length != b.length) return false;
    final as = a.map((p) => p.id).toSet();
    return as.containsAll(b.map((p) => p.id));
  }

  void _update(EventSearchFilters f) {
    final personsChanged = !_samePersons(_filters.participants, f.participants);
    setState(() => _filters = f);
    _persist();
    if (personsChanged) _recomputeParticipants();
  }

  void _reset() {
    _searchCtrl.clear();
    setState(() {
      _filters = const EventSearchFilters();
      _participantOpIds = null;
    });
    _persist();
  }

  List<ActivityItem> get _results {
    if (_filters.isEmpty) return [];
    var list = _all.where(_filters.matchesLocal).toList();
    if (_filters.participants.isNotEmpty) {
      final ops = _participantOpIds ?? <String>{};
      list = list.where((i) => i.isOperation && ops.contains(i.id)).toList();
    }
    list.sort((a, b) => b.date.compareTo(a.date));
    return list;
  }

  Map<String, List<ActivityItem>> _groupByMonth(List<ActivityItem> items) {
    final grouped = <String, List<ActivityItem>>{};
    for (final item in items) {
      final key = DateFormat('MMMM yyyy', 'fr_FR').format(item.date);
      grouped.putIfAbsent(key, () => []).add(item);
    }
    return grouped;
  }

  void _onTap(ActivityItem item) {
    if (item.isPiscine && item.piscineSession != null) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => SessionDetailScreen(session: item.piscineSession!),
        ),
      );
    } else if (item.isOperation) {
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
    final hasFilters = !_filters.isEmpty;
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Recherche', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          if (hasFilters)
            TextButton(
              onPressed: _reset,
              child: const Text('Réinitialiser',
                  style: TextStyle(color: Colors.white)),
            ),
        ],
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.bubbles,
        child: SafeArea(
          child: Column(
            children: [
              _buildSearchRow(),
              _buildActiveChips(),
              Expanded(child: _buildBody()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSearchRow() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Row(
        children: [
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.95),
                borderRadius: BorderRadius.circular(12),
              ),
              child: TextField(
                controller: _searchCtrl,
                onChanged: (v) => _update(_filters.copyWith(query: v)),
                decoration: const InputDecoration(
                  hintText: 'Nom, lieu…',
                  prefixIcon: Icon(Icons.search),
                  border: InputBorder.none,
                  contentPadding: EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          _buildFiltresButton(),
        ],
      ),
    );
  }

  Widget _buildFiltresButton() {
    final count = _filters.activeCount;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: _openFilterSheet,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(
                children: [
                  const Icon(Icons.tune, size: 20, color: AppColors.donkerblauw),
                  const SizedBox(width: 6),
                  Text('Filtres',
                      style: TextStyle(
                          color: AppColors.donkerblauw,
                          fontWeight: FontWeight.w600,
                          fontSize: 14)),
                ],
              ),
            ),
          ),
        ),
        if (count > 0)
          Positioned(
            top: -5,
            right: -5,
            child: Container(
              padding: const EdgeInsets.all(4),
              constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
              decoration: BoxDecoration(
                color: Colors.red,
                borderRadius: BorderRadius.circular(9),
              ),
              child: Text('$count',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.bold)),
            ),
          ),
      ],
    );
  }

  Widget _buildActiveChips() {
    final chips = <Widget>[];
    void add(String label, VoidCallback onRemove) {
      chips.add(Padding(
        padding: const EdgeInsets.only(right: 7),
        child: InkWell(
          onTap: onRemove,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label,
                    style: const TextStyle(
                        color: AppColors.donkerblauw, fontSize: 12)),
                const SizedBox(width: 5),
                const Icon(Icons.close, size: 14, color: AppColors.donkerblauw),
              ],
            ),
          ),
        ),
      ));
    }

    if (_filters.statut != SearchStatut.tous) {
      add(_filters.statut == SearchStatut.ouvert ? 'Ouverts' : 'Clôturés',
          () => _update(_filters.copyWith(statut: SearchStatut.tous)));
    }
    for (final t in _filters.types) {
      add(_typeLabel(t), () {
        final next = Set<String>.from(_filters.types)..remove(t);
        _update(_filters.copyWith(types: next));
      });
    }
    if (_filters.annee != null) {
      add('${_filters.annee}', () => _update(_filters.copyWith(clearAnnee: true)));
    }
    if (_filters.mois != null) {
      add(_kMonthsFr[_filters.mois! - 1],
          () => _update(_filters.copyWith(clearMois: true)));
    }
    for (final p in _filters.participants) {
      add(p.label, () {
        final next = List<SearchPerson>.from(_filters.participants)..remove(p);
        _update(_filters.copyWith(participants: next));
      });
    }

    if (chips.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: Wrap(runSpacing: 7, children: chips),
    );
  }

  Widget _buildBody() {
    if (_loading && _all.isEmpty) {
      return const Center(
          child: CircularProgressIndicator(color: Colors.white));
    }
    if (_filters.isEmpty) {
      return _buildEmptyPrompt();
    }
    if (_computingParticipants && _filters.participants.isNotEmpty) {
      return const Center(
          child: CircularProgressIndicator(color: Colors.white));
    }
    final results = _results;
    if (results.isEmpty) {
      return _buildNoResults();
    }
    final grouped = _groupByMonth(results);
    final children = <Widget>[
      Padding(
        padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
        child: Text(
          '${results.length} résultat${results.length > 1 ? 's' : ''}',
          style: TextStyle(color: Colors.white.withOpacity(0.9), fontSize: 13),
        ),
      ),
    ];
    for (final entry in grouped.entries) {
      children.add(_buildMonthHeader(entry.key));
      children.addAll(entry.value.map(_buildResultCard));
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 100),
      children: children,
    );
  }

  Widget _buildEmptyPrompt() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.search,
                size: 56, color: Colors.white.withOpacity(0.75)),
            const SizedBox(height: 16),
            const Text('Commencez à chercher ou filtrer',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w500)),
            const SizedBox(height: 8),
            Text(
              'Tapez un nom ou un lieu, ou ouvrez les filtres pour affiner par année, mois, type, statut ou personnes.',
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: Colors.white.withOpacity(0.85), fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNoResults() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.event_busy,
              size: 56, color: Colors.white.withOpacity(0.7)),
          const SizedBox(height: 14),
          Text('Aucun résultat',
              style: TextStyle(
                  color: Colors.white.withOpacity(0.9), fontSize: 16)),
        ],
      ),
    );
  }

  Widget _buildMonthHeader(String monthName) {
    final cap = monthName.isEmpty
        ? monthName
        : monthName[0].toUpperCase() + monthName.substring(1);
    return Container(
      margin: const EdgeInsets.only(top: 14, bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
            colors: [AppColors.donkerblauw, AppColors.middenblauw]),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.calendar_month,
              color: Colors.white.withOpacity(0.9), size: 19),
          const SizedBox(width: 9),
          Text(cap,
              style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.white)),
        ],
      ),
    );
  }

  Widget _buildResultCard(ActivityItem item) {
    final dayNumber = DateFormat('d', 'fr_FR').format(item.date);
    final dayName = DateFormat('EEEE', 'fr_FR').format(item.date);
    IconData icon;
    if (item.categorie == 'piscine') {
      icon = Icons.pool;
    } else if (item.categorie == 'sortie') {
      icon = Icons.directions_boat;
    } else {
      icon = Icons.scuba_diving;
    }
    return GestureDetector(
      onTap: () => _onTap(item),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
            color: Colors.white, borderRadius: BorderRadius.circular(14)),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  width: 64,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: item.isPiscine
                          ? [
                              AppColors.piscineBlauwLight,
                              AppColors.piscineBlauw
                            ]
                          : [AppColors.middenblauw, AppColors.donkerblauw],
                    ),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(dayNumber,
                          style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                              height: 1)),
                      const SizedBox(height: 2),
                      Text(dayName.substring(0, 3).toUpperCase(),
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Colors.white.withOpacity(0.9))),
                    ],
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Row(
                          children: [
                            Icon(icon,
                                size: 18,
                                color: item.isPiscine
                                    ? AppColors.piscineBlauw
                                    : AppColors.middenblauw),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(item.titre,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.bold,
                                      color: AppColors.donkerblauw)),
                            ),
                          ],
                        ),
                        if (item.lieu != null &&
                            item.lieu!.isNotEmpty &&
                            !item.isPiscine) ...[
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              Icon(Icons.location_on,
                                  size: 14, color: Colors.grey[600]),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(item.lieu!,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                        fontSize: 13, color: Colors.grey[700])),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(right: 10),
                  child: Icon(Icons.chevron_right,
                      color: item.isPiscine
                          ? AppColors.piscineBlauw.withOpacity(0.5)
                          : AppColors.middenblauw.withOpacity(0.5)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openFilterSheet() async {
    final result = await showModalBottomSheet<EventSearchFilters>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EventFilterSheet(
        initial: _filters,
        allItems: _all,
        clubId: _clubId,
        searchService: _searchService,
      ),
    );
    if (result != null) _update(result);
  }
}

const List<String> _kMonthAbbr = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
  'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'
];

class _EventFilterSheet extends StatefulWidget {
  final EventSearchFilters initial;
  final List<ActivityItem> allItems;
  final String clubId;
  final EventSearchService searchService;
  const _EventFilterSheet({
    required this.initial,
    required this.allItems,
    required this.clubId,
    required this.searchService,
  });

  @override
  State<_EventFilterSheet> createState() => _EventFilterSheetState();
}

class _EventFilterSheetState extends State<_EventFilterSheet> {
  final MemberService _memberService = MemberService();
  late EventSearchFilters _f;
  Set<String>? _partOpIds;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _f = widget.initial;
    if (_f.participants.isNotEmpty) _fetchPartOps();
  }

  Future<void> _fetchPartOps() async {
    final ids = _f.participants.map((p) => p.id).toList();
    if (ids.isEmpty) {
      setState(() => _partOpIds = null);
      return;
    }
    setState(() => _busy = true);
    try {
      final ops =
          await widget.searchService.operationIdsForAllMembers(widget.clubId, ids);
      if (!mounted) return;
      setState(() {
        _partOpIds = ops;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _partOpIds = <String>{};
        _busy = false;
      });
    }
  }

  int get _count {
    Iterable<ActivityItem> list = widget.allItems.where(_f.matchesLocal);
    if (_f.participants.isNotEmpty) {
      final ops = _partOpIds ?? <String>{};
      list = list.where((i) => i.isOperation && ops.contains(i.id));
    }
    return list.length;
  }

  List<int> get _years {
    final s = <int>{};
    for (final i in widget.allItems) {
      s.add(i.date.year);
    }
    final l = s.toList()..sort((a, b) => b.compareTo(a));
    return l;
  }

  Future<void> _addPerson() async {
    final p = await showDialog<SearchPerson>(
      context: context,
      builder: (_) => _MemberPickerDialog(
        clubId: widget.clubId,
        memberService: _memberService,
      ),
    );
    if (p != null && !_f.participants.any((x) => x.id == p.id)) {
      setState(() => _f = _f.copyWith(
          participants: List<SearchPerson>.from(_f.participants)..add(p)));
      _fetchPartOps();
    }
  }

  void _removePerson(SearchPerson p) {
    setState(() => _f = _f.copyWith(
        participants: List<SearchPerson>.from(_f.participants)
          ..removeWhere((x) => x.id == p.id)));
    _fetchPartOps();
  }

  Widget _chip(String label, bool on, VoidCallback onTap, {IconData? icon}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(right: 7, bottom: 7),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
        decoration: BoxDecoration(
          color: on ? AppColors.middenblauw : const Color(0xFFEEF2F7),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon,
                  size: 15, color: on ? Colors.white : const Color(0xFF41617F)),
              const SizedBox(width: 5),
            ],
            Text(label,
                style: TextStyle(
                    fontSize: 13,
                    color: on ? Colors.white : const Color(0xFF41617F))),
          ],
        ),
      ),
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 6),
        child: Text(text,
            style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Color(0xFF41617F))),
      );

  Widget _statutSegment(String label, SearchStatut value) {
    final on = _f.statut == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _f = _f.copyWith(statut: value)),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            color: on ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            boxShadow: on
                ? [
                    BoxShadow(
                        color: AppColors.donkerblauw.withOpacity(0.12),
                        blurRadius: 3,
                        offset: const Offset(0, 1))
                  ]
                : null,
          ),
          alignment: Alignment.center,
          child: Text(label,
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: on ? FontWeight.w600 : FontWeight.normal,
                  color: on
                      ? AppColors.donkerblauw
                      : const Color(0xFF5B6B7C))),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final maxH = MediaQuery.of(context).size.height * 0.85;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      constraints: BoxConstraints(maxHeight: maxH),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      padding: EdgeInsets.fromLTRB(16, 12, 16, 16 + bottomInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 38,
            height: 4,
            decoration: BoxDecoration(
                color: const Color(0xFFD2D9E2),
                borderRadius: BorderRadius.circular(2)),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Filtres',
                  style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF10324F))),
              GestureDetector(
                onTap: () => setState(() => _f = const EventSearchFilters()),
                child: const Text('Réinitialiser',
                    style: TextStyle(fontSize: 13, color: AppColors.middenblauw)),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label('Statut'),
                  Container(
                    decoration: BoxDecoration(
                        color: const Color(0xFFEEF2F7),
                        borderRadius: BorderRadius.circular(10)),
                    padding: const EdgeInsets.all(3),
                    child: Row(children: [
                      _statutSegment('Tous', SearchStatut.tous),
                      _statutSegment('Ouverts', SearchStatut.ouvert),
                      _statutSegment('Clôturés', SearchStatut.ferme),
                    ]),
                  ),
                  _label('Type'),
                  Wrap(children: [
                    _chip('Plongée', _f.types.contains('plongee'),
                        () => _toggleType('plongee'),
                        icon: Icons.scuba_diving),
                    _chip('Piscine', _f.types.contains('piscine'),
                        () => _toggleType('piscine'), icon: Icons.pool),
                    _chip('Sortie', _f.types.contains('sortie'),
                        () => _toggleType('sortie'),
                        icon: Icons.directions_boat),
                  ]),
                  _label('Année'),
                  Wrap(children: [
                    _chip('Toutes', _f.annee == null,
                        () => setState(() => _f = _f.copyWith(clearAnnee: true))),
                    ..._years.map((y) => _chip('$y', _f.annee == y,
                        () => setState(() => _f = _f.copyWith(annee: y)))),
                  ]),
                  _label('Mois'),
                  Wrap(children: [
                    _chip('Tous', _f.mois == null,
                        () => setState(() => _f = _f.copyWith(clearMois: true))),
                    ...List.generate(
                        12,
                        (i) => _chip(_kMonthAbbr[i], _f.mois == i + 1,
                            () => setState(() => _f = _f.copyWith(mois: i + 1)))),
                  ]),
                  _label('Personnes · présentes ensemble (ET)'),
                  Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      ..._f.participants.map((p) => GestureDetector(
                            onTap: () => _removePerson(p),
                            child: Container(
                              margin: const EdgeInsets.only(right: 7, bottom: 7),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 11, vertical: 7),
                              decoration: BoxDecoration(
                                  color: const Color(0xFFE7F0F9),
                                  borderRadius: BorderRadius.circular(15)),
                              child: Row(mainAxisSize: MainAxisSize.min, children: [
                                const Icon(Icons.person,
                                    size: 14, color: Color(0xFF10406E)),
                                const SizedBox(width: 6),
                                Text(p.label,
                                    style: const TextStyle(
                                        fontSize: 13, color: Color(0xFF10406E))),
                                const SizedBox(width: 5),
                                const Icon(Icons.close,
                                    size: 14, color: Color(0xFF10406E)),
                              ]),
                            ),
                          )),
                      GestureDetector(
                        onTap: _addPerson,
                        child: Container(
                          margin: const EdgeInsets.only(right: 7, bottom: 7),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 11, vertical: 7),
                          decoration: BoxDecoration(
                              border: Border.all(color: const Color(0xFFB9C6D4)),
                              borderRadius: BorderRadius.circular(15)),
                          child: Row(mainAxisSize: MainAxisSize.min, children: const [
                            Icon(Icons.add, size: 14, color: Color(0xFF5B6B7C)),
                            SizedBox(width: 5),
                            Text('Ajouter',
                                style: TextStyle(
                                    fontSize: 13, color: Color(0xFF5B6B7C))),
                          ]),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                ],
              ),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              OutlinedButton(
                onPressed: () => setState(() => _f = const EventSearchFilters()),
                child: const Text('Réinitialiser'),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.middenblauw,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                  ),
                  onPressed: () => Navigator.pop(context, _f),
                  child: Text(_busy
                      ? 'Calcul…'
                      : 'Voir $_count résultat${_count > 1 ? 's' : ''}'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _toggleType(String t) {
    final n = Set<String>.from(_f.types);
    if (n.contains(t)) {
      n.remove(t);
    } else {
      n.add(t);
    }
    setState(() => _f = _f.copyWith(types: n));
  }
}

class _MemberPickerDialog extends StatefulWidget {
  final String clubId;
  final MemberService memberService;
  const _MemberPickerDialog({required this.clubId, required this.memberService});

  @override
  State<_MemberPickerDialog> createState() => _MemberPickerDialogState();
}

class _MemberPickerDialogState extends State<_MemberPickerDialog> {
  final TextEditingController _ctrl = TextEditingController();
  List<MemberProfile> _results = [];
  bool _loading = false;
  Timer? _debounce;

  void _onChanged(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => _search(q));
  }

  Future<void> _search(String q) async {
    if (q.trim().isEmpty) {
      setState(() {
        _results = [];
        _loading = false;
      });
      return;
    }
    setState(() => _loading = true);
    final r = await widget.memberService.searchMembers(widget.clubId, q);
    if (!mounted) return;
    setState(() {
      _results = r;
      _loading = false;
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Ajouter une personne'),
      content: SizedBox(
        width: double.maxFinite,
        height: 360,
        child: Column(
          children: [
            TextField(
              controller: _ctrl,
              autofocus: true,
              onChanged: _onChanged,
              decoration: const InputDecoration(
                hintText: 'Rechercher un membre…',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _results.isEmpty
                      ? Center(
                          child: Text(
                              _ctrl.text.trim().isEmpty
                                  ? 'Tapez un nom'
                                  : 'Aucun membre',
                              style: TextStyle(color: Colors.grey[600])),
                        )
                      : ListView.builder(
                          itemCount: _results.length,
                          itemBuilder: (context, i) {
                            final m = _results[i];
                            final label = '${m.prenom} ${m.nom}'.trim();
                            return ListTile(
                              leading: const Icon(Icons.person_outline),
                              title: Text(label),
                              onTap: () => Navigator.pop(
                                  context, SearchPerson(m.id, label)),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Annuler'),
        ),
      ],
    );
  }
}
