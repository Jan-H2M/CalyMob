import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../config/firebase_config.dart';
import '../../utils/authenticated_stream.dart';
import '../payment_communication_copy_button.dart';

/// Always asks the server for the current request. It never reuses the order's
/// historical QR, nor treats a member's transfer declaration as a receipt.
class BoutiqueCurrentPaymentPanel extends StatefulWidget {
  final String orderId;
  final Future<Map<String, dynamic>> Function()? loadPayment;
  final Future<void> Function(Map<String, dynamic>)? sendEmail;
  final Stream<DocumentSnapshot<Map<String, dynamic>>> Function(String orderId)?
      watchOrder;
  final Stream<String?> Function()? authUserIds;
  const BoutiqueCurrentPaymentPanel(
      {super.key,
      required this.orderId,
      this.loadPayment,
      this.sendEmail,
      this.watchOrder,
      this.authUserIds});

  @override
  State<BoutiqueCurrentPaymentPanel> createState() =>
      _BoutiqueCurrentPaymentPanelState();
}

class _BoutiqueCurrentPaymentPanelState
    extends State<BoutiqueCurrentPaymentPanel> {
  late Future<Map<String, dynamic>?> _payment;
  bool _sending = false;
  bool _streamFailed = false;
  int _listenGeneration = 0;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _subscription;
  String? _lastState;
  final _formatter =
      NumberFormat.currency(locale: 'fr_BE', symbol: '€', decimalDigits: 2);

  Future<Map<String, dynamic>> _load() async {
    if (widget.loadPayment != null) return widget.loadPayment!();
    final result = await FirebaseFunctions.instanceFor(region: 'europe-west1')
        .httpsCallable('getBoutiqueOrderPayment')
        .call({
      'clubId': FirebaseConfig.defaultClubId,
      'orderId': widget.orderId
    });
    return Map<String, dynamic>.from(result.data as Map);
  }

  // A stream callback can run between frames. Observe failures immediately,
  // before FutureBuilder attaches in the next frame (CALYMOB-25).
  Future<Map<String, dynamic>?> _loadForDisplay() =>
      _load().then<Map<String, dynamic>?>((data) => data,
          onError: (Object error, StackTrace stack) => null);

  @override
  void initState() {
    super.initState();
    _payment = _loadForDisplay();
    _listen();
  }

  void _listen() {
    final generation = ++_listenGeneration;
    _subscription?.cancel();
    if (widget.loadPayment != null && widget.watchOrder == null) return;
    _subscription = authenticatedStream(
      () =>
          widget.watchOrder?.call(widget.orderId) ??
          FirebaseFirestore.instance
              .collection('clubs')
              .doc(FirebaseConfig.defaultClubId)
              .collection('orders')
              .doc(widget.orderId)
              .snapshots(),
      authUserIds: widget.authUserIds,
    ).listen((snapshot) {
      if (!mounted || generation != _listenGeneration) return;
      final value = snapshot.data();
      if (!snapshot.exists) {
        setState(() => _streamFailed = true);
        return;
      }
      final state =
          '${value?['status']}|${value?['pricing']}|${value?['paymentPlan']}|${value?['payment']}';
      final changed =
          _streamFailed || (_lastState != null && state != _lastState);
      _lastState = state;
      if (changed) {
        setState(() {
          _streamFailed = false;
          _payment = _loadForDisplay();
        });
      }
    }, onError: (Object error) {
      if (!mounted || generation != _listenGeneration) return;
      setState(() => _streamFailed = true);
    });
  }

  @override
  void didUpdateWidget(covariant BoutiqueCurrentPaymentPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.orderId != widget.orderId ||
        oldWidget.watchOrder != widget.watchOrder ||
        oldWidget.authUserIds != widget.authUserIds) {
      _lastState = null;
      _sending = false;
      _streamFailed = false;
      _payment = _loadForDisplay();
      _listen();
    }
  }

  @override
  void dispose() {
    _listenGeneration++;
    _subscription?.cancel();
    super.dispose();
  }

  Future<void> _email(Map<String, dynamic> shown) async {
    if (_sending || _streamFailed) return;
    final startingOrderId = widget.orderId;
    setState(() => _sending = true);
    try {
      // Refresh first: an old dialog must never email a superseded amount.
      final current = await _load();
      if (!mounted || _streamFailed || widget.orderId != startingOrderId) {
        return;
      }
      if (current['requestId'] != shown['requestId'] ||
          current['revision'] != shown['revision'] ||
          current['amount'] != shown['amount'] ||
          current['communication'] != shown['communication']) {
        if (mounted) {
          setState(() => _payment = Future.value(current));
        }
        throw StateError('La demande a changé. Vérifiez le nouveau montant.');
      }
      if (widget.sendEmail != null) {
        await widget.sendEmail!(current);
      } else {
        await FirebaseFunctions.instanceFor(region: 'europe-west1')
            .httpsCallable('sendBoutiqueOrderPaymentEmail')
            .call({
          'clubId': FirebaseConfig.defaultClubId,
          'orderId': widget.orderId,
          'requestId': current['requestId'],
          'revision': current['revision'],
          'amount': current['amount'],
          'communication': current['communication'],
        });
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Demande actuelle envoyée.')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text(
                'Envoi impossible ou demande modifiée. Actualisez et vérifiez le paiement.')));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>?>(
        future: _payment,
        builder: (context, snapshot) {
          if (!_streamFailed &&
              snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (_streamFailed || snapshot.hasError || !snapshot.hasData) {
            return Column(children: [
              const Text(
                  'Paiement actuel indisponible. Aucun ancien QR ne sera affiché.'),
              TextButton(
                  onPressed: () {
                    setState(() {
                      _streamFailed = false;
                      _payment = _loadForDisplay();
                    });
                    _listen();
                  },
                  child: const Text('Réessayer')),
            ]);
          }
          final data = snapshot.data!;
          final amount = (data['amount'] as num?)?.toDouble() ?? 0;
          final request = data['requestId'];
          final epc = data['epcPayload'];
          final canPay = request is String &&
              request.isNotEmpty &&
              amount > 0 &&
              epc is String &&
              epc.split('\n').length >= 11 &&
              epc.split('\n')[7] == 'EUR${amount.toStringAsFixed(2)}' &&
              epc.split('\n')[10] == data['communication'];
          return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Paiement actuel',
                    style:
                        TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                Text(
                    'Total de la commande : ${_formatter.format(data['orderTotal'] ?? 0)}'),
                Text(
                    'Reçu en banque : ${_formatter.format(data['receivedAmount'] ?? 0)}'),
                Text(
                    'Déclaré en cours, non reçu : ${_formatter.format(data['reportedAmount'] ?? 0)}'),
                if (canPay) ...[
                  const SizedBox(height: 12),
                  Text(
                      '${data['kind'] == 'supplement' ? 'Complément uniquement' : 'Montant à payer'} : ${_formatter.format(amount)}',
                      key: const Key('boutique-current-amount'),
                      style: const TextStyle(
                          fontSize: 20, fontWeight: FontWeight.bold)),
                  QrImageView(
                      key: ValueKey(epc),
                      data: epc,
                      size: 220,
                      backgroundColor: Colors.white),
                  Text('Bénéficiaire : ${data['beneficiary']}'),
                  Text('IBAN : ${data['iban']}'),
                  SelectableText(
                      'Communication libre : ${data['communication']}'),
                  PaymentCopyButton(
                      value: data['iban']?.toString() ?? '',
                      label: 'Copier l’IBAN',
                      successMessage: 'IBAN copié.',
                      icon: Icons.account_balance),
                  PaymentCopyButton(
                      value: amount.toStringAsFixed(2),
                      label: 'Copier le montant',
                      successMessage: 'Montant copié.',
                      icon: Icons.euro),
                  PaymentCommunicationCopyButton(
                      communication: data['communication']?.toString() ?? ''),
                  const Text(
                      'Si ce virement a déjà été effectué, ne le faites pas une seconde fois. Attendez sa réception bancaire.'),
                  FilledButton.icon(
                      onPressed: _sending ? null : () => _email(data),
                      icon: const Icon(Icons.email_outlined),
                      label: Text(_sending
                          ? 'Envoi…'
                          : 'Envoyer cette demande par e-mail')),
                ] else
                  Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text(data['fullyPaid'] == true
                          ? 'Paiement complet. Aucun nouveau virement à demander.'
                          : 'Aucun nouveau virement à demander. Attendez la réception bancaire ou contactez le club.')),
                if ((data['refundAmount'] as num? ?? 0) > 0)
                  Text(
                      'À rembourser ou porter en crédit après contrôle : ${_formatter.format(data['refundAmount'])}. Aucun remboursement automatique.'),
                if (data['oldInstructionsObsolete'] == true)
                  Text(
                      'N’utilisez plus les anciens e-mails ou QR.${((data['receivedAmount'] as num? ?? 0) > 0 || (data['reportedAmount'] as num? ?? 0) > 0) ? ' Ne payez pas de nouveau le total de la commande.' : ''}'),
                TextButton(
                    onPressed: () => setState(() => _payment = _load()),
                    child: const Text('Actualiser le paiement')),
              ]);
        },
      );
}
