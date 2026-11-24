import 'package:flutter/material.dart';

/// Presentation only. Old events with no saved appearance keep their original UI.
class EventCardAppearance {
  final String? colorHex;
  final String theme;
  final EventCardImage? image;
  const EventCardAppearance({this.colorHex, this.theme = 'none', this.image});
  static const themes = ['none', 'christmas', 'sinterklaas', 'disco', 'custom'];
  static EventCardAppearance? fromMap(dynamic value) {
    if (value is! Map) return null;
    final rawColor = value['color'];
    final color =
        rawColor is String && RegExp(r'^#[a-fA-F0-9]{6}$').hasMatch(rawColor)
            ? rawColor.toUpperCase()
            : null;
    final image = EventCardImage.fromMap(value['image']);
    var theme =
        themes.contains(value['theme']) ? value['theme'] as String : 'none';
    if (theme == 'custom' && image == null) theme = 'none';
    return EventCardAppearance(colorHex: color, theme: theme, image: image);
  }

  EventCardAppearance forTarget(
      String clubId, String collection, String eventId) {
    if (theme != 'custom' ||
        image?.storagePath.startsWith(
                'clubs/$clubId/$collection/$eventId/attachments/card_') ==
            true) {
      return this;
    }
    return EventCardAppearance(colorHex: colorHex);
  }

  bool get hasArtwork => theme != 'none';
  Color? get accent {
    if (colorHex != null) {
      return Color(0xff000000 | int.parse(colorHex!.substring(1), radix: 16));
    }
    return const {
      'christmas': Color(0xff166534),
      'sinterklaas': Color(0xffb91c1c),
      'disco': Color(0xff7c3aed)
    }[theme];
  }

  Map<String, dynamic> toMap() =>
      {'color': colorHex, 'theme': theme, 'image': image?.toMap()};
}

class EventCardImage {
  final String url, storagePath, contentType, name;
  final int size;
  const EventCardImage(
      {required this.url,
      required this.storagePath,
      required this.contentType,
      required this.name,
      required this.size});
  bool get isGif => contentType == 'image/gif';
  static EventCardImage? fromMap(dynamic value) {
    if (value is! Map ||
        !['image/png', 'image/jpeg', 'image/webp', 'image/gif']
            .contains(value['contentType']) ||
        value['size'] is! int ||
        value['size'] < 1 ||
        value['size'] > 5 * 1024 * 1024 ||
        value['storagePath'] is! String ||
        value['url'] is! String) {
      return null;
    }
    try {
      final uri = Uri.parse(value['url']);
      final match = RegExp(r'^/v0/b/([^/]+)/o/(.+)$').firstMatch(uri.path);
      if (uri.scheme != 'https' ||
          uri.host != 'firebasestorage.googleapis.com' ||
          match == null ||
          !['calycompta.firebasestorage.app', 'calycompta.appspot.com']
              .contains(match.group(1)) ||
          Uri.decodeComponent(match.group(2)!) != value['storagePath'] ||
          !RegExp(r'^clubs/[\w-]+/(operations|piscine_sessions)/[\w-]+/attachments/card_[\w.-]+$')
              .hasMatch(value['storagePath'])) {
        return null;
      }
      return EventCardImage(
          url: value['url'],
          storagePath: value['storagePath'],
          contentType: value['contentType'],
          name: value['name'] is String ? value['name'] : 'Image',
          size: value['size']);
    } catch (_) {
      return null;
    }
  }

  Map<String, dynamic> toMap() => {
        'url': url,
        'storagePath': storagePath,
        'contentType': contentType,
        'name': name,
        'size': size
      };
}
