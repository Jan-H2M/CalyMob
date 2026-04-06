import 'dart:math';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';

// ============================================================
// FISH — Colorful tropical fish with bezier body, fins, tail
// ============================================================
class FishPalette {
  final Color body, belly, fin, stripe;
  const FishPalette(this.body, this.belly, this.fin, this.stripe);
}

const _fishPalettes = [
  FishPalette(Color(0xFFFFB432), Color(0xFFFFDC78), Color(0xFFFF821E), Color(0xFFFF6400)), // clown
  FishPalette(Color(0xFF50B4FF), Color(0xFFA0DCFF), Color(0xFF288CDC), Color(0xFF0064C8)), // blue tang
  FishPalette(Color(0xFFFF6482), Color(0xFFFFAAB4), Color(0xFFDC3C64), Color(0xFFC82850)), // pink
  FishPalette(Color(0xFF64E6B4), Color(0xFFAAFFDC), Color(0xFF32C88C), Color(0xFF1EAA6E)), // tropical green
  FishPalette(Color(0xFFC896FF), Color(0xFFE6C8FF), Color(0xFFA064E6), Color(0xFF8246D2)), // lavender
  FishPalette(Color(0xFFFFDC50), Color(0xFFFFF096), Color(0xFFE6B41E), Color(0xFFC89600)), // yellow tang
];

class OceanFish {
  double x, y, speed, size, tailPhase, wobble, minY;
  int dir;
  FishPalette palette;
  final Random _rng;

  OceanFish(double canvasW, double canvasH, double waterYFrac, Random rng)
      : _rng = rng,
        dir = rng.nextBool() ? 1 : -1,
        x = 0, y = 0, speed = 0, size = 0,
        tailPhase = 0, wobble = 0, minY = 0,
        palette = _fishPalettes[rng.nextInt(_fishPalettes.length)] {
    x = dir > 0 ? -40.0 : canvasW + 40;
    minY = waterYFrac * canvasH + 20;
    y = minY + rng.nextDouble() * (canvasH - minY) * 0.85;
    speed = 0.8 + rng.nextDouble() * 1.2;
    size = 12 + rng.nextDouble() * 14;
    tailPhase = rng.nextDouble() * pi * 2;
    wobble = rng.nextDouble() * pi * 2;
  }

  void update(double t, double canvasW, double canvasH) {
    x += speed * dir;
    y += sin(t * 0.8 + wobble) * 0.3;
    if (y < minY) y = minY;
    if ((dir > 0 && x > canvasW + 50) || (dir < 0 && x < -50)) {
      dir = _rng.nextBool() ? 1 : -1;
      x = dir > 0 ? -40.0 : canvasW + 40;
      y = minY + _rng.nextDouble() * (canvasH - minY) * 0.8;
      speed = 0.8 + _rng.nextDouble() * 1.2;
      palette = _fishPalettes[_rng.nextInt(_fishPalettes.length)];
    }
  }

  void draw(Canvas canvas, double t, double nightFactor) {
    final s = size;
    final tailSwing = sin(t * 4 + tailPhase) * 0.3;
    final alpha = (0.7 + (nightFactor > 0.5 ? 0.1 : 0)).clamp(0.0, 1.0);

    canvas.save();
    canvas.translate(x, y);
    canvas.scale(dir.toDouble(), 1);

    // Body
    final bodyPaint = Paint()
      ..shader = ui.Gradient.linear(
        Offset(0, -s * 0.4), Offset(0, s * 0.4),
        [palette.body.withOpacity( alpha),
         palette.belly.withOpacity( alpha),
         palette.body.withOpacity( alpha * 0.8)],
        [0.0, 0.6, 1.0],
      );
    final body = Path()
      ..moveTo(s, 0)
      ..cubicTo(s * 0.6, -s * 0.4, -s * 0.2, -s * 0.35, -s * 0.5, -s * 0.1)
      ..cubicTo(-s * 0.6, 0, -s * 0.6, 0, -s * 0.5, s * 0.1)
      ..cubicTo(-s * 0.2, s * 0.35, s * 0.6, s * 0.4, s, 0);
    canvas.drawPath(body, bodyPaint);

    // Stripes
    final stripePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..color = palette.stripe.withOpacity( alpha * 0.4);
    final stripe1 = Path()
      ..moveTo(s * 0.3, -s * 0.32)
      ..quadraticBezierTo(s * 0.25, 0, s * 0.3, s * 0.32);
    canvas.drawPath(stripe1, stripePaint);
    final stripe2 = Path()
      ..moveTo(0, -s * 0.34)
      ..quadraticBezierTo(-s * 0.05, 0, 0, s * 0.34);
    canvas.drawPath(stripe2, stripePaint);

    // Tail
    final tailPaint = Paint()
      ..shader = ui.Gradient.linear(
        Offset(-s * 0.5, 0), Offset(-s * 1.1, 0),
        [palette.fin.withOpacity( alpha),
         palette.fin.withOpacity( alpha * 0.4)],
      );
    final tail = Path()
      ..moveTo(-s * 0.4, 0)
      ..quadraticBezierTo(-s * 0.7 + tailSwing * s, -s * 0.4, -s + tailSwing * s * 1.5, -s * 0.35)
      ..lineTo(-s * 0.5, 0)
      ..lineTo(-s + tailSwing * s * 1.5, s * 0.35)
      ..quadraticBezierTo(-s * 0.7 + tailSwing * s, s * 0.4, -s * 0.4, 0);
    canvas.drawPath(tail, tailPaint);

    // Dorsal fin
    final finPaint = Paint()..color = palette.fin.withOpacity( alpha * 0.7);
    final dorsal = Path()
      ..moveTo(s * 0.2, -s * 0.3)
      ..quadraticBezierTo(0, -s * 0.7 + sin(t * 3) * s * 0.05, -s * 0.25, -s * 0.32)
      ..close();
    canvas.drawPath(dorsal, finPaint);

    // Pectoral fin
    final pectPaint = Paint()..color = palette.fin.withOpacity( alpha * 0.5);
    final pect = Path()
      ..moveTo(s * 0.15, s * 0.1)
      ..quadraticBezierTo(s * 0.05, s * 0.35 + sin(t * 3.5) * s * 0.04, -s * 0.15, s * 0.2)
      ..close();
    canvas.drawPath(pect, pectPaint);

    // Eye
    canvas.drawCircle(Offset(s * 0.55, -s * 0.06), s * 0.1,
      Paint()..color = Colors.white.withOpacity( alpha + 0.1));
    canvas.drawCircle(Offset(s * 0.58, -s * 0.06), s * 0.05,
      Paint()..color = const Color(0xFF14142B).withOpacity( alpha + 0.1));
    canvas.drawCircle(Offset(s * 0.56, -s * 0.08), s * 0.02,
      Paint()..color = Colors.white.withOpacity( 0.6));

    canvas.restore();
  }
}

// ============================================================
// JELLYFISH — Translucent bell with flowing tentacles
// ============================================================
class _JellyColor {
  final List<int> bell, tent, glow;
  const _JellyColor(this.bell, this.tent, this.glow);
}

const _jellyColors = [
  _JellyColor([180, 140, 220], [200, 160, 240], [160, 120, 255]),
  _JellyColor([140, 200, 230], [160, 210, 240], [100, 200, 255]),
  _JellyColor([230, 160, 180], [240, 170, 195], [255, 140, 180]),
  _JellyColor([170, 230, 200], [180, 240, 210], [130, 255, 200]),
];

class _Tentacle {
  final double length, width, phase, speed, offsetX;
  const _Tentacle(this.length, this.width, this.phase, this.speed, this.offsetX);
}

class OceanJellyfish {
  double x, y, baseY, speed, size, pulsePhase, yDrift, nightFactor;
  int dir;
  _JellyColor colorSet;
  List<_Tentacle> tentacles;
  final Random _rng;

  OceanJellyfish(double canvasW, double canvasH, Random rng)
      : _rng = rng,
        dir = rng.nextBool() ? 1 : -1,
        x = 0, y = 0, baseY = 0, speed = 0, size = 0,
        pulsePhase = 0, yDrift = 0, nightFactor = 0,
        colorSet = _jellyColors[rng.nextInt(_jellyColors.length)],
        tentacles = [] {
    size = 18 + rng.nextDouble() * 18;
    final minY = canvasH * 0.68;
    final maxY = canvasH * 0.88;
    baseY = minY + rng.nextDouble() * (maxY - minY);
    x = rng.nextDouble() * canvasW;
    y = baseY;
    speed = 0.15 + rng.nextDouble() * 0.25;
    pulsePhase = rng.nextDouble() * pi * 2;
    yDrift = rng.nextDouble() * pi * 2;

    final numT = 5 + rng.nextInt(4);
    tentacles = List.generate(numT, (i) => _Tentacle(
      size * (1.5 + rng.nextDouble() * 2),
      0.8 + rng.nextDouble() * 1.5,
      rng.nextDouble() * pi * 2,
      0.5 + rng.nextDouble(),
      (i / (numT - 1) - 0.5) * size * 0.8,
    ));
  }

  void update(double t, double canvasW, double canvasH) {
    x += speed * dir;
    y = baseY + sin(t * 0.15 + yDrift) * 15;

    if ((dir > 0 && x > canvasW + size * 4) ||
        (dir < 0 && x < -size * 4)) {
      dir = _rng.nextBool() ? 1 : -1;
      x = dir > 0 ? -size * 3.0 : canvasW + size * 3;
      final minY = canvasH * 0.68;
      final maxY = canvasH * 0.88;
      baseY = minY + _rng.nextDouble() * (maxY - minY);
      y = baseY;
      colorSet = _jellyColors[_rng.nextInt(_jellyColors.length)];
    }
  }

  void draw(Canvas canvas, double t, double nightFac) {
    nightFactor = nightFac;
    final pulse = sin(t * 1.5 + pulsePhase) * 0.15 + 1;
    final s = size * pulse;
    final glow = nightFactor > 0.5;
    final c = colorSet;

    canvas.save();
    canvas.translate(x, y);

    // Night glow
    if (glow) {
      final glowPaint = Paint()
        ..shader = ui.Gradient.radial(
          Offset.zero, s * 3,
          [Color.fromRGBO(c.glow[0], c.glow[1], c.glow[2], (nightFactor - 0.5) * 0.2),
           Color.fromRGBO(c.glow[0], c.glow[1], c.glow[2], 0)],
        );
      canvas.drawCircle(Offset.zero, s * 3, glowPaint);
    }

    // Bell
    final alpha = glow ? 0.65 : 0.5;
    final bellPaint = Paint()
      ..shader = ui.Gradient.radial(
        Offset(-s * 0.2, -s * 0.3), s,
        [Color.fromRGBO(
           (c.bell[0] + 60).clamp(0, 255), (c.bell[1] + 60).clamp(0, 255),
           (c.bell[2] + 30).clamp(0, 255), alpha + 0.15),
         Color.fromRGBO(c.bell[0], c.bell[1], c.bell[2], alpha),
         Color.fromRGBO((c.bell[0] * 0.5).round(), (c.bell[1] * 0.5).round(),
           (c.bell[2] * 0.7).round(), alpha * 0.6)],
        [0, 0.5, 1.0],
      );

    final bellPath = Path();
    // Top dome
    bellPath.addOval(Rect.fromCenter(
      center: Offset(0, -s * 0.1),
      width: s * 1.4 * pulse,
      height: s * 1.1,
    ));
    canvas.drawPath(bellPath, bellPaint);

    // Inner organ
    canvas.drawOval(
      Rect.fromCenter(center: Offset(0, -s * 0.05), width: s * 0.6 * pulse, height: s * 0.4),
      Paint()..color = Color.fromRGBO(
        (c.bell[0] + 80).clamp(0, 255), (c.bell[1] + 40).clamp(0, 255),
        (c.bell[2] + 20).clamp(0, 255), 0.15),
    );

    // Inner ring
    canvas.drawOval(
      Rect.fromCenter(center: Offset(0, -s * 0.1), width: s * 0.7 * pulse, height: s * 0.5),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.7
        ..color = Colors.white.withOpacity( 0.12 + (glow ? 0.12 : 0)),
    );

    // Tentacles
    for (int i = 0; i < tentacles.length; i++) {
      final ten = tentacles[i];
      final tentPath = Path()..moveTo(ten.offsetX, s * 0.15);
      final segments = 14;
      for (int j = 1; j <= segments; j++) {
        final frac = j / segments;
        final wave = sin(t * ten.speed * 2 + ten.phase + frac * 3) * (8 + frac * 15);
        final px = ten.offsetX + wave * frac;
        final py = s * 0.15 + frac * ten.length;
        if (j == 1) {
          tentPath.lineTo(px, py);
        } else {
          final prevFrac = (j - 1) / segments;
          final prevWave = sin(t * ten.speed * 2 + ten.phase + prevFrac * 3) * (8 + prevFrac * 15);
          final cpx = ten.offsetX + prevWave * prevFrac + (wave * frac - prevWave * prevFrac) * 0.5;
          final cpy = s * 0.15 + (prevFrac + frac) * 0.5 * ten.length;
          tentPath.quadraticBezierTo(cpx, cpy, px, py);
        }
      }
      final tentAlpha = glow ? 0.5 : 0.35;
      canvas.drawPath(tentPath, Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = ten.width * (1 - 0.3 * sin(t + i))
        ..strokeCap = StrokeCap.round
        ..color = Color.fromRGBO(c.tent[0], c.tent[1], c.tent[2], tentAlpha * (1 - i * 0.04)));
    }

    canvas.restore();
  }
}

// ============================================================
// MANTA RAY — Side-view eagle ray with traveling wave wings
// ============================================================
class _MantaPalette {
  final List<int> top, belly, spot;
  const _MantaPalette(this.top, this.belly, this.spot);
}

const _mantaPalettes = [
  _MantaPalette([25, 45, 75], [195, 210, 225], [160, 200, 230]),
  _MantaPalette([35, 50, 60], [200, 210, 215], [170, 200, 210]),
  _MantaPalette([20, 35, 55], [180, 200, 220], [140, 185, 220]),
];

class OceanMantaRay {
  double x, y, speed, bodyLen, phase, wingPhase, yDrift;
  int dir;
  _MantaPalette palette;
  List<Map<String, double>> spots;
  final Random _rng;

  OceanMantaRay(double canvasW, double canvasH, Random rng)
      : _rng = rng,
        dir = rng.nextBool() ? 1 : -1,
        x = 0, y = 0, speed = 0, bodyLen = 0,
        phase = 0, wingPhase = 0, yDrift = 0,
        palette = _mantaPalettes[rng.nextInt(_mantaPalettes.length)],
        spots = [] {
    bodyLen = 60 + rng.nextDouble() * 25;
    x = dir > 0 ? -bodyLen * 3 : canvasW + bodyLen * 3;
    final minY = canvasH * 0.62;
    final maxY = canvasH * 0.82;
    y = minY + rng.nextDouble() * (maxY - minY);
    speed = 0.35 + rng.nextDouble() * 0.2;
    phase = rng.nextDouble() * pi * 2;
    wingPhase = rng.nextDouble() * pi * 2;
    yDrift = rng.nextDouble() * pi * 2;
    spots = List.generate(18, (_) => <String, double>{
        'x': -0.35 + rng.nextDouble() * 0.7,
        'y': -0.12 + rng.nextDouble() * 0.24,
        'r': 0.012 + rng.nextDouble() * 0.018,
      });
  }

  void update(double t, double canvasW, double canvasH) {
    x += speed * dir;
    y += sin(t * 0.4 + yDrift) * 0.35;
    final margin = bodyLen * 3;
    if ((dir > 0 && x > canvasW + margin) || (dir < 0 && x < -margin)) {
      dir = _rng.nextBool() ? 1 : -1;
      x = dir > 0 ? -margin : canvasW + margin;
      final minY = canvasH * 0.62;
      final maxY = canvasH * 0.82;
      y = minY + _rng.nextDouble() * (maxY - minY);
      speed = 0.35 + _rng.nextDouble() * 0.2;
      palette = _mantaPalettes[_rng.nextInt(_mantaPalettes.length)];
    }
  }

  void draw(Canvas canvas, double t, double nightFactor) {
    final L = bodyLen;
    final p = palette;
    final alpha = (0.8 + (nightFactor > 0.5 ? 0.1 : 0)).clamp(0.0, 1.0);
    final wingT = t * 1.1 + wingPhase;

    canvas.save();
    canvas.translate(x, y);
    canvas.scale(dir.toDouble(), 1);

    // Wing undulation
    final wingPts = 20;
    final topEdge = <Offset>[];
    final botEdge = <Offset>[];

    for (int i = 0; i <= wingPts; i++) {
      final frac = i / wingPts;
      final xPos = (0.5 - frac) * L;
      final thickProfile = sin(frac * pi) * 0.95;
      final headBulge = frac < 0.3 ? sin(frac / 0.3 * pi) * 0.3 : 0.0;
      final baseThick = (thickProfile + headBulge) * L * 0.13;
      final flapAmp = pow(frac, 1.3) * L * 0.35;
      final flapWave = sin(wingT - frac * pi * 2.2);
      final flapOffset = flapWave * flapAmp;

      topEdge.add(Offset(xPos, -baseThick + flapOffset));
      botEdge.add(Offset(xPos, baseThick * 0.6 + flapOffset * 0.6));
    }

    // Body gradient
    final bodyPaint = Paint()
      ..shader = ui.Gradient.linear(
        Offset(0, -L * 0.15), Offset(0, L * 0.1),
        [Color.fromRGBO(p.top[0], p.top[1], p.top[2], alpha),
         Color.fromRGBO(p.top[0] + 20, p.top[1] + 20, p.top[2] + 20, alpha * 0.9),
         Color.fromRGBO(p.belly[0], p.belly[1], p.belly[2], alpha * 0.7)],
        [0.0, 0.6, 1.0],
      );

    final bodyPath = Path()..moveTo(L * 0.55, 0);
    // Top edge
    for (int i = 0; i < topEdge.length; i++) {
      if (i == 0) {
        bodyPath.quadraticBezierTo(L * 0.52, topEdge[0].dy * 0.5, topEdge[0].dx, topEdge[0].dy);
      } else {
        final prev = topEdge[i - 1];
        final curr = topEdge[i];
        bodyPath.quadraticBezierTo(prev.dx, prev.dy, (prev.dx + curr.dx) * 0.5, (prev.dy + curr.dy) * 0.5);
      }
    }
    bodyPath.lineTo(topEdge.last.dx - L * 0.05, topEdge.last.dy * 0.5);
    // Bottom edge (reverse)
    for (int i = botEdge.length - 1; i >= 0; i--) {
      if (i == botEdge.length - 1) {
        bodyPath.lineTo(botEdge[i].dx, botEdge[i].dy);
      } else {
        final prev = botEdge[i + 1];
        final curr = botEdge[i];
        bodyPath.quadraticBezierTo(prev.dx, prev.dy, (prev.dx + curr.dx) * 0.5, (prev.dy + curr.dy) * 0.5);
      }
    }
    bodyPath.quadraticBezierTo(L * 0.52, botEdge[0].dy * 0.3, L * 0.55, 0);
    bodyPath.close();
    canvas.drawPath(bodyPath, bodyPaint);

    // Spots
    final spotPaint = Paint()
      ..color = Color.fromRGBO(p.spot[0], p.spot[1], p.spot[2], alpha * 0.35);
    for (final s in spots) {
      final sx = s['x']! * L;
      final sy = s['y']! * L;
      final frac = 0.5 - sx / L;
      if (frac >= 0 && frac <= 1) {
        final flapHere = sin(wingT - frac * pi * 2.2) * pow(frac, 1.3) * L * 0.2;
        canvas.drawCircle(Offset(sx, sy + flapHere * 0.3), s['r']! * L, spotPaint);
      }
    }

    // Cephalic fin
    final cephFlap = sin(wingT) * L * 0.015;
    final cephPath = Path()
      ..moveTo(L * 0.5, -L * 0.02)
      ..quadraticBezierTo(L * 0.58, -L * 0.06 + cephFlap, L * 0.52, -L * 0.09 + cephFlap)
      ..quadraticBezierTo(L * 0.48, -L * 0.05, L * 0.5, -L * 0.02);
    canvas.drawPath(cephPath, Paint()
      ..color = Color.fromRGBO(p.top[0] + 10, p.top[1] + 10, p.top[2] + 10, alpha * 0.7));

    // Eye
    canvas.drawOval(
      Rect.fromCenter(center: Offset(L * 0.38, -L * 0.045), width: L * 0.044, height: L * 0.032),
      Paint()..color = Color.fromRGBO(220, 225, 235, alpha * 0.8));
    canvas.drawCircle(Offset(L * 0.385, -L * 0.043), L * 0.009,
      Paint()..color = Color.fromRGBO(10, 15, 25, alpha * 0.9));
    canvas.drawCircle(Offset(L * 0.382, -L * 0.048), L * 0.004,
      Paint()..color = Colors.white.withOpacity( 0.4));

    // Gill slits
    final gillPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.7
      ..color = Color.fromRGBO(
        (p.top[0] - 10).clamp(0, 255), (p.top[1] - 10).clamp(0, 255),
        (p.top[2] - 10).clamp(0, 255), alpha * 0.2);
    for (int i = 0; i < 5; i++) {
      final gx = L * 0.22 - i * L * 0.03;
      canvas.drawLine(Offset(gx, L * 0.02), Offset(gx - L * 0.005, L * 0.055), gillPaint);
    }

    // Tail
    final lastTop = topEdge.last;
    final lastBot = botEdge.last;
    final tailBaseX = lastTop.dx - L * 0.05;
    final tailBaseY = (lastTop.dy + lastBot.dy) * 0.4;
    final tailLen = L * 1.4;
    final tailSway1 = sin(t * 0.5 + phase) * L * 0.1;
    final tailSway2 = sin(t * 0.8 + phase + 1.5) * L * 0.07;

    final tailPaint1 = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.8
      ..strokeCap = StrokeCap.round
      ..color = Color.fromRGBO(p.top[0], p.top[1], p.top[2], alpha * 0.55);
    final tailPath1 = Path()
      ..moveTo(tailBaseX, tailBaseY)
      ..cubicTo(
        tailBaseX - tailLen * 0.25, tailBaseY + tailSway1 * 0.3,
        tailBaseX - tailLen * 0.5, tailBaseY + tailSway1,
        tailBaseX - tailLen * 0.65, tailBaseY + tailSway1 + tailSway2 * 0.5);
    canvas.drawPath(tailPath1, tailPaint1);

    final tailPaint2 = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0
      ..strokeCap = StrokeCap.round
      ..color = Color.fromRGBO(p.top[0], p.top[1], p.top[2], alpha * 0.55);
    final tailPath2 = Path()
      ..moveTo(tailBaseX - tailLen * 0.65, tailBaseY + tailSway1 + tailSway2 * 0.5)
      ..cubicTo(
        tailBaseX - tailLen * 0.8, tailBaseY + tailSway1 * 0.8 + tailSway2,
        tailBaseX - tailLen * 0.9, tailBaseY + tailSway1 * 0.5 + tailSway2 * 1.3,
        tailBaseX - tailLen, tailBaseY + tailSway1 * 0.3 + tailSway2 * 1.5);
    canvas.drawPath(tailPath2, tailPaint2);

    // Night bioluminescence
    if (nightFactor > 0.5) {
      final glowAlpha = (nightFactor - 0.5) * 0.12;
      canvas.drawOval(
        Rect.fromCenter(center: Offset.zero, width: L * 1.6, height: L * 0.6),
        Paint()..shader = ui.Gradient.radial(
          Offset.zero, L * 0.8,
          [Color.fromRGBO(100, 180, 220, glowAlpha),
           Color.fromRGBO(100, 180, 220, 0)],
        ),
      );
    }

    canvas.restore();
  }
}

// ============================================================
// BUBBLE — Iridescent rising bubbles
// ============================================================
class OceanBubble {
  double x, y, r, speed, wobblePhase, wobbleAmp, hue, waterYFrac;
  final Random _rng;

  OceanBubble(double canvasW, double canvasH, double waterY, Random rng)
      : _rng = rng,
        waterYFrac = waterY,
        x = rng.nextDouble() * canvasW,
        y = canvasH + rng.nextDouble() * 50,
        r = 2 + rng.nextDouble() * 5,
        speed = 0.3 + rng.nextDouble() * 0.8,
        wobblePhase = rng.nextDouble() * pi * 2,
        wobbleAmp = 0.3 + rng.nextDouble() * 0.5,
        hue = rng.nextDouble() * 360;

  void update(double t, double canvasW, double canvasH) {
    y -= speed;
    x += sin(t * wobbleAmp + wobblePhase) * 0.3;
    if (y < waterYFrac * canvasH) {
      x = _rng.nextDouble() * canvasW;
      y = canvasH + _rng.nextDouble() * 50;
      r = 2 + _rng.nextDouble() * 5;
      speed = 0.3 + _rng.nextDouble() * 0.8;
      hue = _rng.nextDouble() * 360;
    }
  }

  void draw(Canvas canvas, double t) {
    final h = ((hue + t * 15) % 360) / 360.0;

    // Bubble body with gradient
    final grad = Paint()
      ..shader = ui.Gradient.radial(
        Offset(x - r * 0.3, y - r * 0.3), r,
        [HSLColor.fromAHSL(0.25, h * 360, 0.7, 0.85).toColor(),
         HSLColor.fromAHSL(0.15, ((h + 0.11) % 1.0) * 360, 0.6, 0.75).toColor(),
         HSLColor.fromAHSL(0.08, ((h + 0.22) % 1.0) * 360, 0.5, 0.65).toColor()],
        [0.0, 0.5, 1.0],
      );
    canvas.drawCircle(Offset(x, y), r, grad);

    // Edge
    canvas.drawCircle(Offset(x, y), r, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.5
      ..color = HSLColor.fromAHSL(0.3, h * 360, 0.6, 0.8).toColor());

    // Highlight
    canvas.drawOval(
      Rect.fromCenter(center: Offset(x - r * 0.25, y - r * 0.3), width: r * 0.6, height: r * 0.4),
      Paint()..color = Colors.white.withOpacity( 0.4));

    canvas.drawCircle(Offset(x + r * 0.2, y + r * 0.15), r * 0.12,
      Paint()..color = Colors.white.withOpacity( 0.2));
  }
}

// ============================================================
// CORAL REEF — Seaweed, branches, brain, fan, tube, anemone
// ============================================================
class _CoralPiece {
  final double x, y, size, phase;
  final String type;
  final Color base, light;

  _CoralPiece(this.x, this.y, this.size, this.phase, this.type, this.base, this.light);
}

class _Seaweed {
  final double x, y, height, phase, thickness, hue;
  final int segments;

  _Seaweed(this.x, this.y, this.height, this.phase, this.thickness, this.hue, this.segments);
}

class OceanCoralReef {
  final List<_CoralPiece> corals = [];
  final List<_Seaweed> seaweeds = [];

  OceanCoralReef(double w, double h, Random rng) {
    final groundY = h - 15;
    final coralTypes = ['branch', 'brain', 'fan', 'tube', 'mushroom', 'anemone'];
    final coralColors = [
      [const Color(0xFFFF6450), const Color(0xFFFFA082)],
      [const Color(0xFFFF8C3C), const Color(0xFFFFBE78)],
      [const Color(0xFFE650A0), const Color(0xFFFF8CC8)],
      [const Color(0xFFB464DC), const Color(0xFFD2A0FF)],
      [const Color(0xFF50C8A0), const Color(0xFF8CEBC8)],
      [const Color(0xFFFFC846), const Color(0xFFFFE68C)],
      [const Color(0xFF64B4F0), const Color(0xFFA0D2FF)],
    ];

    // Scatter coral naturally with clusters and depth variation
    // Create 3-4 clusters at random positions, then scatter individual pieces
    final clusterCount = 3 + rng.nextInt(2); // 3 or 4 clusters
    final clusterCenters = List.generate(clusterCount, (_) => rng.nextDouble() * w);

    for (int i = 0; i < 20; i++) {
      double x;
      if (i < 14) {
        // 70% near clusters for natural grouping
        final cluster = clusterCenters[rng.nextInt(clusterCount)];
        x = cluster + (rng.nextDouble() - 0.5) * w * 0.18;
      } else {
        // 30% scattered randomly for variety
        x = rng.nextDouble() * w;
      }
      // Clamp to screen bounds with margin
      x = x.clamp(10.0, w - 10.0);

      // Vary Y position for depth perspective — some coral slightly higher
      final depthOffset = rng.nextDouble() * 18; // 0-18px above ground
      final coralY = groundY - depthOffset;
      // Closer to ground = larger (perspective)
      final perspectiveScale = 1.0 - depthOffset / 40;

      final type = coralTypes[rng.nextInt(coralTypes.length)];
      final cc = coralColors[rng.nextInt(coralColors.length)];
      final size = (10 + rng.nextDouble() * 28) * perspectiveScale;
      corals.add(_CoralPiece(x, coralY, size, rng.nextDouble() * pi * 2, type, cc[0], cc[1]));
    }

    // Seaweed — scattered with varied height and slight depth offset
    for (int i = 0; i < 20; i++) {
      final depthOff = rng.nextDouble() * 10;
      seaweeds.add(_Seaweed(
        rng.nextDouble() * w,
        groundY - depthOff,
        30 + rng.nextDouble() * 80, // taller range
        rng.nextDouble() * pi * 2,
        2 + rng.nextDouble() * 2.5,
        85 + rng.nextDouble() * 55,
        7 + rng.nextInt(6),
      ));
    }
  }

  void draw(Canvas canvas, double t, double nightFactor) {
    final alpha = 0.6 + (nightFactor > 0.5 ? -0.15 : 0.0);

    // Seaweed (behind coral)
    for (final sw in seaweeds) {
      // Increased sway amplitude and speed for visible ocean current movement
      final sway = sin(t * 0.35 + sw.phase) * 9 + sin(t * 0.18 + sw.phase * 1.7) * 4;
      final swPath = Path()..moveTo(sw.x, sw.y);

      for (int i = 1; i <= sw.segments; i++) {
        final frac = i / sw.segments;
        // Tips sway much more than base (cubic falloff)
        final px = sw.x + sway * frac * frac * frac + sin(t * 0.25 + sw.phase + frac * 3) * 5 * frac;
        final py = sw.y - frac * sw.height;
        swPath.lineTo(px, py);
      }

      final lightness = nightFactor > 0.5 ? 0.25 : 0.35;
      canvas.drawPath(swPath, Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = sw.thickness
        ..strokeCap = StrokeCap.round
        ..color = HSLColor.fromAHSL(alpha * 0.7, sw.hue, 0.6, lightness).toColor());

      // Leaves — follow stem sway with extra flutter
      for (int i = 2; i < sw.segments; i++) {
        final frac = i / sw.segments;
        final lx = sw.x + sway * frac * frac * frac + sin(t * 0.25 + sw.phase + frac * 3) * 5 * frac;
        final ly = sw.y - frac * sw.height;
        final side = i % 2 == 0 ? 1.0 : -1.0;
        final leafSway = sin(t * 0.4 + i * 0.7 + sw.phase) * 3;
        final leaf = Path()
          ..moveTo(lx, ly)
          ..quadraticBezierTo(
            lx + side * (10 + leafSway) + sway * frac * 0.3, ly - 5,
            lx + side * 4 + leafSway * 0.5, ly - 12);
        canvas.drawPath(leaf, Paint()
          ..color = HSLColor.fromAHSL(alpha * 0.5, sw.hue + 10, 0.55, lightness + 0.08).toColor());
      }
    }

    // Coral pieces
    for (final c in corals) {
      canvas.save();
      canvas.translate(c.x, c.y);
      switch (c.type) {
        case 'branch': _drawBranch(canvas, c, t, alpha); break;
        case 'brain': _drawBrain(canvas, c, t, alpha); break;
        case 'fan': _drawFan(canvas, c, t, alpha); break;
        case 'tube': _drawTube(canvas, c, t, alpha); break;
        case 'mushroom': _drawMushroom(canvas, c, alpha); break;
        case 'anemone': _drawAnemone(canvas, c, t, alpha); break;
      }
      canvas.restore();
    }
  }

  void _drawBranch(Canvas canvas, _CoralPiece c, double t, double alpha) {
    final s = c.size;
    final sway = sin(t * 0.08 + c.phase);

    // Trunk
    final trunk = Path()..moveTo(0, 0)..quadraticBezierTo(sway, -s * 0.5, sway * 1.5, -s);
    canvas.drawPath(trunk, Paint()
      ..style = PaintingStyle.stroke..strokeWidth = 3..strokeCap = StrokeCap.round
      ..color = c.base.withOpacity( alpha));

    // Branches
    for (int i = 0; i < 4; i++) {
      final frac = 0.3 + i * 0.18;
      final bx = sway * frac;
      final by = -s * frac;
      final dir = i % 2 == 0 ? 1.0 : -1.0;
      final blen = s * 0.4;

      final branch = Path()
        ..moveTo(bx, by)
        ..quadraticBezierTo(bx + dir * blen * 0.5 + sway, by - blen * 0.3, bx + dir * blen, by - blen * 0.6);
      canvas.drawPath(branch, Paint()
        ..style = PaintingStyle.stroke..strokeWidth = 2..strokeCap = StrokeCap.round
        ..color = c.light.withOpacity( alpha * 0.8));

      canvas.drawCircle(Offset(bx + dir * blen, by - blen * 0.6), 2,
        Paint()..color = c.light.withOpacity( alpha * 0.6));
    }
  }

  void _drawBrain(Canvas canvas, _CoralPiece c, double t, double alpha) {
    final s = c.size * 0.7;
    canvas.drawOval(
      Rect.fromCenter(center: Offset(0, -s * 0.4), width: s * 1.6, height: s * 1.2),
      Paint()..shader = ui.Gradient.radial(
        Offset(-s * 0.2, -s * 0.4), s,
        [c.light.withOpacity( alpha), c.base.withOpacity( alpha * 0.8)],
      ));
  }

  void _drawFan(Canvas canvas, _CoralPiece c, double t, double alpha) {
    final s = c.size;
    final sway = sin(t * 0.06 + c.phase) * 1.2;
    final ribs = 7;

    for (int i = 0; i < ribs; i++) {
      final angle = -pi * 0.15 + (i / (ribs - 1)) * pi * 0.3;
      final len = s * 0.9;
      final ex = sin(angle) * len + sway;
      final ey = -cos(angle) * len;
      final rib = Path()
        ..moveTo(0, 0)
        ..quadraticBezierTo(sin(angle) * len * 0.5 + sway * 0.5, ey * 0.5, ex, ey);
      final t2 = i / ribs;
      canvas.drawPath(rib, Paint()
        ..style = PaintingStyle.stroke..strokeWidth = 1.5
        ..color = Color.lerp(c.base, c.light, t2)!.withOpacity( alpha * 0.6));
    }
  }

  void _drawTube(Canvas canvas, _CoralPiece c, double t, double alpha) {
    final s = c.size * 0.5;
    for (int i = 0; i < 3; i++) {
      final tx = (i - 1) * s * 0.6;
      final th = s * 1.5;
      final tw = s * 0.3;
      final sway = sin(t * 0.07 + c.phase + i) * 0.8;

      final tube = Path()
        ..moveTo(tx - tw, 0)
        ..quadraticBezierTo(tx - tw + sway * 0.5, -th * 0.5, tx - tw * 0.8 + sway, -th)
        ..lineTo(tx + tw * 0.8 + sway, -th)
        ..quadraticBezierTo(tx + tw + sway * 0.5, -th * 0.5, tx + tw, 0);
      canvas.drawPath(tube, Paint()..color = c.base.withOpacity( alpha * 0.7));
      canvas.drawOval(
        Rect.fromCenter(center: Offset(tx + sway, -th), width: tw * 1.6, height: tw * 0.7),
        Paint()..color = c.light.withOpacity( alpha * 0.5));
    }
  }

  void _drawMushroom(Canvas canvas, _CoralPiece c, double alpha) {
    final s = c.size * 0.6;
    // Stem
    final stem = Path()
      ..moveTo(-s * 0.15, 0)..lineTo(-s * 0.12, -s * 0.7)
      ..lineTo(s * 0.12, -s * 0.7)..lineTo(s * 0.15, 0);
    canvas.drawPath(stem, Paint()..color = c.base.withOpacity( alpha * 0.6));
    // Cap
    canvas.drawOval(
      Rect.fromCenter(center: Offset(0, -s * 0.85), width: s, height: s * 0.5),
      Paint()..shader = ui.Gradient.radial(
        Offset(0, -s * 0.85), s * 0.5,
        [c.light.withOpacity( alpha), c.base.withOpacity( alpha * 0.7)],
      ));
  }

  void _drawAnemone(Canvas canvas, _CoralPiece c, double t, double alpha) {
    final s = c.size * 0.6;
    // Base
    canvas.drawOval(
      Rect.fromCenter(center: Offset.zero, width: s, height: s * 0.3),
      Paint()..color = c.base.withOpacity( alpha * 0.5));
    // Tentacles
    for (int i = 0; i < 10; i++) {
      final angle = (i / 10) * pi * 2;
      final len = s * (0.8 + sin(t * 0.12 + c.phase + i * 0.7) * 0.1);
      final sway = sin(t * 0.1 + c.phase + i * 0.5) * 3;
      final startX = cos(angle) * s * 0.3;
      final endX = cos(angle) * s * 0.5 + sway;
      final endY = -len;
      final tent = Path()
        ..moveTo(startX, -s * 0.05)
        ..quadraticBezierTo(startX + sway * 0.5, endY * 0.5, endX, endY);
      canvas.drawPath(tent, Paint()
        ..style = PaintingStyle.stroke..strokeWidth = 1.8..strokeCap = StrokeCap.round
        ..color = c.light.withOpacity( alpha * 0.5));
      canvas.drawCircle(Offset(endX, endY), 2, Paint()..color = c.light.withOpacity( alpha * 0.7));
    }
  }
}

// ============================================================
// COMBINED CREATURES PAINTER
// ============================================================
class OceanCreaturesPainter extends CustomPainter {
  final double time;
  final double nightFactor;
  final List<OceanFish> fish;
  final List<OceanJellyfish> jellyfish;
  final List<OceanMantaRay> mantas;
  final List<OceanBubble> bubbles;
  final OceanCoralReef? coral;

  OceanCreaturesPainter({
    required this.time,
    required this.nightFactor,
    required this.fish,
    required this.jellyfish,
    required this.mantas,
    required this.bubbles,
    this.coral,
  });

  @override
  void paint(Canvas canvas, Size size) {
    // Update and draw all creatures
    final w = size.width;
    final h = size.height;

    // Coral reef (bottom layer)
    coral?.draw(canvas, time, nightFactor);

    // Bubbles
    for (final b in bubbles) {
      b.update(time, w, h);
      b.draw(canvas, time);
    }

    // Fish
    for (final f in fish) {
      f.update(time, w, h);
      f.draw(canvas, time, nightFactor);
    }

    // Jellyfish
    for (final j in jellyfish) {
      j.update(time, w, h);
      j.draw(canvas, time, nightFactor);
    }

    // Manta rays
    for (final m in mantas) {
      m.update(time, w, h);
      m.draw(canvas, time, nightFactor);
    }
  }

  @override
  bool shouldRepaint(covariant OceanCreaturesPainter old) => true;
}
