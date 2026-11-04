import 'package:calymob/pool_scan/pool_scan.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
      'keeps the actual callable rejection, including the existing session-date explanation',
      () {
    const reason = 'Scan uniquement pour une séance piscine actuelle.';
    expect(
        poolScanErrorMessage(FirebaseFunctionsException(
            code: 'failed-precondition', message: reason)),
        reason);
  });

  test('index failures do not expose a console link or claim success', () {
    final text = poolScanErrorMessage(FirebaseException(
        plugin: 'cloud_firestore',
        code: 'failed-precondition',
        message:
            'The query requires a COLLECTION_ASC index: https://console.firebase.google.com/private'));
    expect(text, contains('index'));
    expect(text, contains('Aucune modification'));
    expect(text, isNot(contains('https://')));
  });

  test('ambiguous callable transport failure asks to check the list', () {
    final text = poolScanErrorMessage(
        FirebaseFunctionsException(code: 'internal', message: 'INTERNAL'));
    expect(text, contains('Vérifiez la liste'));
    expect(text, isNot(contains('INTERNAL')));
  });
}
