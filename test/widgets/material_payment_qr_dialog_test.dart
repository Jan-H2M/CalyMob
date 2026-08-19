import 'package:calymob/widgets/material_payment_qr_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders the material payment QR on a visible white card', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: MaterialPaymentQrDialog(
            payload:
                'BCD\n002\n1\nSCT\nGEBABEBB\nCALYPSO\nBE71096123456769\nEUR100.00\n\nPRET-2026-0001',
            reference: 'PRET-2026-0001',
            amount: 100,
            canConfirmPayment: true,
          ),
        ),
      ),
    );

    expect(find.byKey(const Key('material-payment-qr-dialog')), findsOneWidget);
    expect(find.byKey(const Key('material-payment-qr-code')), findsOneWidget);
    expect(find.text('Caution · 100.00 EUR'), findsOneWidget);
    expect(find.text('Paiement constaté'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
