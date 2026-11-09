import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../models/event_card_appearance.dart';

/// Decorative only: never changes tapping, attendance, registration or payment.
class EventCardDecoration extends StatefulWidget {
  final EventCardAppearance appearance;
  const EventCardDecoration({super.key, required this.appearance});
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
              fit: BoxFit.contain,
              errorBuilder: (_, __, ___) => const Icon(Icons.image_outlined,
                  color: Color(0xff64748b), size: 36));
    } else {
      image = Image.asset('assets/images/card_themes/${appearance.theme}.png',
          fit: BoxFit.contain);
    }
    return ExcludeSemantics(
        child: IgnorePointer(
            child: SizedBox(
                width: 78,
                height: 92,
                child: AnimatedBuilder(
                    animation: _animation,
                    child: image,
                    builder: (context, child) =>
                        Stack(fit: StackFit.expand, children: [
                          if (appearance.theme != 'custom')
                            CustomPaint(
                                painter: _CardParticles(appearance.theme,
                                    _reduceMotion ? 0 : _animation.value)),
                          Padding(
                              padding: const EdgeInsets.all(3),
                              child: Transform.translate(
                                  offset: Offset(
                                      0,
                                      _reduceMotion
                                          ? 0
                                          : math.sin(_animation.value *
                                                  math.pi *
                                                  2) *
                                              2),
                                  child: child)),
                        ])))));
  }
}

class _CardParticles extends CustomPainter {
  final String theme;
  final double progress;
  _CardParticles(this.theme, this.progress);
  @override
  void paint(Canvas canvas, Size size) {
    for (var i = 0; i < 7; i++) {
      final x = ((i * 29 + 13) % 79) / 79 * size.width;
      final y = ((i / 7 + progress) % 1) * size.height;
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
      old.progress != progress || old.theme != theme;
}
