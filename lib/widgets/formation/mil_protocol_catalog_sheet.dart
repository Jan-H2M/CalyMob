import 'package:flutter/material.dart';

import '../../services/mil_protocol_reader.dart';
import 'mil_protocol_sheet.dart';

/// Browse source protocols, including MIL sections without an exercise code.
class MilProtocolCatalogSheet extends StatelessWidget {
  final String clubId;
  final bool pool;
  final Future<List<MilProtocol>> Function()? loader;

  const MilProtocolCatalogSheet({
    super.key,
    required this.clubId,
    required this.pool,
    this.loader,
  });

  static Future<void> show(BuildContext context,
      {required String clubId, required bool pool}) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF112C4C),
      builder: (_) => MilProtocolCatalogSheet(clubId: clubId, pool: pool),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.85,
        child: Column(
          children: [
            ListTile(
              title: Text(
                  'Protocoles MIL · ${pool ? 'Piscine' : 'Milieu naturel'}',
                  style: const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.bold)),
              trailing: IconButton(
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close, color: Colors.white),
              ),
            ),
            Expanded(
              child: FutureBuilder<List<MilProtocol>>(
                future: loader?.call() ??
                    MilProtocolReader().list(clubId, pool: pool),
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snapshot.hasError || (snapshot.data?.isEmpty ?? true)) {
                    return const Center(
                      child: Text('Catalogue MIL indisponible.',
                          style: TextStyle(color: Colors.white70)),
                    );
                  }
                  final protocols = snapshot.data!;
                  return ListView.builder(
                    itemCount: protocols.length,
                    itemBuilder: (context, index) {
                      final protocol = protocols[index];
                      return ListTile(
                        title: Text(protocol.code ?? protocol.title,
                            style: const TextStyle(color: Colors.white)),
                        subtitle: protocol.code == null
                            ? Text('Section ${protocol.sectionId}',
                                style: const TextStyle(color: Colors.white70))
                            : Text(protocol.title,
                                style: const TextStyle(color: Colors.white70)),
                        trailing: const Icon(Icons.chevron_right,
                            color: Colors.white70),
                        onTap: () => MilProtocolSheet.showForKey(context,
                            clubId: clubId,
                            key: protocol.key,
                            label: protocol.code ?? protocol.sectionId,
                            pool: pool),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
