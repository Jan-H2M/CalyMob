import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../models/event_card_appearance.dart';

/// Decorative only: never changes tapping, attendance, registration or payment.
class EventCardDecoration extends StatefulWidget {
  final EventCardAppearance appearance;
  final bool fullHeight;
  final bool particlesOnly;
  const EventCardDecoration({
    super.key,
    required this.appearance,
    this.fullHeight = false,
    this.particlesOnly = false,
  });
  @override
  State<EventCardDecoration> createState() => _EventCardDecorationState();
}

class _EventCardDecorationState extends State<EventCardDecoration>
    with SingleTickerProviderStateMixin {
  late final AnimationController _animation =
      AnimationController(vsync: this, duration: const Duration(seconds: 8));
  bool _reduceMotion = false;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (_reduceMotion || !TickerMode.of(context)) {
      _animation.stop();
    } else if (!_animation.isAnimating) {
      _animation.repeat();
    }
  }

  @override
  void dispose() {
    _animation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final appearance = widget.appearance;
    Widget image;
    if (appearance.theme == 'custom' && appearance.image != null) {
      // Decorative GIFs are omitted when the device asks for reduced motion.
      image = _reduceMotion && appearance.image!.isGif
          ? const Icon(Icons.image_outlined, color: Color(0xff64748b), size: 36)
          : Image.network(appearance.image!.url,
              fit: widget.fullHeight ? BoxFit.cover : BoxFit.contain,
              errorBuilder: (_, __, ___) => const Icon(Icons.image_outlined,
                  color: Color(0xff64748b), size: 36));
    } else {
      image = widget.fullHeight
          ? _FullHeightThemeImage(theme: appearance.theme)
          : Image.asset('assets/images/card_themes/${appearance.theme}.png',
              fit: BoxFit.contain);
    }
    final decoration = AnimatedBuilder(
      animation: _animation,
      child: image,
      builder: (context, child) => Stack(fit: StackFit.expand, children: [
        if (appearance.theme != 'custom' &&
            (widget.particlesOnly ||
                !widget.fullHeight ||
                appearance.theme != 'christmas'))
          CustomPaint(
            key: widget.particlesOnly ? const ValueKey('full-card-snow') : null,
            painter: _CardParticles(
                appearance.theme, _reduceMotion ? 0 : _animation.value,
                fullCard: widget.particlesOnly),
          ),
        if (!widget.particlesOnly)
          Padding(
            padding: EdgeInsets.all(widget.fullHeight ? 2 : 3),
            child: Transform.translate(
              offset: Offset(
                  0,
                  _reduceMotion || widget.fullHeight
                      ? 0
                      : math.sin(_animation.value * math.pi * 2) * 2),
              child: child,
            ),
          ),
      ]),
    );
    return ExcludeSemantics(
      child: IgnorePointer(
        child: widget.particlesOnly
            ? decoration
            : SizedBox(
                width: 78,
                height: widget.fullHeight ? 140 : 92,
                child: decoration),
      ),
    );
  }
}

/// The bundled PNGs include wide transparent margins. Frame the character itself,
/// then fit its height to the card instead of shrinking the whole square PNG.
class _FullHeightThemeImage extends StatelessWidget {
  final String theme;
  const _FullHeightThemeImage({required this.theme});
  @override
  Widget build(BuildContext context) {
    final (size, crop) = switch (theme) {
      'christmas' => (
          const Size(1312, 1199),
          const Rect.fromLTRB(247, 90, 1021, 1105)
        ),
      'sinterklaas' => (
          const Size(1278, 1230),
          const Rect.fromLTRB(173, 32, 1095, 1205)
        ),
      _ => (const Size(1254, 1254), const Rect.fromLTRB(250, 80, 985, 1090)),
    };
    return ClipRect(
      child: FittedBox(
        fit: BoxFit.fitHeight,
        child: SizedBox(
          width: crop.width,
          height: crop.height,
          child: ClipRect(
            child: OverflowBox(
              alignment: Alignment.topLeft,
              minWidth: size.width,
              maxWidth: size.width,
              minHeight: size.height,
              maxHeight: size.height,
              child: Transform.translate(
                offset: -crop.topLeft,
                child: Image.asset('assets/images/card_themes/$theme.png',
                    width: size.width, height: size.height, fit: BoxFit.fill),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CardParticles extends CustomPainter {
  final String theme;
  final double progress;
  final bool fullCard;
  _CardParticles(this.theme, this.progress, {this.fullCard = false});
  @override
  void paint(Canvas canvas, Size size) {
    final count = fullCard ? 24 : 7;
    for (var i = 0; i < count; i++) {
      final x = ((i * 29 + 13) % 79) / 79 * size.width;
      final y = ((i / count + progress) % 1) * size.height;
      final paint = Paint()
        ..color = (theme == 'christmas'
                ? const Color(0xff7dd3fc)
                : const Color(0xfff5c443))
            .withValues(alpha: 0.75);
      final r = i.isEven ? 1.5 : 2.3;
      if (theme == 'disco') {
        canvas.drawLine(Offset(x - r * 1.5, y), Offset(x + r * 1.5, y),
            paint..strokeWidth = 1);
        canvas.drawLine(Offset(x, y - r * 1.5), Offset(x, y + r * 1.5), paint);
      } else {
        canvas.drawCircle(Offset(x, y), r, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _CardParticles old) =>
      old.progress != progress ||
      old.theme != theme ||
      old.fullCard != fullCard;
}
