import 'package:calymob/widgets/event_discussion_tab.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('eventMessageLinkUri', () {
    test('accepts the Google Forms links from MOB-013', () {
      expect(
        eventMessageLinkUri('https://forms.gle/ZYZ8vCwzbLTe3iWr9'),
        Uri.parse('https://forms.gle/ZYZ8vCwzbLTe3iWr9'),
      );
    });

    test('accepts http and email links', () {
      expect(eventMessageLinkUri('http://caly.club'), isNotNull);
      expect(eventMessageLinkUri('mailto:membre@example.org'), isNotNull);
    });

    test('rejects missing, malformed, and unsafe links', () {
      expect(eventMessageLinkUri(null), isNull);
      expect(eventMessageLinkUri('not a link'), isNull);
      expect(eventMessageLinkUri('javascript:alert(1)'), isNull);
    });
  });
}
