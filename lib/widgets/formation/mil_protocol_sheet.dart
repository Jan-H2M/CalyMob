import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/mil_protocol_reader.dart';

class MilProtocolSheet extends StatelessWidget {
  final String clubId;
  final String code;
  final bool pool;
  final String? recordKey;
  final Future<MilProtocol?> Function()? loader;

  const MilProtocolSheet({
    super.key,
    required this.clubId,
    required this.code,
    required this.pool,
    this.recordKey,
    this.loader,
  });

  static Future<void> show(
    BuildContext context, {
    required String clubId,
    required String code,
    required bool pool,
    Future<MilProtocol?> Function()? loader,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF112C4C),
      builder: (_) => MilProtocolSheet(
          clubId: clubId, code: code, pool: pool, loader: loader),
    );
  }

  static Future<void> showForKey(
    BuildContext context, {
    required String clubId,
    required String key,
    required String label,
    required bool pool,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF112C4C),
      builder: (_) => MilProtocolSheet(
        clubId: clubId,
        code: label,
        pool: pool,
        recordKey: key,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.88,
        child: FutureBuilder<MilProtocol?>(
          future: loader?.call() ??
              (recordKey == null
                  ? MilProtocolReader().load(clubId, code, pool: pool)
                  : MilProtocolReader().loadByKey(clubId, recordKey!)),
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            final protocol = snapshot.data;
            if (snapshot.hasError || protocol == null) {
              return _content(context, [
                Text(
                  'Protocole $code',
                  style: Theme.of(
                    context,
                  ).textTheme.headlineSmall?.copyWith(color: Colors.white),
                ),
                const SizedBox(height: 16),
                Text(
                  snapshot.hasError
                      ? 'Catalogue MIL indisponible. Réessayez plus tard.'
                      : 'Aucun protocole MIL ne correspond avec certitude à ce code dans le catalogue actuel.',
                  style: const TextStyle(color: Colors.white70),
                ),
              ]);
            }
            return _content(context, [
              Text(
                '${protocol.code ?? protocol.sectionId} · ${pool ? 'Piscine' : 'Milieu naturel'}',
                style: const TextStyle(color: Colors.white70),
              ),
              const SizedBox(height: 8),
              Text(
                protocol.title,
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(color: Colors.white),
              ),
              const SizedBox(height: 12),
              if (MilProtocolReader.usesPreviewSnapshot)
                const Text(
                    'Aperçu local · instantané de la source MIL, pas de publication en production.',
                    style: TextStyle(color: Colors.amberAccent, fontSize: 12)),
              Text(
                'Webapp MIL (copie AMB) ${protocol.sourceVersion ?? ''} · ${protocol.key}',
                style: const TextStyle(color: Colors.white54, fontSize: 12),
              ),
              const SizedBox(height: 20),
              SelectableText(
                protocol.body,
                style: const TextStyle(color: Colors.white, height: 1.5),
              ),
              const SizedBox(height: 20),
              if (protocol.referenceUrls.isNotEmpty) ...[
                const Text('Règles MIL associées',
                    style: TextStyle(
                        color: Colors.white70, fontWeight: FontWeight.bold)),
                ...protocol.referenceUrls.map((url) => TextButton.icon(
                      onPressed: () => _open(url),
                      icon: const Icon(Icons.link),
                      label: Text(Uri.parse(url).fragment),
                    )),
                const SizedBox(height: 12),
              ],
              TextButton.icon(
                onPressed: () => _open(protocol.sourceUrl),
                icon: const Icon(Icons.open_in_new),
                label: const Text('Ouvrir la source dans le MIL'),
              ),
            ]);
          },
        ),
      ),
    );
  }

  Widget _content(BuildContext context, List<Widget> children) =>
      SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: IconButton(
                onPressed: () => Navigator.of(context).pop(),
                tooltip: 'Fermer le protocole',
                icon: const Icon(Icons.close, color: Colors.white),
              ),
            ),
            ...children,
          ],
        ),
      );

  Future<void> _open(String url) async {
    final uri = Uri.tryParse(url);
    if (uri != null && (uri.scheme == 'https' || uri.scheme == 'http')) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}
