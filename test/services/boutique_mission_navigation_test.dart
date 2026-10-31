import 'package:calymob/utils/boutique_mission_navigation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _Observer extends NavigatorObserver {
  final gate = AuthenticatedNavigationReadiness();
  Route<dynamic>? route;
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    this.route = route;
    gate.observe(route, 'member-a');
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    route = newRoute;
    gate.observe(newRoute, 'member-a');
  }
}

void main() {
  testWidgets(
      'root and unnamed login wait for explicit home replacement, including slow biometric setup',
      (tester) async {
    final nav = GlobalKey<NavigatorState>();
    final observer = _Observer();
    final gate = observer.gate;
    await tester.pumpWidget(MaterialApp(
        navigatorKey: nav,
        navigatorObservers: [observer],
        home: const Text('Login loading member')));
    bool ready({bool loaded = true, bool passwordChange = false}) {
      return boutiqueMissionNavigationReady(
          hasNavigator: nav.currentState != null,
          memberLoaded: loaded,
          passwordChangeRequired: passwordChange,
          loginCompleted: gate.isReadyFor('member-a'));
    }

    expect(ready(loaded: false), isFalse);
    expect(ready(), isFalse);
    nav.currentState!.pushReplacement(MaterialPageRoute<void>(
        builder: (_) => const Text('Unnamed login after logout')));
    await tester.pumpAndSettle();
    expect(observer.route!.settings.name, isNull);
    expect(ready(), isFalse); // member loaded, biometric save still pending
    nav.currentState!.pushReplacement(MaterialPageRoute<void>(
        settings: const RouteSettings(
            name: authenticatedHomeRouteName, arguments: 'member-a'),
        builder: (_) => const Text('Landing')));
    await tester.pumpAndSettle();
    expect(ready(passwordChange: true), isFalse);
    expect(ready(), isTrue);
    nav.currentState!.push(MaterialPageRoute<void>(
        builder: (_) => const Text('An unnamed authenticated page')));
    await tester.pumpAndSettle();
    expect(ready(), isTrue);
    expect(gate.isReadyFor('member-b'), isFalse);
    gate.reset();
    gate.observe(
        MaterialPageRoute<void>(
            settings: const RouteSettings(
                name: authenticatedHomeRouteName, arguments: 'member-a'),
            builder: (_) => const SizedBox()),
        'member-b');
    expect(gate.isReadyFor('member-b'), isFalse);
    gate.reset();
    expect(ready(), isFalse);
    await tester.pumpWidget(const SizedBox());
  });
}
