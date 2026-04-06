import 'dart:math';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'ocean_config.dart';

/// Level 3 ocean accents: tiny decorative animated elements for content screens.
/// Extremely lightweight — no creatures, just subtle ocean vibes.
///
/// Available accents:
///   - [OceanBubbleAccent] — a few floating bubbles (e.g. in a card corner)
///   - [OceanWaveAccent] — small wave line decoration (e.g. section divider)
///   - [OceanShimmerAccent] — subtle caustic shimmer overlay
///   - [OceanTintedContainer] — container with ocean-colored gradient tint

// ============================================================
// BUBBLE ACCENT — 3-5 tiny bubbles floating up in a column
// ============================================================
class OceanBubbleAccent extends StatefulWidget {
  final double width;
  final double height;
  final int bubbleCount;
  final double opacity;

  const OceanBubbleAccent({
    Key? key,
    this.width = 60,
    this.height = 100,
    this.bubbleCount = 4,
    this.opacity = 0.35,
  }) : super(key: key);

  @override
  State<OceanBubbleAccent> createState() => _OceanBubbleAccentState();
}

class _OceanBubbleAccentState extends State<OceanBubbleAccent>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  double _time = 0;
  late List<_MicroBubble> _bubbles;
  final _rng = Random();

  @override
  void initState() {
    super.initState();
    _bubbles = List.generate(widget.bubbleCount, (_) => _MicroBubble(
      x: widget.width * 0.2 + _rng.nextDouble() * widget.width * 0.6,
      y: _rng.nextDouble() * widget.height,
      radius: 2 + _rng.nextDouble() * 3,
      speed: 0.3 + _rng.nextDouble() * 0.5,
      wobblePhase: _rng.nextDouble() * pi * 2,
    ));
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(hours: 1),
    )..addListener(() {
      setState(() { _time += 0.016; });
    });
    _ctrl.repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.width,
      height: widget.height,
      child: CustomPaint(
        painter: _MicroBubblePainter(
          bubbles: _bubbles,
          time: _time,
          opacity: widget.opacity,
          bounds: Size(widget.width, widget.height),
        ),
      ),
    );
  }
}

class _MicroBubble {
  double x, y, radius, speed, wobblePhase;
  _MicroBubble({required this.x, required this.y, required this.radius, required this.speed, required this.wobblePhase});
}

class _MicroBubblePainter extends CustomPainter {
  final List<_MicroBubble> bubbles;
  final double time;
  final double opacity;
  final Size bounds;

  _MicroBubblePainter({required this.bubbles, required this.time, required this.opacity, required this.bounds});

  @override
  void paint(Canvas canvas, Size size) {
    for (final b in bubbles) {
      b.y -= b.speed;
      b.x += sin(time * 0.8 + b.wobblePhase) * 0.3;
      if (b.y < -b.radius * 2) {
        b.y = bounds.height + b.radius;
        b.x = bounds.width * 0.2 + Random().nextDouble() * bounds.width * 0.6;
      }

      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.8
        ..color = Color.fromRGBO(150, 210, 255, opacity);
      canvas.drawCircle(Offset(b.x, b.y), b.radius, paint);

      // Tiny highlight
      final highlight = Paint()
        ..color = Color.fromRGBO(200, 235, 255, opacity * 0.6);
      canvas.drawCircle(Offset(b.x - b.radius * 0.3, b.y - b.radius * 0.3), b.radius * 0.25, highlight);
    }
  }

  @override
  bool shouldRepaint(covariant _MicroBubblePainter old) => true;
}


// ============================================================
// WAVE ACCENT — animated wave line, great as a section divider
// ============================================================
class OceanWaveAccent extends StatefulWidget {
  final double height;
  final Color? color;
  final double opacity;

  const OceanWaveAccent({
    Key? key,
    this.height = 30,
    this.color,
    this.opacity = 0.25,
  }) : super(key: key);

  @override
  State<OceanWaveAccent> createState() => _OceanWaveAccentState();
}

class _OceanWaveAccentState extends State<OceanWaveAccent>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  double _time = 0;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(hours: 1),
    )..addListener(() {
      setState(() { _time += 0.016; });
    });
    _ctrl.repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hour = DateTime.now().hour + DateTime.now().minute / 60.0;
    final tc = OceanTimeColors.forHour(hour);
    final baseColor = widget.color ?? Color.fromRGBO(
      (tc.waterSurfR * 255).round(),
      (tc.waterSurfG * 255).round(),
      (tc.waterSurfB * 255).round(), 1);

    return SizedBox(
      height: widget.height,
      width: double.infinity,
      child: CustomPaint(
        painter: _WaveAccentPainter(
          time: _time,
          color: baseColor.withOpacity(widget.opacity),
        ),
      ),
    );
  }
}

class _WaveAccentPainter extends CustomPainter {
  final double time;
  final Color color;

  _WaveAccentPainter({required this.time, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final midY = size.height / 2;

    // Two overlapping wave lines for organic feel
    for (int w = 0; w < 2; w++) {
      final path = Path();
      final amp = 4.0 + w * 2;
      final freq = 0.015 + w * 0.005;
      final speed = 0.6 + w * 0.3;
      final offset = w * pi * 0.4;

      path.moveTo(0, midY);
      for (double x = 0; x <= size.width; x += 3) {
        final y = midY + sin(x * freq + time * speed + offset) * amp
                       + sin(x * freq * 2.3 + time * speed * 0.7 + offset) * amp * 0.3;
        path.lineTo(x, y);
      }

      canvas.drawPath(path, Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2 - w * 0.3
        ..color = color.withOpacity(color.opacity * (1 - w * 0.3)));
    }
  }

  @override
  bool shouldRepaint(covariant _WaveAccentPainter old) => true;
}


// ============================================================
// SHIMMER ACCENT — subtle caustic light shimmer overlay
// ============================================================
class OceanShimmerAccent extends StatefulWidget {
  final double opacity;

  const OceanShimmerAccent({Key? key, this.opacity = 0.06}) : super(key: key);

  @override
  State<OceanShimmerAccent> createState() => _OceanShimmerAccentState();
}

class _OceanShimmerAccentState extends State<OceanShimmerAccent>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  double _time = 0;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(hours: 1),
    )..addListener(() {
      setState(() { _time += 0.016; });
    });
    _ctrl.repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size.infinite,
      painter: _ShimmerPainter(time: _time, opacity: widget.opacity),
    );
  }
}

class _ShimmerPainter extends CustomPainter {
  final double time;
  final double opacity;

  _ShimmerPainter({required this.time, required this.opacity});

  @override
  void paint(Canvas canvas, Size size) {
    final rng = Random(42); // fixed seed for consistent pattern
    for (int i = 0; i < 8; i++) {
      final cx = rng.nextDouble() * size.width;
      final cy = rng.nextDouble() * size.height;
      final phase = rng.nextDouble() * pi * 2;
      final speed = 0.3 + rng.nextDouble() * 0.4;
      final radius = 30 + rng.nextDouble() * 50;

      final alpha = (sin(time * speed + phase) * 0.5 + 0.5) * opacity;
      if (alpha < 0.005) continue;

      final paint = Paint()
        ..shader = ui.Gradient.radial(
          Offset(cx + sin(time * 0.2 + phase) * 15, cy + cos(time * 0.15 + phase) * 10),
          radius,
          [
            Color.fromRGBO(200, 230, 255, alpha),
            Color.fromRGBO(180, 220, 255, 0),
          ],
        );
      canvas.drawCircle(Offset(cx, cy), radius, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _ShimmerPainter old) => true;
}


// ============================================================
// TINTED CONTAINER — container with ocean-colored gradient tint
// ============================================================
class OceanTintedContainer extends StatelessWidget {
  final Widget child;
  final double opacity;
  final BorderRadius? borderRadius;
  final EdgeInsets? padding;

  const OceanTintedContainer({
    Key? key,
    required this.child,
    this.opacity = 0.08,
    this.borderRadius,
    this.padding,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final hour = DateTime.now().hour + DateTime.now().minute / 60.0;
    final tc = OceanTimeColors.forHour(hour);

    final topColor = Color.fromRGBO(
      (tc.waterSurfR * 255).round(),
      (tc.waterSurfG * 255).round(),
      (tc.waterSurfB * 255).round(), opacity);
    final botColor = Color.fromRGBO(
      (tc.waterDeepR * 255).round(),
      (tc.waterDeepG * 255).round(),
      (tc.waterDeepB * 255).round(), opacity * 0.6);

    return Container(
      padding: padding,
      decoration: BoxDecoration(
        borderRadius: borderRadius ?? BorderRadius.circular(12),
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [topColor, botColor],
        ),
      ),
      child: child,
    );
  }
}
