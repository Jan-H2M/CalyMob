import 'dart:math';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import '../utils/solar_time.dart';
import 'ocean/ocean_config.dart';
import 'ocean/ocean_creatures.dart';

/// Animated ocean background with GPU shader + procedural creatures.
/// The Calypso logo follows the sun/moon arc as a celestial body.
/// Automatically pauses when app goes to background to save battery.
class OceanBackground extends StatefulWidget {
  final Widget child;
  final OceanParams? params;
  final double? fixedHour; // null = use device time
  final bool showLogo; // whether to show logo as sun/moon (default: true)

  const OceanBackground({
    Key? key,
    required this.child,
    this.params,
    this.fixedHour,
    this.showLogo = true,
  }) : super(key: key);

  @override
  State<OceanBackground> createState() => _OceanBackgroundState();
}

class _OceanBackgroundState extends State<OceanBackground>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  ui.FragmentProgram? _program;
  late Ticker _ticker;
  double _time = 0;
  bool _shaderReady = false;
  bool _isPaused = false;

  // Logo as sun/moon
  ui.Image? _logoImage;
  bool _logoLoading = false;

  // Creatures
  final _rng = Random();
  List<OceanFish> _fish = [];
  List<OceanJellyfish> _jellyfish = [];
  List<OceanMantaRay> _mantas = [];
  List<OceanBubble> _bubbles = [];
  OceanCoralReef? _coral;
  bool _creaturesInit = false;
  OceanParams _params = OceanParams();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _params = widget.params ?? OceanParams();
    _loadShader();
    if (widget.showLogo) _loadLogo();
    _ticker = createTicker(_onTick)..start();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive ||
        state == AppLifecycleState.hidden) {
      if (!_isPaused && _ticker.isActive) {
        _ticker.stop();
        _isPaused = true;
      }
    } else if (state == AppLifecycleState.resumed) {
      if (_isPaused) {
        _ticker.start();
        _isPaused = false;
      }
    }
  }

  Future<void> _loadShader() async {
    try {
      final program = await ui.FragmentProgram.fromAsset('shaders/ocean.frag');
      if (mounted) {
        setState(() {
          _program = program;
          _shaderReady = true;
        });
      }
    } catch (e) {
      debugPrint('❌ Ocean shader load failed: $e — using gradient fallback');
    }
    if (!_shaderReady) {
      debugPrint('⚠️ Shader NOT ready — fallback gradient active');
    } else {
      debugPrint('✅ Ocean shader loaded successfully');
    }
  }

  /// Load the Calypso logo PNG as a ui.Image for painting on canvas
  Future<void> _loadLogo() async {
    if (_logoLoading) return;
    _logoLoading = true;
    try {
      final data = await rootBundle.load('assets/images/logo-noBackground.png');
      final codec = await ui.instantiateImageCodec(data.buffer.asUint8List());
      final frame = await codec.getNextFrame();
      if (mounted) {
        setState(() {
          _logoImage = frame.image;
        });
      }
    } catch (e) {
      debugPrint('Logo load failed: $e');
    }
  }

  void _onTick(Duration elapsed) {
    if (mounted) {
      setState(() {
        _time = elapsed.inMilliseconds / 1000.0;
      });
    }
  }

  void _initCreatures(Size size) {
    if (_creaturesInit) return;
    _creaturesInit = true;
    final w = size.width;
    final h = size.height;

    _coral = OceanCoralReef(w, h, _rng);
    _fish = List.generate(_params.fishCount, (_) => OceanFish(w, h, 0.44, _rng));
    _jellyfish = List.generate(_params.jellyfishCount, (_) => OceanJellyfish(w, h, _rng));
    _mantas = List.generate(_params.mantaCount, (_) => OceanMantaRay(w, h, _rng));
    _bubbles = List.generate(_params.bubbleCount, (_) => OceanBubble(w, h, 0.44, _rng));
    for (final b in _bubbles) {
      b.y = h * (0.44 + _rng.nextDouble() * 0.56);
    }
  }

  @override
  void didUpdateWidget(OceanBackground old) {
    super.didUpdateWidget(old);
    if (widget.params != null) {
      _params = widget.params!;
      _creaturesInit = false;
    }
    if (widget.showLogo && _logoImage == null && !_logoLoading) {
      _loadLogo();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ticker.dispose();
    super.dispose();
  }

  double _currentHour() {
    // Manuele override (settings slider): toon exact het gekozen tabel-uur.
    if (widget.fixedHour != null) return widget.fixedHour!;
    // Anders: remap de werkelijke lokale tijd naar de tabel zodat zon en maan
    // op- en ondergaan op de echte tijden voor Antwerpen (DST automatisch).
    return SolarTime.currentTableHour();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (ctx, constraints) {
      final size = Size(constraints.maxWidth, constraints.maxHeight);
      _initCreatures(size);

      final hour = _currentHour();
      final tc = OceanTimeColors.forHour(hour);

      return Stack(
        children: [
          // 1) Shader background
          if (_shaderReady)
            CustomPaint(
              size: size,
              painter: _OceanShaderPainter(
                program: _program!,
                time: _time,
                params: _params,
                colors: tc,
              ),
            )
          else
            CustomPaint(
              size: size,
              painter: _OceanFallbackPainter(
                time: _time,
                skyTop: Color.fromRGBO(
                  (tc.skyTopR * 255).round(), (tc.skyTopG * 255).round(),
                  (tc.skyTopB * 255).round(), 1),
                skyBot: Color.fromRGBO(
                  (tc.skyBotR * 255).round(), (tc.skyBotG * 255).round(),
                  (tc.skyBotB * 255).round(), 1),
                waterSurf: Color.fromRGBO(
                  (tc.waterSurfR * 255).round(), (tc.waterSurfG * 255).round(),
                  (tc.waterSurfB * 255).round(), 1),
                waterDeep: Color.fromRGBO(
                  (tc.waterDeepR * 255).round(), (tc.waterDeepG * 255).round(),
                  (tc.waterDeepB * 255).round(), 1),
              ),
            ),

          // 2) Logo as sun/moon — between shader and creatures
          if (widget.showLogo && _logoImage != null && tc.sunIntensity > 0.01)
            CustomPaint(
              size: size,
              painter: _LogoSunMoonPainter(
                logoImage: _logoImage!,
                sunX: tc.sunX,
                sunY: tc.sunY,
                sunIntensity: tc.sunIntensity,
                nightFactor: tc.nightFactor,
                time: _time,
              ),
            ),

          // 3) Creatures overlay
          CustomPaint(
            size: size,
            painter: OceanCreaturesPainter(
              time: _time,
              nightFactor: tc.nightFactor,
              fish: _fish,
              jellyfish: _jellyfish,
              mantas: _mantas,
              bubbles: _bubbles,
              coral: _coral,
            ),
          ),

          // 4) Child content on top
          widget.child,
        ],
      );
    });
  }
}

/// Paints the Calypso logo at the sun/moon position with glow effects
class _LogoSunMoonPainter extends CustomPainter {
  final ui.Image logoImage;
  final double sunX;       // 0..1 horizontal position
  final double sunY;       // 0..1 vertical (0=bottom, 1=top in table)
  final double sunIntensity; // 0..1 brightness
  final double nightFactor;  // 0=day, 1=night
  final double time;

  _LogoSunMoonPainter({
    required this.logoImage,
    required this.sunX,
    required this.sunY,
    required this.sunIntensity,
    required this.nightFactor,
    required this.time,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final W = size.width;
    final H = size.height;

    // Convert normalized coords to pixel coords
    final logoX = sunX * W;
    final logoY = (1.0 - sunY) * H;

    // Determine if we're in night mode
    final isNight = nightFactor > 0.7;
    final isDusk = nightFactor > 0.3 && nightFactor <= 0.7;

    // Logo display size (diameter of the circular area) — constant size
    const logoDisplaySize = 120.0;

    // === GLOW BEHIND LOGO (always perfectly circular) ===
    final glowRadius = logoDisplaySize * (isNight ? 1.4 : 1.8);

    if (isNight) {
      // Moon glow: silvery blue, subtle
      final glowPaint = Paint()
        ..shader = ui.Gradient.radial(
          Offset(logoX, logoY),
          glowRadius,
          [
            Color.fromRGBO(180, 200, 240, 0.25 * sunIntensity),
            Color.fromRGBO(140, 170, 220, 0.12 * sunIntensity),
            Color.fromRGBO(100, 130, 200, 0.0),
          ],
          [0.0, 0.5, 1.0],
        );
      canvas.drawCircle(Offset(logoX, logoY), glowRadius, glowPaint);

      // Secondary softer outer glow
      final outerGlow = Paint()
        ..shader = ui.Gradient.radial(
          Offset(logoX, logoY),
          glowRadius * 1.5,
          [
            Color.fromRGBO(160, 190, 230, 0.08 * sunIntensity),
            Color.fromRGBO(130, 160, 210, 0.0),
          ],
          [0.0, 1.0],
        );
      canvas.drawCircle(Offset(logoX, logoY), glowRadius * 1.5, outerGlow);
    } else if (isDusk) {
      // Dusk/dawn: warm orange transitioning glow
      final duskFactor = (nightFactor - 0.3) / 0.4; // 0..1 within dusk range
      final glowPaint = Paint()
        ..shader = ui.Gradient.radial(
          Offset(logoX, logoY),
          glowRadius,
          [
            Color.fromRGBO(255, 180, 80, 0.3 * sunIntensity * (1 - duskFactor)),
            Color.fromRGBO(255, 140, 60, 0.15 * sunIntensity),
            Color.fromRGBO(200, 100, 50, 0.0),
          ],
          [0.0, 0.5, 1.0],
        );
      canvas.drawCircle(Offset(logoX, logoY), glowRadius, glowPaint);
    } else {
      // Day: warm golden glow
      final glowPaint = Paint()
        ..shader = ui.Gradient.radial(
          Offset(logoX, logoY),
          glowRadius,
          [
            Color.fromRGBO(255, 240, 180, 0.4 * sunIntensity),
            Color.fromRGBO(255, 200, 100, 0.2 * sunIntensity),
            Color.fromRGBO(255, 180, 60, 0.0),
          ],
          [0.0, 0.5, 1.0],
        );
      canvas.drawCircle(Offset(logoX, logoY), glowRadius, glowPaint);

      // Sun rays: subtle pulsing outer glow
      final pulse = 0.9 + 0.1 * sin(time * 1.5);
      final rayGlow = Paint()
        ..shader = ui.Gradient.radial(
          Offset(logoX, logoY),
          glowRadius * 1.8 * pulse,
          [
            Color.fromRGBO(255, 220, 140, 0.12 * sunIntensity),
            Color.fromRGBO(255, 200, 100, 0.0),
          ],
          [0.0, 1.0],
        );
      canvas.drawCircle(Offset(logoX, logoY), glowRadius * 1.8 * pulse, rayGlow);
    }

    // === DRAW LOGO (preserve aspect ratio, fit in circular area) ===
    final srcW = logoImage.width.toDouble();
    final srcH = logoImage.height.toDouble();
    final srcRect = Rect.fromLTWH(0, 0, srcW, srcH);

    // Fit logo inside the display circle while keeping aspect ratio
    final aspect = srcW / srcH;
    double dstW, dstH;
    if (aspect >= 1.0) {
      // Wider than tall — fit width to display size
      dstW = logoDisplaySize;
      dstH = logoDisplaySize / aspect;
    } else {
      // Taller than wide — fit height to display size
      dstH = logoDisplaySize;
      dstW = logoDisplaySize * aspect;
    }
    final dstRect = Rect.fromCenter(
      center: Offset(logoX, logoY),
      width: dstW,
      height: dstH,
    );

    final logoPaint = Paint()..filterQuality = FilterQuality.high;

    if (isNight) {
      // Night tint: silvery-blue color filter to make logo look like a moon
      // We use a color matrix that shifts hue towards blue and increases brightness
      logoPaint.colorFilter = const ColorFilter.matrix(<double>[
        0.6, 0.1, 0.3, 0, 30,   // R: desaturate, add blue tint
        0.1, 0.6, 0.3, 0, 40,   // G: slight blue shift
        0.1, 0.1, 0.8, 0, 60,   // B: keep blue, boost
        0,   0,   0,   1, 0,    // A: unchanged
      ]);
      logoPaint.color = Color.fromRGBO(255, 255, 255, (sunIntensity * 1.2).clamp(0, 1));
    } else if (isDusk) {
      // Dusk: warm orange tint fading
      final duskFactor = (nightFactor - 0.3) / 0.4;
      logoPaint.color = Color.fromRGBO(255, 255, 255, sunIntensity.clamp(0, 1));
      logoPaint.colorFilter = ColorFilter.matrix(<double>[
        1, 0, 0, 0, 20 * (1 - duskFactor),
        0, 1, 0, 0, -10 * duskFactor,
        0, 0, 1, 0, 20 * duskFactor,
        0, 0, 0, 1, 0,
      ]);
    } else {
      // Day: warm subtle glow on logo
      logoPaint.color = Color.fromRGBO(255, 255, 255, sunIntensity.clamp(0, 1));
    }

    canvas.drawImageRect(logoImage, srcRect, dstRect, logoPaint);
  }

  @override
  bool shouldRepaint(covariant _LogoSunMoonPainter old) => true;
}

/// GPU fragment shader painter for the ocean background
class _OceanShaderPainter extends CustomPainter {
  final ui.FragmentProgram program;
  final double time;
  final OceanParams params;
  final OceanTimeColors colors;

  _OceanShaderPainter({
    required this.program,
    required this.time,
    required this.params,
    required this.colors,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final shader = program.fragmentShader();

    int i = 0;
    // u_res (vec2)
    shader.setFloat(i++, size.width);
    shader.setFloat(i++, size.height);
    // u_time
    shader.setFloat(i++, time);
    // u_waveAmp
    shader.setFloat(i++, params.waveAmp);
    // u_waveSpeed
    shader.setFloat(i++, params.waveSpeed);
    // u_caustics
    shader.setFloat(i++, params.caustics);
    // u_rays
    shader.setFloat(i++, params.rays);
    // u_rayCount
    shader.setFloat(i++, params.rayCount);
    // u_skyTop (vec3)
    shader.setFloat(i++, colors.skyTopR);
    shader.setFloat(i++, colors.skyTopG);
    shader.setFloat(i++, colors.skyTopB);
    // u_skyBot (vec3)
    shader.setFloat(i++, colors.skyBotR);
    shader.setFloat(i++, colors.skyBotG);
    shader.setFloat(i++, colors.skyBotB);
    // u_waterSurf (vec3)
    shader.setFloat(i++, colors.waterSurfR);
    shader.setFloat(i++, colors.waterSurfG);
    shader.setFloat(i++, colors.waterSurfB);
    // u_waterDeep (vec3)
    shader.setFloat(i++, colors.waterDeepR);
    shader.setFloat(i++, colors.waterDeepG);
    shader.setFloat(i++, colors.waterDeepB);
    // u_sun (vec4)
    shader.setFloat(i++, colors.sunX);
    shader.setFloat(i++, colors.sunY);
    shader.setFloat(i++, colors.sunSize);
    shader.setFloat(i++, colors.sunIntensity);
    // u_nightFactor
    shader.setFloat(i++, colors.nightFactor);

    canvas.drawRect(
      Rect.fromLTWH(0, 0, size.width, size.height),
      Paint()..shader = shader,
    );
  }

  @override
  bool shouldRepaint(covariant _OceanShaderPainter old) => true;
}

/// Fallback painter when GLSL shader is not available (e.g. Flutter web).
/// Draws sky gradient + water gradient with a sharp, smooth wave line.
class _OceanFallbackPainter extends CustomPainter {
  final double time;
  final Color skyTop;
  final Color skyBot;
  final Color waterSurf;
  final Color waterDeep;

  _OceanFallbackPainter({
    required this.time,
    required this.skyTop,
    required this.skyBot,
    required this.waterSurf,
    required this.waterDeep,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    // Water line at 44% from top (= 56% from bottom)
    final baseY = h * 0.44;

    // Build wave path — one smooth flowing curve
    final wavePath = Path();
    wavePath.moveTo(0, 0);
    wavePath.lineTo(0, baseY + _wave(0, w, time));
    const steps = 80;
    for (int i = 1; i <= steps; i++) {
      final x = w * i / steps;
      final y = baseY + _wave(x, w, time);
      wavePath.lineTo(x, y);
    }
    wavePath.lineTo(w, 0);
    wavePath.close();

    // Sky gradient — fills the wave path (above the wave line)
    final skyPaint = Paint()
      ..shader = ui.Gradient.linear(
        Offset(0, 0),
        Offset(0, baseY),
        [skyTop, skyBot],
      );
    canvas.drawPath(wavePath, skyPaint);

    // Water path — everything below the wave line
    final waterPath = Path();
    waterPath.moveTo(0, baseY + _wave(0, w, time));
    for (int i = 1; i <= steps; i++) {
      final x = w * i / steps;
      final y = baseY + _wave(x, w, time);
      waterPath.lineTo(x, y);
    }
    waterPath.lineTo(w, h);
    waterPath.lineTo(0, h);
    waterPath.close();

    // Water gradient
    final waterPaint = Paint()
      ..shader = ui.Gradient.linear(
        Offset(0, baseY),
        Offset(0, h),
        [waterSurf, waterDeep],
      );
    canvas.drawPath(waterPath, waterPaint);

    // White foam/glow line exactly at the wave surface
    final foamPath = Path();
    foamPath.moveTo(0, baseY + _wave(0, w, time));
    for (int i = 1; i <= steps; i++) {
      final x = w * i / steps;
      final y = baseY + _wave(x, w, time);
      foamPath.lineTo(x, y);
    }
    final foamPaint = Paint()
      ..color = const Color.fromRGBO(255, 255, 255, 0.6)
      ..strokeWidth = 2.0
      ..style = PaintingStyle.stroke
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.5);
    canvas.drawPath(foamPath, foamPaint);
  }

  /// Smooth sine wave — matches the GLSL waveSurface() function
  double _wave(double x, double width, double t) {
    final xNorm = (x / width) * 6.2831; // 0..2π
    final speed = t * 0.4; // slow animation
    return (sin(xNorm * 0.8 + speed * 0.3) * 0.6 +
            sin(xNorm * 1.5 + speed * 0.5 + 1.2) * 0.2) *
        8.0; // 8px amplitude
  }

  @override
  bool shouldRepaint(covariant _OceanFallbackPainter old) => true;
}
