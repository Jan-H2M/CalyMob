import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'epc_qr_code.dart';

/// Projects the *current server order document*, never its historical QR.
/// Keep this read-only projection aligned with functions/src/boutique/paymentContext.js.
Map<String, dynamic>? boutiqueCurrentPayment(Map<String, dynamic> order) {
  try {
    if (!['awaiting_payment', 'paid'].contains(order['status'])) return null;
    final payment = Map<String, dynamic>.from(order['payment'] as Map);
    final total = _cents((order['pricing'] as Map)['total']);
    final number = order['orderNumber'] as String;
    if (!RegExp(r'^BTQ-\d{4}-\d{4,}$').hasMatch(number)) return null;
    Map<String, dynamic>? request;
    var received = 0, reported = 0;
    var revision = 'legacy';
    var communication =
        (order['structuredCommunication'] ?? payment['communication'] ?? number)
            as String;
    if (communication != '+++$number+++' && communication != number) {
      return null;
    }
    final rawPlan = order['paymentPlan'];
    if (rawPlan != null) {
      final plan = Map<String, dynamic>.from(rawPlan as Map);
      revision = plan['revision'] as String;
      final rows = (plan['requests'] as List)
          .map((r) => Map<String, dynamic>.from(r as Map))
          .toList();
      if (plan['version'] != 1 ||
          revision.isEmpty ||
          rows.isEmpty ||
          rows.length > 100) {
        return null;
      }
      final ids = <String>{}, bankRefs = <String>{}, references = <String>{};
      var initial = 0, pendingSupplements = 0;
      for (final row in rows) {
        final id = row['id'] as String;
        if (id.isEmpty ||
            !ids.add(id) ||
            !['initial', 'supplement'].contains(row['kind']) ||
            !['pending', 'received', 'cancelled'].contains(row['status']) ||
            _cents(row['amount']) <= 0 ||
            (row['reportedSent'] != null && row['reportedSent'] is! bool)) {
          return null;
        }
        if (row['status'] == 'received') {
          final ref = row['bankRef'];
          if (ref is! String || ref.isEmpty || !bankRefs.add(ref)) return null;
          received += _cents(row['amount']);
        } else if (row['bankRef'] != null && row['bankRef'] != '') {
          return null;
        }
        if (row['status'] != 'cancelled' && row['kind'] == 'initial') initial++;
        if (row['status'] == 'pending' && row['kind'] == 'supplement') {
          pendingSupplements++;
        }
        // V1 requests without a reference retain their already-issued base text.
        final expected = row['kind'] == 'initial'
            ? '+++$number+++'
            : '+++$number-S${sha256.convert(utf8.encode('$number:$id')).toString().substring(0, 24).toUpperCase()}+++';
        if (row['reference'] != null &&
            (row['reference'] != expected || !references.add(expected))) {
          return null;
        }
        if (row['status'] == 'pending' && row['reportedSent'] == true) {
          reported += _cents(row['amount']);
        }
      }
      if (initial != 1 || pendingSupplements > 1) {
        return null;
      }
      for (final row in rows) {
        if (row['status'] == 'pending' && row['kind'] == 'supplement') {
          request = row;
          break;
        }
      }
      request ??= rows
          .where((r) => r['status'] == 'pending' && r['reportedSent'] != true)
          .firstOrNull;
      if (request != null) {
        communication = request['reference'] as String? ?? '+++$number+++';
      }
    } else if (order['status'] == 'awaiting_payment' &&
        payment['status'] == 'pending') {
      request = {'id': 'initial', 'kind': 'initial', 'amount': total / 100};
      if (communication != '+++$number+++' && communication != number) {
        return null;
      }
    } else if (payment['status'] == 'paid' && payment['bankRef'] != null) {
      received = _cents(payment['matchedAmount'] ?? total / 100);
    }
    final amount = request == null ? 0.0 : _cents(request['amount']) / 100;
    final iban = (payment['iban'] as String)
        .replaceAll(RegExp(r'\s'), '')
        .toUpperCase();
    final beneficiary = payment['beneficiary'] as String;
    if ([
      iban,
      beneficiary,
      communication,
    ].any((v) => v.contains('\n') || v.contains('\r'))) {
      return null;
    }
    final epc = request == null
        ? null
        : generateEpcPayload(
            EpcQrCodeData(
              iban: iban,
              beneficiaryName: beneficiary,
              amount: amount,
              description: communication,
            ),
          );
    if (request != null && (epc == null || utf8.encode(epc).length > 331)) {
      return null;
    }
    return {
      'orderNumber': number,
      'orderTotal': total / 100,
      'receivedAmount': received / 100,
      'reportedAmount': reported / 100,
      'amount': amount,
      'requestId': request?['id'],
      'kind': request?['kind'],
      'revision': revision,
      'communication': communication,
      'iban': iban,
      'beneficiary': beneficiary,
      'epcPayload': epc,
      'fullyPaid': request == null && payment['status'] == 'paid',
      'awaitingBankReceipt': request == null && payment['status'] != 'paid',
      'refundAmount': (received > total ? received - total : 0) / 100,
      'oldInstructionsObsolete': rawPlan != null,
      'presentation': payment['presentation'] ?? 'unspecified',
      'emailStatus': payment['email_status'],
    };
  } catch (_) {
    return null;
  }
}

int _cents(dynamic value) {
  if (value is! num ||
      !value.isFinite ||
      value < 0 ||
      value > 999999999.99 ||
      (value * 100 - (value * 100).round()).abs() > 0.000001) {
    throw const FormatException('Invalid payment amount');
  }
  return (value * 100).round();
}
