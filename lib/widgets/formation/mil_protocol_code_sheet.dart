import 'package:flutter/material.dart';

import '../../services/mil_protocol_reader.dart';
import 'mil_protocol_sheet.dart';

/// Looks up a code when the old exercise catalogue does not state its medium.
class MilProtocolCodeSheet extends StatelessWidget {
  final String clubId;
  final String code;
  final Future<List<MilProtocol>> Function()? loader;

  const MilProtocolCodeSheet({
    super.key,
    required this.clubId,
    required this.code,
    this.loader,
  });

  static Future<void> show(BuildContext context,
      {required String clubId, required String code}) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF112C4C),
      builder: (_) => MilProtocolCodeSheet(clubId: clubId, code: code),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.88,
        child: FutureBuilder<List<MilProtocol>>(
          future: loader?.call() ??
              MilProtocolReader().loadCandidates(clubId, code),
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            final candidates = snapshot.data ?? const <MilProtocol>[];
            if (snapshot.hasError) {
              return MilProtocolSheet(
                clubId: clubId,
                code: code,
                pool: false,
                loader: () => Future<MilProtocol?>.error(snapshot.error!),
              );
            }
            if (candidates.isEmpty) {
              return MilProtocolSheet(
                clubId: clubId,
                code: code,
                pool: false,
                loader: () async => null,
              );
            }
            if (candidates.length == 1) {
              final protocol = candidates.single;
              return MilProtocolSheet(
                clubId: clubId,
                code: code,
                pool: protocol.medium == 'pool',
                loader: () async => protocol,
              );
            }
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                ListTile(
                  title: Text('Protocole $code',
                      style: const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.bold)),
                  subtitle: const Text('Choisissez le milieu de l’épreuve.',
                      style: TextStyle(color: Colors.white70)),
                  trailing: IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close, color: Colors.white),
                  ),
                ),
                ...candidates.map((protocol) => ListTile(
                      title: Text(
                          protocol.medium == 'pool'
                              ? 'Piscine'
                              : 'Milieu naturel',
                          style: const TextStyle(color: Colors.white)),
                      subtitle: Text(protocol.title,
                          style: const TextStyle(color: Colors.white70)),
                      trailing: const Icon(Icons.chevron_right,
                          color: Colors.white70),
                      onTap: () => MilProtocolSheet.showForKey(context,
                          clubId: clubId,
                          key: protocol.key,
                          label: code,
                          pool: protocol.medium == 'pool'),
                    )),
              ],
            );
          },
        ),
      ),
    );
  }
}
