import 'package:flutter/material.dart';
import '../../services/mil_protocol_reader.dart';
import 'mil_protocol_sheet.dart';

String? poolProtocolBrevet(String? target) {
  final code =
      target?.trim().toUpperCase().replaceAll('★', '').replaceAll('*', '');
  if (code == null) return null;
  if (const {'1', '2', '3', '4'}.contains(code)) return 'P$code';
  return const {'P1', 'P2', 'P3', 'P4', 'AM', 'MC', 'MF', 'MN'}.contains(code)
      ? code
      : null;
}

/// Never infer a level from depth, title, section number or an uncoded record.
List<MilProtocol> poolProtocolsForBrevet(
    List<MilProtocol> records, String? target) {
  final brevet = poolProtocolBrevet(target);
  if (brevet == null) return const [];
  return records
      .where(
          (p) => p.medium == 'pool' && p.code?.startsWith('$brevet.') == true)
      .toList()
    ..sort((a, b) => a.code!.compareTo(b.code!));
}

class PoolBrevetProtocols extends StatefulWidget {
  final String clubId;
  final String? target;
  final Future<List<MilProtocol>> Function()? loader;
  final List<Widget> footer;
  const PoolBrevetProtocols(
      {super.key,
      required this.clubId,
      required this.target,
      this.loader,
      this.footer = const []});
  @override
  State<PoolBrevetProtocols> createState() => _PoolBrevetProtocolsState();
}

class _PoolBrevetProtocolsState extends State<PoolBrevetProtocols> {
  late Future<List<MilProtocol>> _data;
  Future<List<MilProtocol>> _load() =>
      widget.loader?.call() ??
      MilProtocolReader().list(widget.clubId, pool: true);
  @override
  void initState() {
    super.initState();
    _data = _load();
  }

  @override
  void didUpdateWidget(covariant PoolBrevetProtocols oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.clubId != widget.clubId ||
        oldWidget.loader != widget.loader) {
      _data = _load();
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<List<MilProtocol>>(
        key: ObjectKey(_data),
        future: _data,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final brevet = poolProtocolBrevet(widget.target);
          final rows =
              poolProtocolsForBrevet(snapshot.data ?? const [], widget.target);
          return ListView(padding: const EdgeInsets.all(12), children: [
            Text('Exercices piscine · ${brevet ?? 'brevet non renseigné'}',
                style: const TextStyle(
                    color: Colors.white, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            if (snapshot.hasError) ...[
              const Text('Catalogue MIL indisponible. Réessayez.',
                  style: TextStyle(color: Colors.amberAccent)),
              TextButton(
                  onPressed: () => setState(() => _data = _load()),
                  child: const Text('Réessayer')),
            ] else if (rows.isEmpty)
              const Text(
                  'Aucun protocole piscine associé avec certitude à ce brevet dans le catalogue disponible.',
                  style: TextStyle(color: Colors.white70))
            else
              ...rows.map((p) => Card(
                    color: const Color(0xCC173853),
                    margin: const EdgeInsets.symmetric(vertical: 3),
                    child: ListTile(
                      dense: true,
                      title: Text(p.code!,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w600)),
                      subtitle: Text(p.title,
                          style: const TextStyle(
                              color: Colors.white70, fontSize: 11)),
                      trailing: const Icon(Icons.info_outline,
                          color: Colors.white70, size: 20),
                      onTap: () => MilProtocolSheet.show(context,
                          clubId: widget.clubId,
                          code: p.code!,
                          pool: true,
                          loader: () async => p),
                    ),
                  )),
            if (widget.footer.isNotEmpty) ...[
              const SizedBox(height: 12),
              ...widget.footer
            ],
          ]);
        },
      );
}
