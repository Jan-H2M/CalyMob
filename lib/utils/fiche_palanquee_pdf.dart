import 'dart:io';
import 'dart:typed_data';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:open_filex/open_filex.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../models/operation.dart';
import '../models/participant_operation.dart';

/// Génère et partage la Fiche de Palanquée (PDF) depuis CalyMob.
///
/// Récupère les niveaux de plongée des membres depuis Firestore,
/// puis génère un PDF paysage avec participants + grilles de palanquées.
class FichePalanqueePdf {
  static const _navy = PdfColor.fromInt(0xFF003366);
  static const _lightBlue = PdfColor.fromInt(0xFFE6F0FA);
  static const _green = PdfColor.fromInt(0xFF16A34A);
  static const _red = PdfColor.fromInt(0xFFDC2626);

  static const int _palRowsBody = 4;
  static const int _palCols = 2;
  static const String _clubName = 'Calypso Diving Club';

  static const List<String> _colHeaders = [
    'Nom Prénom', 'Niv.', 'Fct', 'Gaz', 'H.Imm.', 'H.Sort.', 'Prof.R', 'Paliers', 'Obs.'
  ];
  static const List<double> _colFlex = [3.2, 0.8, 0.8, 0.9, 1.1, 1.1, 1.0, 1.6, 2.5];

  /// Point d'entrée : génère le PDF et ouvre le dialog de partage.
  static Future<void> generateAndShare({
    required BuildContext context,
    required Operation operation,
    required List<ParticipantOperation> participants,
    required String clubId,
  }) async {
    // Récupérer les niveaux de plongée depuis Firestore
    final memberLevels = await _fetchMemberLevels(
      clubId,
      participants.map((p) => p.membreId).where((id) => id.isNotEmpty).toList(),
    );

    // Préparer les données
    final sortedParticipants = List<ParticipantOperation>.from(participants)
      ..sort((a, b) => (a.membreNom ?? '').compareTo(b.membreNom ?? ''));

    final eventDate = operation.dateDebut != null
        ? '${operation.dateDebut!.day.toString().padLeft(2, '0')}/${operation.dateDebut!.month.toString().padLeft(2, '0')}/${operation.dateDebut!.year}'
        : '___/___/______';

    // Nombre de palanquées
    final minNeeded = (sortedParticipants.length / 4).ceil().clamp(1, 100);
    final rawTotal = (minNeeded + (minNeeded <= 2 ? 3 : 2)).clamp(4, 100);
    final totalPalanquees = rawTotal.isOdd ? rawTotal + 1 : rawTotal;

    // Créer le PDF
    final pdf = pw.Document(
      theme: pw.ThemeData.withFont(
        base: pw.Font.helvetica(),
        bold: pw.Font.helveticaBold(),
        italic: pw.Font.helveticaOblique(),
        boldItalic: pw.Font.helveticaBoldOblique(),
      ),
    );

    // === PAGE 1 ===
    // Calculer combien de palanquées on peut mettre sur la page 1
    // On estime : header ~45mm, table participants ~(n*5+15)mm, légende ~30mm
    final tableEstimate = 15.0 + sortedParticipants.length * 5.0;
    final headerAndTableH = 45.0 + tableEstimate + 30.0;
    final availableOnPage1 = 210.0 - 20.0 - headerAndTableH; // A4 landscape height - margins
    final palHeight = 38.0; // ~height per palanquée row (2 side by side)
    final palRowsOnPage1 = (availableOnPage1 / palHeight).floor().clamp(0, 10);
    final palsOnPage1 = (palRowsOnPage1 * _palCols).clamp(0, totalPalanquees);

    pdf.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4.landscape,
        margin: const pw.EdgeInsets.all(20),
        build: (pw.Context ctx) {
          return pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              // Header
              _buildHeader(operation, eventDate, sortedParticipants.length),
              pw.SizedBox(height: 4),
              pw.Divider(color: _navy, thickness: 0.5),
              pw.SizedBox(height: 3),

              // Event info fields
              _buildEventInfo(operation, eventDate, sortedParticipants.length),
              pw.SizedBox(height: 3),
              pw.Divider(color: _navy, thickness: 0.3),
              pw.SizedBox(height: 3),

              // Participants table + Légende side by side
              pw.Row(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Expanded(
                    flex: 5,
                    child: _buildParticipantsTable(sortedParticipants, memberLevels),
                  ),
                  pw.SizedBox(width: 10),
                  pw.Expanded(
                    flex: 4,
                    child: _buildLegendAndSignature(),
                  ),
                ],
              ),

              // Palanquées on page 1 (if space)
              if (palsOnPage1 > 0) ...[
                pw.SizedBox(height: 4),
                pw.Divider(color: _navy, thickness: 0.3),
                pw.SizedBox(height: 2),
                pw.Expanded(
                  child: _buildPalanqueeGrid(1, palsOnPage1, totalPalanquees),
                ),
              ],

              // Footer
              pw.Spacer(),
              _buildFooter(1, palsOnPage1 < totalPalanquees ? 2 : 1),
            ],
          );
        },
      ),
    );

    // === PAGES SUIVANTES (si palanquées restantes) ===
    int palDrawn = palsOnPage1;
    int pageNum = 1;

    while (palDrawn < totalPalanquees) {
      pageNum++;
      final palsThisPage = (totalPalanquees - palDrawn).clamp(0, 8); // max 8 per page

      final startNum = palDrawn + 1;
      final endNum = palDrawn + palsThisPage;
      palDrawn += palsThisPage;

      final totalPages = pageNum; // Will be updated in footer

      pdf.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.a4.landscape,
          margin: const pw.EdgeInsets.all(20),
          build: (pw.Context ctx) {
            return pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                // Mini header
                pw.Row(
                  mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                  children: [
                    pw.Text(
                      'FICHE DE PALANQUÉE — ${operation.titre} — $eventDate',
                      style: pw.TextStyle(
                        font: pw.Font.helveticaBold(),
                        fontSize: 9,
                        color: _navy,
                      ),
                    ),
                    pw.Text(
                      '${sortedParticipants.length} plongeurs inscrits',
                      style: pw.TextStyle(fontSize: 7.5, color: PdfColors.grey600),
                    ),
                  ],
                ),
                pw.SizedBox(height: 3),
                pw.Divider(color: _navy, thickness: 0.3),
                pw.SizedBox(height: 4),

                // Palanquée grid
                pw.Expanded(
                  child: _buildPalanqueeGrid(startNum, palsThisPage, totalPalanquees),
                ),

                // Footer
                pw.Spacer(),
                _buildFooter(pageNum, pageNum),
              ],
            );
          },
        ),
      );
    }

    // Sauvegarder et partager
    final bytes = await pdf.save();
    final safeName = (operation.titre)
        .replaceAll(RegExp(r'[^a-zA-Z0-9À-ÿ\s-]'), '')
        .replaceAll(RegExp(r'\s+'), '_');
    final fileName = 'Fiche_Palanquee_${safeName}_${eventDate.replaceAll('/', '-')}.pdf';

    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/$fileName');
    await file.writeAsBytes(bytes);

    // Ouvrir directement le PDF dans le viewer système
    final result = await OpenFilex.open(file.path);
    if (result.type != ResultType.done) {
      // Fallback: partager via le dialog système si l'ouverture échoue
      final box = context.findRenderObject() as RenderBox?;
      await Share.shareXFiles(
        [XFile(file.path)],
        subject: 'Fiche de Palanquée - ${operation.titre}',
        sharePositionOrigin: box != null
            ? box.localToGlobal(Offset.zero) & box.size
            : null,
      );
    }
  }

  /// Récupère les niveaux de plongée des membres depuis Firestore
  static Future<Map<String, String>> _fetchMemberLevels(
    String clubId,
    List<String> memberIds,
  ) async {
    if (memberIds.isEmpty) return {};

    final levels = <String, String>{};
    // Firestore 'in' queries support max 30 items
    final chunks = <List<String>>[];
    for (var i = 0; i < memberIds.length; i += 30) {
      chunks.add(memberIds.sublist(i, (i + 30).clamp(0, memberIds.length)));
    }

    for (final chunk in chunks) {
      final snapshot = await FirebaseFirestore.instance
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .where(FieldPath.documentId, whereIn: chunk)
          .get();

      for (final doc in snapshot.docs) {
        final data = doc.data();
        final code = data['plongeur_code'] as String?;
        final niveau = data['plongeur_niveau'] as String?;
        levels[doc.id] = _formatDivingLevel(code, niveau);
      }
    }
    return levels;
  }

  /// Formate le niveau de plongée
  static String _formatDivingLevel(String? code, String? niveau) {
    if (code != null && code.isNotEmpty) {
      if (RegExp(r'^\d$').hasMatch(code)) return '$code*';
      return code;
    }
    if (niveau == null || niveau.isEmpty) return '';
    final m = RegExp(r'(\d)\s*\*').firstMatch(niveau);
    if (m != null) return '${m.group(1)}*';
    if (RegExp(r'moniteur\s*club', caseSensitive: false).hasMatch(niveau)) return 'MC';
    if (RegExp(r'aide\s*moniteur', caseSensitive: false).hasMatch(niveau)) return 'AM';
    if (RegExp(r'moniteur\s*f', caseSensitive: false).hasMatch(niveau)) return 'MF';
    return niveau;
  }

  // ---- Build widgets ----

  static pw.Widget _buildHeader(Operation op, String date, int count) {
    return pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      children: [
        pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text(
              'FICHE DE PALANQUÉE',
              style: pw.TextStyle(
                font: pw.Font.helveticaBold(),
                fontSize: 14,
                color: _navy,
              ),
            ),
            pw.SizedBox(height: 1),
            pw.Text(
              _clubName,
              style: pw.TextStyle(fontSize: 9, color: PdfColors.grey600),
            ),
          ],
        ),
      ],
    );
  }

  static pw.Widget _buildEventInfo(Operation op, String date, int count) {
    final lieu = op.lieu ?? op.titre;
    final dp = op.organisateurNom ?? '___________________';

    return pw.Column(
      children: [
        pw.Row(
          children: [
            _infoField('Date:', date),
            pw.SizedBox(width: 20),
            _infoField('Site:', lieu),
            pw.SizedBox(width: 20),
            _infoField('DP:', dp),
            pw.SizedBox(width: 20),
            _infoField('Nb plongeurs:', '$count'),
          ],
        ),
        pw.SizedBox(height: 3),
        pw.Row(
          children: [
            _infoField('Météo:', '_______________'),
            pw.SizedBox(width: 12),
            _infoField('Visibilité:', '___________'),
            pw.SizedBox(width: 12),
            _infoField('Temp. eau:', '______°C'),
            pw.SizedBox(width: 12),
            _infoField('Sécu. surface:', '________________________'),
          ],
        ),
      ],
    );
  }

  static pw.Widget _infoField(String label, String value) {
    return pw.Row(
      mainAxisSize: pw.MainAxisSize.min,
      children: [
        pw.Text(label, style: pw.TextStyle(font: pw.Font.helveticaBold(), fontSize: 8.5)),
        pw.SizedBox(width: 2),
        pw.Text(value, style: const pw.TextStyle(fontSize: 8.5)),
      ],
    );
  }

  static pw.Widget _buildParticipantsTable(
    List<ParticipantOperation> participants,
    Map<String, String> memberLevels,
  ) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Text(
          'PARTICIPANTS INSCRITS',
          style: pw.TextStyle(font: pw.Font.helveticaBold(), fontSize: 9, color: _navy),
        ),
        pw.SizedBox(height: 2),
        pw.TableHelper.fromTextArray(
          border: pw.TableBorder.all(color: PdfColors.grey400, width: 0.5),
          headerDecoration: pw.BoxDecoration(color: _navy),
          headerStyle: pw.TextStyle(
            font: pw.Font.helveticaBold(),
            fontSize: 7.5,
            color: PdfColors.white,
          ),
          cellStyle: const pw.TextStyle(fontSize: 7.5),
          cellPadding: const pw.EdgeInsets.symmetric(horizontal: 2, vertical: 1),
          headerCellDecoration: pw.BoxDecoration(color: _navy),
          headers: ['N°', 'Nom Prénom', 'Niveau', 'Fct', 'Payé'],
          columnWidths: {
            0: const pw.FixedColumnWidth(20),
            1: const pw.FlexColumnWidth(4),
            2: const pw.FixedColumnWidth(30),
            3: const pw.FixedColumnWidth(22),
            4: const pw.FixedColumnWidth(28),
          },
          cellAlignments: {
            0: pw.Alignment.center,
            2: pw.Alignment.center,
            3: pw.Alignment.center,
            4: pw.Alignment.center,
          },
          data: participants.asMap().entries.map((e) {
            final i = e.key;
            final p = e.value;
            final nom = (p.membreNom ?? '').toUpperCase();
            final prenom = p.membrePrenom ?? '';
            final niveau = memberLevels[p.membreId] ?? '';
            final fct = p.isGuest ? 'G' : 'M';

            return [
              '${i + 1}',
              '$nom $prenom',
              niveau.isEmpty ? '-' : niveau,
              fct,
              p.paye ? 'OK' : 'NON',
            ];
          }).toList(),
        ),
      ],
    );
  }

  static pw.Widget _buildLegendAndSignature() {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Text(
          'LÉGENDE',
          style: pw.TextStyle(font: pw.Font.helveticaBold(), fontSize: 7.5, color: _navy),
        ),
        pw.SizedBox(height: 3),
        ...[
          ['Fct:', 'M = Membre, E = Encadrant, CA = Comité'],
          ['Niveau:', '1* à 4*, AM, MC, MF'],
          ['GP:', 'Guide de Palanquée'],
          ['SP:', 'Serre-file'],
        ].map((pair) => pw.Padding(
              padding: const pw.EdgeInsets.only(bottom: 2),
              child: pw.Row(
                children: [
                  pw.Text(pair[0],
                      style: pw.TextStyle(
                          font: pw.Font.helveticaBold(), fontSize: 7, color: PdfColors.grey700)),
                  pw.SizedBox(width: 4),
                  pw.Text(pair[1], style: const pw.TextStyle(fontSize: 7, color: PdfColors.grey700)),
                ],
              ),
            )),
        pw.SizedBox(height: 6),
        pw.Text(
          'Signature DP:',
          style: pw.TextStyle(font: pw.Font.helveticaBold(), fontSize: 7.5, color: _navy),
        ),
        pw.SizedBox(height: 2),
        pw.Container(
          width: 120,
          height: 35,
          decoration: pw.BoxDecoration(
            border: pw.Border.all(color: PdfColors.grey400, width: 0.3),
          ),
        ),
      ],
    );
  }

  static pw.Widget _buildPalanqueeGrid(int startNum, int count, int total) {
    final rows = <pw.Widget>[];
    int num = startNum;
    final end = startNum + count - 1;

    while (num <= end) {
      final leftNum = num;
      final rightNum = num + 1 <= end ? num + 1 : null;

      rows.add(
        pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Expanded(child: _buildSinglePalanquee(leftNum)),
            pw.SizedBox(width: 6),
            pw.Expanded(
              child: rightNum != null
                  ? _buildSinglePalanquee(rightNum)
                  : pw.Container(), // Empty placeholder
            ),
          ],
        ),
      );
      if (num + 2 <= end) rows.add(pw.SizedBox(height: 3));
      num += 2;
    }

    return pw.Column(children: rows);
  }

  static pw.Widget _buildSinglePalanquee(int num) {
    final totalFlex = _colFlex.reduce((a, b) => a + b);

    return pw.Column(
      children: [
        // Title bar (navy background)
        pw.Container(
          width: double.infinity,
          padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 2),
          color: _navy,
          child: pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Text(
                'PALANQUÉE $num',
                style: pw.TextStyle(
                  font: pw.Font.helveticaBold(),
                  fontSize: 8,
                  color: PdfColors.white,
                ),
              ),
              pw.Row(
                children: [
                  pw.Text('Prof: ______m',
                      style: const pw.TextStyle(fontSize: 6.5, color: PdfColors.white)),
                  pw.SizedBox(width: 10),
                  pw.Text('Durée: ______min',
                      style: const pw.TextStyle(fontSize: 6.5, color: PdfColors.white)),
                ],
              ),
            ],
          ),
        ),

        // Header row (light blue)
        pw.Container(
          decoration: pw.BoxDecoration(
            color: _lightBlue,
            border: pw.Border.all(color: _navy, width: 0.2),
          ),
          child: pw.Row(
            children: List.generate(_colHeaders.length, (i) {
              return pw.Expanded(
                flex: (_colFlex[i] * 10).round(),
                child: pw.Container(
                  padding: const pw.EdgeInsets.symmetric(horizontal: 1, vertical: 1),
                  decoration: i > 0
                      ? pw.BoxDecoration(
                          border: pw.Border(left: pw.BorderSide(color: _navy, width: 0.2)),
                        )
                      : null,
                  child: pw.Text(
                    _colHeaders[i],
                    style: pw.TextStyle(
                      font: pw.Font.helveticaBold(),
                      fontSize: 5.5,
                      color: _navy,
                    ),
                  ),
                ),
              );
            }),
          ),
        ),

        // Body rows (4 empty rows)
        ...List.generate(_palRowsBody, (r) {
          return pw.Container(
            decoration: pw.BoxDecoration(
              border: pw.Border.all(color: PdfColors.grey400, width: 0.15),
            ),
            child: pw.Row(
              children: List.generate(_colHeaders.length, (i) {
                return pw.Expanded(
                  flex: (_colFlex[i] * 10).round(),
                  child: pw.Container(
                    height: 14, // Row height for handwriting
                    padding: const pw.EdgeInsets.symmetric(horizontal: 1),
                    decoration: i > 0
                        ? const pw.BoxDecoration(
                            border: pw.Border(
                              left: pw.BorderSide(color: PdfColors.grey400, width: 0.15),
                            ),
                          )
                        : null,
                    alignment: pw.Alignment.centerLeft,
                    child: i == 3 // Gaz column
                        ? pw.Text('Air',
                            style: const pw.TextStyle(fontSize: 6.5, color: PdfColors.grey500))
                        : pw.Container(),
                  ),
                );
              }),
            ),
          );
        }),
      ],
    );
  }

  static pw.Widget _buildFooter(int page, int totalPages) {
    return pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      children: [
        pw.Text(
          'Fiche de Palanquée — $_clubName',
          style: pw.TextStyle(
            font: pw.Font.helveticaOblique(),
            fontSize: 6.5,
            color: PdfColors.grey400,
          ),
        ),
        pw.Text(
          '$page / $totalPages',
          style: const pw.TextStyle(fontSize: 6.5, color: PdfColors.grey400),
        ),
      ],
    );
  }
}
