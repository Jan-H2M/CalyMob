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
    final waterY = 0.30; // water starts higher on gradient-only screens

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

      // Build gradient colors from the same time-of-day tables
      final skyTop = Color.fromRGBO(
        (tc.skyTopR * 255).round(), (tc.skyTopG * 255).round(), (tc.skyTopB * 255).round(), 1);
      final skyBot = Color.fromRGBO(
        (tc.skyBotR * 255).round(), (tc.skyBotG * 255).round(), (tc.skyBotB * 255).round(), 1);
      final waterSurf = Color.fromRGBO(
        (tc.waterSurfR * 255).round(), (tc.waterSurfG * 255).round(), (tc.waterSurfB * 255).round(), 1);
      final waterDeep = Color.fromRGBO(
        (tc.waterDeepR * 255).round(), (tc.waterDeepG * 255).round(), (tc.waterDeepB * 255).round(), 1);

      // Subtle wave animation in gradient stops
      final waveOffset = sin(_time * 0.5) * 0.02;

      return Stack(
        children: [
          // 1) Animated gradient
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
                  stops: [0.0, 0.25 + waveOffset, 0.35, 1.0],
                ),
              ),
            ),
          ),

          // 2) Subtle wave line at water surface
          if (widget.opacity > 0.3)
            CustomPaint(
              size: size,
              painter: _WaveLinePainter(
                time: _time,
                waterY: size.height * 0.30,
                color: waterSurf.withOpacity(0.3 * widget.opacity),
              ),
            ),

          // 3) Creatures overlay
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

/// Draws a subtle animated wave line where sky meets water
class _WaveLinePainter extends CustomPainter {
  final double time;
  final double waterY;
  final Color color;

  _WaveLinePainter({required this.time, required this.waterY, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path();
    path.moveTo(0, waterY);
    for (double x = 0; x <= size.width; x += 4) {
      final y = waterY + sin(x * 0.02 + time * 0.8) * 3 + sin(x * 0.01 + time * 0.5) * 2;
      path.lineTo(x, y);
    }
    canvas.drawPath(path, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..color = color);
  }

  @override
  bool shouldRepaint(covariant _WaveLinePainter old) => true;
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
      b.draw(canvas, time, nightFactor);
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
