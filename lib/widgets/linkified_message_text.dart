import 'package:flutter/material.dart';
import 'package:flutter_linkify/flutter_linkify.dart';
import 'package:url_launcher/url_launcher.dart';

/// Renders a chat / announcement message body with URLs and email
/// addresses turned into clickable links.
///
/// Tap → opens in the system browser (or mail client for mailto:).
/// Style of the inline link follows [linkColor]; default is a calm blue
/// that contrasts with both light bubbles and the dark/teamcolour ones.
///
/// Use this anywhere we used to render `Text(message.message, ...)` for
/// user-entered chat content (team channels, session chat, announcements,
/// announcement replies).
class LinkifiedMessageText extends StatelessWidget {
  final String text;

  /// Base text style applied to the non-link portions of the message.
  final TextStyle? style;

  /// Colour of the underlined link portion.
  /// Defaults to [Colors.blue]; pass a contrasting colour for own-message
  /// (white-on-blue) bubbles.
  final Color? linkColor;

  /// Maximum lines to render, like [Text.maxLines].
  final int? maxLines;

  /// Overflow handling, like [Text.overflow].
  final TextOverflow? overflow;

  const LinkifiedMessageText({
    super.key,
    required this.text,
    this.style,
    this.linkColor,
    this.maxLines,
    this.overflow,
  });

  Future<void> _open(LinkableElement link) async {
    final uri = Uri.tryParse(link.url);
    if (uri == null) return;
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final effectiveLinkColor = linkColor ?? Colors.blue;
    return Linkify(
      text: text,
      onOpen: _open,
      // UrlLinkifier handles http(s)/www; EmailLinkifier handles foo@bar.tld.
      linkifiers: const [UrlLinkifier(), EmailLinkifier()],
      style: style,
      linkStyle: (style ?? const TextStyle()).copyWith(
        color: effectiveLinkColor,
        decoration: TextDecoration.underline,
        decorationColor: effectiveLinkColor,
      ),
      maxLines: maxLines,
      overflow: overflow ?? TextOverflow.clip,
    );
  }
}
