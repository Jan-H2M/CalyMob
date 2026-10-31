import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter/services.dart';
import '../../lib/screens/boutique/member_missions_screen.dart';
import '../../lib/services/boutique/member_missions_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const enabled = bool.fromEnvironment('BOUTIQUE_MISSIONS_DEV');
  if (!enabled || Uri.base.host != '127.0.0.1' || Uri.base.port != 7387) {
    throw StateError('Dedicated local Boutique DEV origin required.');
  }
  final loader = FontLoader('Roboto')
    ..addFont(rootBundle.load('dev-fonts/Roboto-Regular.ttf'));
  await loader.load();
  runApp(const MaterialApp(home: _DevHome()));
}

class _DevHome extends StatefulWidget {
  const _DevHome();
  @override
  State<_DevHome> createState() => _DevHomeState();
}

class _DevHomeState extends State<_DevHome> {
  String _identity = 'geoffroy';
  late MemberMissionsService _service;
  @override
  void initState() {
    super.initState();
    _setService();
  }

  void _setService() {
    final identity = _identity;
    _service = MemberMissionsService(transport: (request) async {
      final login = await http.post(Uri.base.resolve('/__dev/login'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'identity': identity}));
      final token = (jsonDecode(login.body) as Map)['token'];
      final result = await http.post(
          Uri.base.resolve('/api/boutique/member-missions'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token'
          },
          body: jsonEncode(request));
      final data = Map<String, dynamic>.from(jsonDecode(result.body) as Map);
      if (result.statusCode != 200)
        throw MemberMissionsException(data['code'] as String? ?? 'failed');
      return data;
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
          body: SafeArea(
              child: Column(children: [
        Container(
            color: Colors.amber.shade100,
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              const Expanded(
                  child: Text(
                      'DEV isolé · Identités fictives\nAucun e-mail ni paiement',
                      style: TextStyle(fontWeight: FontWeight.bold))),
              DropdownButton<String>(
                  value: _identity,
                  items: const [
                    'geoffroy',
                    'jim',
                    'julie',
                    'jan',
                    'pol',
                    'other'
                  ]
                      .map((id) => DropdownMenuItem(
                          value: id,
                          child: Text(id == 'other' ? 'Autre membre DEV' : id)))
                      .toList(),
                  onChanged: (value) {
                    if (value != null)
                      setState(() {
                        _identity = value;
                        _setService();
                      });
                  }),
            ])),
        Expanded(
            child: MemberMissionsScreen(
                key: ValueKey(_identity),
                service: _service,
                onExpense: (_) => showDialog<void>(
                    context: context,
                    builder: (_) => const AlertDialog(
                        title: Text('Note de frais avec ticket'),
                        content: Text(
                            'Dans l’app, ce bouton ouvre la note de frais habituelle. Le lien Boutique est un choix facultatif par note. Aucun remboursement ou envoi n’est effectué dans ce DEV.'))))),
      ])));
}
