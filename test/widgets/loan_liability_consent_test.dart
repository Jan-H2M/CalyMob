import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/widgets/loan_liability_consent.dart';
import 'package:calymob/models/loan_liability_acceptance.dart';

void main() {
  testWidgets(
      'never prechecks or accepts on mount, displays full versioned wording',
      (t) async {
    var changed = false;
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: LoanLiabilityConsent(
                accepted: false, onChanged: (_) => changed = true))));
    expect(t.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value,
        isFalse);
    expect(changed, isFalse);
    expect(find.text(loanLiabilityTermsText), findsOneWidget);
    expect(find.textContaining(loanLiabilityTermsVersion), findsOneWidget);
    await t.tap(find.byType(CheckboxListTile));
    expect(changed, isTrue);
  });
  testWidgets('disabled consent cannot be changed while sending', (t) async {
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: LoanLiabilityConsent(
                accepted: false,
                enabled: false,
                onChanged: (_) => fail('no change')))));
    expect(t.widget<CheckboxListTile>(find.byType(CheckboxListTile)).onChanged,
        isNull);
  });
}
