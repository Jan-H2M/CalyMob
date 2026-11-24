import 'activity_item.dart';
import 'dive_location.dart';
import 'participant_operation.dart';
import 'tariff.dart';
import '../utils/search_highlight.dart';

/// Picker-only operational and financial context for an expense activity.
///
/// This deliberately stays outside [ActivityItem] so the agenda keeps its
/// lightweight query and presentation unchanged.
class ExpenseActivitySummary {
  const ExpenseActivitySummary({
    this.organizer,
    this.registeredCount,
    this.presentCount,
    this.diverCount,
    this.expectedRefund,
    this.recordedPayments,
    this.registrationExpectedPayments,
    this.siteName,
    this.siteTariffLabel,
  });

  final String? organizer;
  final int? registeredCount;
  final int? presentCount;
  final int? diverCount;
  final double? expectedRefund;
  final double? recordedPayments;
  final double? registrationExpectedPayments;
  final String? siteName;
  final String? siteTariffLabel;

  factory ExpenseActivitySummary.forPool(
    ActivityItem item, {
    required int presentCount,
  }) {
    final accueil = item.piscineSession?.accueil
            .map((member) => member.fullName.trim())
            .where((name) => name.isNotEmpty)
            .toSet()
            .toList() ??
        const <String>[];
    return ExpenseActivitySummary(
      organizer: accueil.isEmpty ? null : accueil.join(', '),
      presentCount: presentCount,
    );
  }

  factory ExpenseActivitySummary.forOperation(
    ActivityItem item, {
    required List<ParticipantOperation> registrations,
    required List<DiveLocation> locations,
  }) {
    final operation = item.operation!;
    final active = registrations.where((person) {
      final status = person.registrationStatus.trim().toLowerCase();
      return !const {'canceled', 'cancelled'}.contains(status) &&
          (person.present == true || status == 'confirmed' || status.isEmpty);
    }).toList();
    final hasPresenceData = active.any((person) => person.present != null);
    final divers = active.where((person) {
      final selectedTariff = operation.eventTariffs.cast<Tariff?>().firstWhere(
            (tariff) =>
                tariff?.id == person.tariffId ||
                (person.tariffLabel != null &&
                    tariff?.label == person.tariffLabel),
            orElse: () => null,
          );
      final label = normalizeSearchText(
        (person.tariffLabel ?? selectedTariff?.label ?? '').trim(),
      );
      return label != 'niet duiker' && label != 'non plongeur';
    }).length;

    final site = _findSite(item, locations);
    final tariff =
        operation.categorie == 'sortie' ? null : _singleMemberSiteTariff(site);
    final expected = tariff == null ? null : divers * tariff.price;

    return ExpenseActivitySummary(
      organizer: operation.organisateurNom?.trim().isEmpty ?? true
          ? null
          : operation.organisateurNom!.trim(),
      registeredCount: active.length,
      presentCount: hasPresenceData
          ? active.where((person) => person.present == true).length
          : null,
      diverCount: divers,
      expectedRefund: expected,
      recordedPayments: active.fold<double>(0, _recordedPaymentTotal),
      registrationExpectedPayments: active.fold<double>(
        0,
        (total, person) => total + person.totalPrix,
      ),
      siteName: site?.name,
      siteTariffLabel: tariff?.label,
    );
  }

  static double _recordedPaymentTotal(
    double total,
    ParticipantOperation person,
  ) {
    if (person.isPaymentSettled) {
      return total + (person.amountPaid ?? person.totalPrix);
    }
    return total +
        person.installmentPayments.values
            .where((payment) => payment.status == 'paid')
            .fold<double>(
              0,
              (sum, payment) => sum + (payment.amountPaid ?? payment.amountDue),
            );
  }

  static DiveLocation? _findSite(
    ActivityItem item,
    List<DiveLocation> locations,
  ) {
    final locationId = item.operation?.lieuId;
    if (locationId != null) {
      for (final location in locations) {
        if (location.id == locationId) return location;
      }
    }
    final name = normalizeSearchText(item.lieu ?? '');
    if (name.isEmpty) return null;
    final matches = locations
        .where((location) => normalizeSearchText(location.name) == name)
        .toList();
    return matches.length == 1 ? matches.single : null;
  }

  static Tariff? _singleMemberSiteTariff(DiveLocation? site) {
    final tariffs = (site?.tariffs ?? const [])
        .where(
          (tariff) =>
              tariff.price.isFinite &&
              !tariff.isGuestTariff &&
              !RegExp(
                r'^(encadrant|organisateur)s?$',
                caseSensitive: false,
              ).hasMatch(tariff.category),
        )
        .toList();
    final members = tariffs
        .where((tariff) => tariff.category.toLowerCase() == 'membre')
        .toList();
    final candidates = members.isNotEmpty ? members : tariffs;
    if (candidates.length == 1) return candidates.single;
    final defaults = candidates.where((tariff) => tariff.isDefault).toList();
    return defaults.length == 1 ? defaults.single : null;
  }
}
