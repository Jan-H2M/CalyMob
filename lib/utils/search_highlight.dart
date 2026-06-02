import 'package:flutter/material.dart';

String normalizeSearchText(String value) {
  return value.toLowerCase().split('').map(_foldSearchChar).join();
}

bool textMatchesSearch(String query, Iterable<String> values) {
  final normalizedQuery = normalizeSearchText(query.trim());
  if (normalizedQuery.isEmpty) return true;

  for (final value in values) {
    if (normalizeSearchText(value).contains(normalizedQuery)) return true;
  }
  return false;
}

List<TextSpan> searchHighlightSpans(
  String text,
  String query,
  TextStyle baseStyle,
) {
  final normalizedQuery = normalizeSearchText(query.trim());
  if (normalizedQuery.isEmpty || text.isEmpty) {
    return [TextSpan(text: text, style: baseStyle)];
  }

  final normalizedText = normalizeSearchText(text);
  final spans = <TextSpan>[];
  var cursor = 0;

  while (cursor < text.length) {
    final matchIndex = normalizedText.indexOf(normalizedQuery, cursor);
    if (matchIndex < 0) {
      spans.add(TextSpan(text: text.substring(cursor), style: baseStyle));
      break;
    }

    if (matchIndex > cursor) {
      spans.add(
        TextSpan(text: text.substring(cursor, matchIndex), style: baseStyle),
      );
    }

    final matchEnd = (matchIndex + normalizedQuery.length).clamp(
      matchIndex,
      text.length,
    );
    spans.add(
      TextSpan(
        text: text.substring(matchIndex, matchEnd),
        style: baseStyle.copyWith(
          backgroundColor: const Color(0xFFFFE082),
          color: Colors.black87,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
    cursor = matchEnd;
  }

  return spans;
}

String _foldSearchChar(String char) {
  const accents = {
    'à': 'a',
    'á': 'a',
    'â': 'a',
    'ã': 'a',
    'ä': 'a',
    'å': 'a',
    'ç': 'c',
    'è': 'e',
    'é': 'e',
    'ê': 'e',
    'ë': 'e',
    'ì': 'i',
    'í': 'i',
    'î': 'i',
    'ï': 'i',
    'ñ': 'n',
    'ò': 'o',
    'ó': 'o',
    'ô': 'o',
    'õ': 'o',
    'ö': 'o',
    'ù': 'u',
    'ú': 'u',
    'û': 'u',
    'ü': 'u',
    'ý': 'y',
    'ÿ': 'y',
  };
  return accents[char] ?? char;
}
