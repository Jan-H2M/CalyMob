import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

/// Wraps a message bubble with a WhatsApp-Web-style hover caret.
///
/// On web/desktop: a small chevron (v) appears on the top-right (or top-left
/// for incoming messages) of the bubble when the pointer hovers over it.
/// Clicking the chevron invokes [onTap] (typically the same action as the
/// long-press on mobile).
///
/// On native/mobile: this widget is a pass-through — long-press on the child
/// (wired up elsewhere) remains the canonical gesture.
class MessageHoverCaret extends StatefulWidget {
  /// The message bubble (typically a [GestureDetector] with onLongPress).
  final Widget child;

  /// Called when the user clicks the hover chevron on web.
  final VoidCallback onTap;

  /// True for own messages (align right), false for incoming messages
  /// (align left). Controls which side the chevron appears on.
  final bool alignEnd;

  const MessageHoverCaret({
    super.key,
    required this.child,
    required this.onTap,
    this.alignEnd = true,
  });

  @override
  State<MessageHoverCaret> createState() => _MessageHoverCaretState();
}

class _MessageHoverCaretState extends State<MessageHoverCaret> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    // On native/mobile platforms we skip the hover UX entirely.
    if (!kIsWeb) return widget.child;

    return MouseRegion(
      onEnter: (_) {
        if (!_hover) setState(() => _hover = true);
      },
      onExit: (_) {
        if (_hover) setState(() => _hover = false);
      },
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          widget.child,
          // Hover chevron — fades in on hover.
          Positioned(
            top: 4,
            right: widget.alignEnd ? 4 : null,
            left: widget.alignEnd ? null : 4,
            child: AnimatedOpacity(
              opacity: _hover ? 1.0 : 0.0,
              duration: const Duration(milliseconds: 120),
              curve: Curves.easeOut,
              child: IgnorePointer(
                ignoring: !_hover,
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: widget.onTap,
                    borderRadius: BorderRadius.circular(14),
                    child: Container(
                      padding: const EdgeInsets.all(2),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.45),
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.15),
                            blurRadius: 4,
                            offset: const Offset(0, 1),
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.keyboard_arrow_down,
                        color: Colors.white,
                        size: 18,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
