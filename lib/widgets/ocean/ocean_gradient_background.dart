import 'dart:math';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'ocean_config.dart';
import 'ocean_creatures.dart';

/// Level 2 ocean background: animated gradient + 1-2 creatures.
/// Much lighter than the full shader (Level 1) — no GPU FragmentProgram.
/// Perfect for navigation screens, lists, and secondary pages.
///
/// Creature options:
///   - [CreatureSet.fish] — 2 fish swimming
///   - [CreatureSet.jellyfish] — 1 jellyfish floating
///   - [CreatureSet.bubbles] — bubbles rising
///   - [CreatureSet.none] — gradient only
///
/// The gradient follows the day/night cycle just like the full ocean.
enum CreatureSet { fish, jellyfish, bubbles, fishAndBubbles, jellyfishAndBubbles, none }

class OceanGradientBackground extends StatefulWidget {
  final Widget child;
  final CreatureSet creatures;
  final double opacity; // overall opacity for the ocean (0..1), so content stays readable
  final double? fixedHour;

  const OceanGradientBackground({
    Key? key,
    required this.child,
    this.creatures = CreatureSet.bubbles,
    this.opacity = 1.0,
    this.fixedHour,
  }) : super(key: key);

  @override
  State<OceanGradientBackground> createState() => _OceanGradientBackgroundState();
}

class _OceanGradientBackgroundState extends State<OceanGradientBackground>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late AnimationController _ctrl;
  double _time = 0;
  final _rng = Random();

  // Creatures (lightweight subset)
  List<OceanFish> _fish = [];
  List<OceanJellyfish> _jellyfish = [];
  List<OceanBubble> _bubbles = [];
  bool _init = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(hours: 1), // runs forever
    )..addListener(_tick);
    _ctrl.repeat();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      if (_ctrl.isAnimating) _ctrl.stop();
    } else if (state == AppLifecycleState.resumed) {
      if (!_ctrl.isAnimating) _ctrl.repeat();
    }
  }

  void _tick() {
    setState(() {
      _time += 0.016; // ~60fps
    });
  }

  void _initCreatures(Size size) {
    if (_init) return;
    _init = true;
    final w = size.width;
    final h = size.height;
    final waterY = 0.55; // creatures live below the wave line (~55%)

    final cs = widget.creatures;
    if (cs == CreatureSet.fish || cs == CreatureSet.fishAndBubbles) {
      _fish = List.generate(2, (_) => OceanFish(w, h, waterY, _rng));
    }
    if (cs == CreatureSet.jellyfish || cs == CreatureSet.jellyfishAndBubbles) {
      _jellyfish = [OceanJellyfish(w, h, _rng)];
    }
    if (cs == CreatureSet.bubbles || cs == CreatureSet.fishAndBubbles || cs == CreatureSet.jellyfishAndBubbles) {
      _bubbles = List.generate(8, (_) => OceanBubble(w, h, waterY, _rng));
      for (final b in _bubbles) {
        b.y = h * (waterY + _rng.nextDouble() * (1 - waterY));
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ctrl.dispose();
    super.dispose();
  }

  double _currentHour() {
    if (widget.fixedHour != null) return widget.fixedHour!;
    final now = DateTime.now();
    return now.hour + now.minute / 60.0 + now.second / 3600.0;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (ctx, constraints) {
      final size = Size(constraints.maxWidth, constraints.maxHeight);
      _initCreatures(size);

      final hour = _currentHour();
      final tc = OceanTimeColors.forHour(hour);

      // Fixed bright azure colors matching the v1.2.3 design.
      // The old version always looked bright blue regardless of time.
      // We keep the day/night cycle ONLY for nightFactor (affects creatures).
      const skyTop = Color.fromRGBO(140, 185, 240, 1);   // light pastel blue sky
      const skyBot = Color.fromRGBO(95, 170, 230, 1);    // brighter azure horizon
      const waterSurf = Color.fromRGBO(40, 130, 195, 1); // azure water surface
      const waterDeep = Color.fromRGBO(10, 45, 90, 1);   // deep ocean blue

      return Stack(
        children: [
          // 1) Full-screen gradient: sky at top → water at bottom
          //    The wave painter will overlay the transition zone.
          Opacity(
            opacity: widget.opacity,
            child: Container(
              width: size.width,
              height: size.height,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [skyTop, skyBot, waterSurf, waterDeep],
                  stops: const [0.0, 0.40, 0.60, 1.0],
                ),
              ),
            ),
          ),

          // 2) Smooth white wave surface — one broad flowing curve
          //    like the original v1.2.3 design. White glow fading
          //    into the water below.
          if (widget.opacity > 0.2)
            CustomPaint(
              size: size,
              painter: _WaveSurfacePainter(
                time: _time,
                waveY: size.height * 0.56, // wave at ~56% — like v1.2.3
                opacity: widget.opacity,
              ),
            ),

          // 3) Creatures overlay (below the wave line only)
          if (widget.creatures != CreatureSet.none && widget.opacity > 0.2)
            Opacity(
              opacity: widget.opacity,
              child: CustomPaint(
                size: size,
                painter: _LightCreaturesPainter(
                  time: _time,
                  nightFactor: tc.nightFactor,
                  fish: _fish,
                  jellyfish: _jellyfish,
                  bubbles: _bubbles,
                ),
              ),
            ),

          // 4) Child content on top
          widget.child,
        ],
      );
    });
  }
}

/// Draws a smooth, wide, white wave surface — matching the v1.2.3 design.
///
/// The wave is ONE broad smooth curve (not choppy ripples).
/// It creates a white-to-transparent gradient that fades from the wave
/// line downward into the water, like light refracting through the surface.
class _WaveSurfacePainter extends CustomPainter {
  final double time;
  final double waveY;     // center Y of the wave
  final double opacity;

  _WaveSurfacePainter({
    required this.time,
    required this.waveY,
    required this.opacity,
  });

  /// One broad, smooth wave — a single flowing curve like v1.2.3.
  /// The wave is essentially ONE gentle arc across the screen width,
  /// with the tiniest secondary ripple for organic feel.
  double _wave(double x, double w) {
    final norm = x / w; // 0..1
    // One dominant wide arc — slow, gentle, like a real ocean swell
    return waveY
        + sin(norm * pi * 0.8 + time * 0.06) * 14.0   // one big smooth arc
        + sin(norm * pi * 1.6 + time * 0.10) * 3.0;    // very subtle secondary
  }

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    // --- Prominent white glow band — like v1.2.3's bright water surface ---
    // A wide, bright white-to-transparent gradient band centered on the wave.
    // This is the key visual element that creates the "light hitting water" look.

    final glowPath = Path();
    final glowTop = waveY - 80; // very wide glow
    final glowBot = waveY + 50; // shorter below

    glowPath.moveTo(0, glowTop);
    glowPath.lineTo(w, glowTop);
    glowPath.lineTo(w, glowBot);
    glowPath.lineTo(0, glowBot);
    glowPath.close();

    // Very bright, prominent white glow — the key visual feature
    final glowGradient = ui.Gradient.linear(
      Offset(w / 2, glowTop),
      Offset(w / 2, glowBot),
      [
        Colors.white.withOpacity(0.0 * opacity),   // transparent above
        Colors.white.withOpacity(0.30 * opacity),  // building up
        Colors.white.withOpacity(0.70 * opacity),  // very bright approaching wave
        Colors.white.withOpacity(0.80 * opacity),  // brightest AT the wave line
        Colors.white.withOpacity(0.50 * opacity),  // still bright just below
        Colors.white.withOpacity(0.0 * opacity),   // fades to transparent
      ],
      [0.0, 0.25, 0.55, 0.65, 0.80, 1.0],
    );

    canvas.drawPath(glowPath, Paint()
      ..style = PaintingStyle.fill
      ..shader = glowGradient);

    // --- Main wave line: one smooth bright white curve ---
    final wavePath = Path();
    wavePath.moveTo(0, _wave(0, w));
    for (double x = 0; x < w; x += 3) {
      final xMid = x + 1.5;
      final xEnd = x + 3;
      wavePath.quadraticBezierTo(xMid, _wave(xMid, w), xEnd, _wave(xEnd, w));
    }

    // Wide soft white glow behind the line — very prominent
    canvas.drawPath(wavePath, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 12.0
      ..strokeCap = StrokeCap.round
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8.0)
      ..color = Colors.white.withOpacity(0.50 * opacity));

    // Medium glow ring
    canvas.drawPath(wavePath, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5.0
      ..strokeCap = StrokeCap.round
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3.0)
      ..color = Colors.white.withOpacity(0.55 * opacity));

    // Crisp white wave line on top
    canvas.drawPath(wavePath, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withOpacity(0.75 * opacity));

    // --- Secondary wave line (slightly below, fainter) ---
    final wave2Path = Path();
    final off2 = 12.0;
    wave2Path.moveTo(0, _wave(0, w) + off2);
    for (double x = 0; x < w; x += 3) {
      final xMid = x + 1.5;
      final xEnd = x + 3;
      wave2Path.quadraticBezierTo(
        xMid, _wave(xMid, w) + off2 + sin(xMid * 0.02 + time * 0.3) * 1.5,
        xEnd, _wave(xEnd, w) + off2 + sin(xEnd * 0.02 + time * 0.3) * 1.5,
      );
    }

    canvas.drawPath(wave2Path, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3.0)
      ..color = Colors.white.withOpacity(0.18 * opacity));

    canvas.drawPath(wave2Path, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0
      ..color = Colors.white.withOpacity(0.30 * opacity));

    // --- Third wave line (deeper, very faint — light caustics) ---
    final wave3Path = Path();
    final off3 = 28.0;
    wave3Path.moveTo(0, _wave(0, w) + off3);
    for (double x = 0; x < w; x += 4) {
      final xMid = x + 2;
      final xEnd = x + 4;
      wave3Path.quadraticBezierTo(
        xMid, _wave(xMid, w) + off3 + sin(xMid * 0.025 + time * 0.35) * 2.0,
        xEnd, _wave(xEnd, w) + off3 + sin(xEnd * 0.025 + time * 0.35) * 2.0,
      );
    }

    canvas.drawPath(wave3Path, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3.5)
      ..color = Colors.white.withOpacity(0.10 * opacity));
  }

  @override
  bool shouldRepaint(covariant _WaveSurfacePainter old) => true;
}

/// Lightweight creature painter — only draws the creature subsets passed in
class _LightCreaturesPainter extends CustomPainter {
  final double time;
  final double nightFactor;
  final List<OceanFish> fish;
  final List<OceanJellyfish> jellyfish;
  final List<OceanBubble> bubbles;

  _LightCreaturesPainter({
    required this.time,
    required this.nightFactor,
    required this.fish,
    required this.jellyfish,
    required this.bubbles,
  });

  @override
  void paint(Canvas canvas, Size size) {
    // Update and draw bubbles
    for (final b in bubbles) {
      b.update(time, size.width, size.height);
      b.draw(canvas, time);
    }

    // Update and draw fish
    for (final f in fish) {
      f.update(time, size.width, size.height);
      f.draw(canvas, time, nightFactor);
    }

    // Update and draw jellyfish
    for (final j in jellyfish) {
      j.update(time, size.width, size.height);
      j.draw(canvas, time, nightFactor);
    }
  }

  @override
  bool shouldRepaint(covariant _LightCreaturesPainter old) => true;
}
