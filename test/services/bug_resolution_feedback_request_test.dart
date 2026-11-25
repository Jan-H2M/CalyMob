import 'package:calymob/services/bug_resolution_feedback_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('BugResolutionFeedbackRequest.fromMap', () {
    test('exposes the explanation written for the reporter', () {
      final request = BugResolutionFeedbackRequest.fromMap(<String, dynamic>{
        'status': 'pending',
        'report_title': ' Boutons décalés ',
        'explanation': ' Les boutons sont de nouveau alignés. ',
      });

      expect(request.reportTitle, 'Boutons décalés');
      expect(request.explanation, 'Les boutons sont de nouveau alignés.');
      expect(request.isPending, isTrue);
    });

    test('tolerates requests created before explanations existed', () {
      final request = BugResolutionFeedbackRequest.fromMap(<String, dynamic>{
        'status': 'confirmed',
        'explanation': 42,
      });

      expect(request.reportTitle, isEmpty);
      expect(request.explanation, isEmpty);
      expect(request.isPending, isFalse);
    });
  });
}
