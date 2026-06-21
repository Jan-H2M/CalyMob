import 'activity_item.dart';

/// Statut-filter voor de Recherche (D8).
enum SearchStatut { tous, ouvert, ferme }

/// Lichte referentie naar een geselecteerde persoon voor de ET-filter (D4/D10).
class SearchPerson {
  final String id;
  final String label;
  const SearchPerson(this.id, this.label);

  @override
  bool operator ==(Object other) =>
      other is SearchPerson && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

/// Onveranderlijke filter-state voor de uitgebreide event-zoekfunctie.
class EventSearchFilters {
  final String query; // texte libre: matcht naam + lieu (D9)
  final SearchStatut statut; // D8
  final Set<String> types; // 'plongee','piscine','sortie' (multi, D12)
  final int? annee; // single (D13)
  final int? mois; // 1-12, single (D13)
  final List<SearchPerson> participants; // ET, enkel operations (D10)

  const EventSearchFilters({
    this.query = '',
    this.statut = SearchStatut.tous,
    this.types = const {},
    this.annee,
    this.mois,
    this.participants = const [],
  });

  bool get isEmpty =>
      query.trim().isEmpty &&
      statut == SearchStatut.tous &&
      types.isEmpty &&
      annee == null &&
      mois == null &&
      participants.isEmpty;

  /// Aantal actieve filters (voor de badge op de Filtres-knop).
  int get activeCount {
    var n = 0;
    if (query.trim().isNotEmpty) n++;
    if (statut != SearchStatut.tous) n++;
    if (types.isNotEmpty) n++;
    if (annee != null) n++;
    if (mois != null) n++;
    if (participants.isNotEmpty) n++;
    return n;
  }

  EventSearchFilters copyWith({
    String? query,
    SearchStatut? statut,
    Set<String>? types,
    int? annee,
    int? mois,
    List<SearchPerson>? participants,
    bool clearAnnee = false,
    bool clearMois = false,
  }) {
    return EventSearchFilters(
      query: query ?? this.query,
      statut: statut ?? this.statut,
      types: types ?? this.types,
      annee: clearAnnee ? null : (annee ?? this.annee),
      mois: clearMois ? null : (mois ?? this.mois),
      participants: participants ?? this.participants,
    );
  }

  /// Lokale match (alles behalve de personnes-filter, die loopt via de service).
  bool matchesLocal(ActivityItem item) {
    final q = query.trim().toLowerCase();
    if (q.isNotEmpty) {
      final hay = '${item.titre} ${item.lieu ?? ''}'.toLowerCase();
      if (!hay.contains(q)) return false;
    }
    // Statut: piscine kent geen ouvert/ferme -> enkel zichtbaar onder "Tous".
    if (statut != SearchStatut.tous) {
      if (item.isPiscine) return false;
      final s = item.operation?.statut;
      if (statut == SearchStatut.ouvert && s != 'ouvert') return false;
      if (statut == SearchStatut.ferme && s != 'ferme') return false;
    }
    if (types.isNotEmpty && !types.contains(item.categorie)) return false;
    if (annee != null && item.date.year != annee) return false;
    if (mois != null && item.date.month != mois) return false;
    return true;
  }
}

/// In-memory geheugen van de laatste zoekopdracht tijdens de app-sessie (D17).
class EventSearchStore {
  EventSearchStore._();
  static final EventSearchStore instance = EventSearchStore._();
  EventSearchFilters last = const EventSearchFilters();
}
