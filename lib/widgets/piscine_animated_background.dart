import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';
import '../config/app_assets.dart';

/// Widget de fond animé pour les écrans piscine
/// Affiche un fond océan avec des méduses et algues animées
class PiscineAnimatedBackground extends StatefulWidget {
  final Widget child;
  final bool showJellyfish;
  final bool showSeaweed;
  final bool showBubbles;
  final int jellyfishCount;
  final bool useFullBackground;

  const PiscineAnimatedBackground({
    super.key,
    required this.child,
    this.showJellyfish = true,
    this.showSeaweed = true,
    this.showBubbles = false,
    this.jellyfishCount = 2,
    this.useFullBackground = false,
  });

  @override
  State<PiscineAnimatedBackground> createState() =>
      _PiscineAnimatedBackgroundState();
}

class _PiscineAnimatedBackgroundState extends State<PiscineAnimatedBackground>
    with TickerProviderStateMixin {
  // Jellyfish controllers
  late List<AnimationController> _jellyfishControllers;
  late List<Animation<double>> _jellyfishPositions;

  // Seaweed controller
  late AnimationController _seaweedController;
  late Animation<double> _seaweedSway;

  // Bubbles controller
  late AnimationController _bubblesController;
  late Animation<double> _bubblesPosition;

  // Jellyfish configuration
  static const List<_JellyfishConfig> _jellyfishConfigs = [
    _JellyfishConfig(
      duration: 25,
      startDelay: 0,
      horizontalPosition: 0.8, // Right side
      size: 120,
      opacity: 0.7,
      startY: 1.2,
      endY: -0.3,
    ),
    _JellyfishConfig(
      duration: 30,
      startDelay: 8,
      horizontalPosition: 0.1, // Left side
      size: 160,
      opacity: 0.6,
      startY: 1.3,
      endY: -0.4,
    ),
    _JellyfishConfig(
      duration: 20,
      startDelay: 15,
      horizontalPosition: 0.4, // Center-left
      size: 80,
      opacity: 0.5,
      startY: 1.1,
      endY: -0.2,
    ),
  ];

  @override
  void initState() {
    super.initState();
    _initJellyfishAnimations();
    _initSeaweedAnimation();
    _initBubblesAnimation();
  }

  void _initJellyfishAnimations() {
    final count = widget.jellyfishCount.clamp(0, _jellyfishConfigs.length);
    _jellyfishControllers = [];
    _jellyfishPositions = [];

    for (int i = 0; i < count; i++) {
      final config = _jellyfishConfigs[i];

      final controller = AnimationController(
        duration: Duration(seconds: config.duration),
        vsync: this,
      );

      final position = Tween<double>(
        begin: config.startY,
        end: config.endY,
      ).animate(CurvedAnimation(
        parent: controller,
        curve: Curves.easeInOut,
      ));

      _jellyfishControllers.add(controller);
      _jellyfishPositions.add(position);

      // Start with delay
      if (config.startDelay > 0) {
        Future.delayed(Duration(seconds: config.startDelay), () {
          if (mounted) controller.repeat();
        });
      } else {
        controller.repeat();
      }
    }
  }

  void _initSeaweedAnimation() {
    _seaweedController = AnimationController(
      duration: const Duration(seconds: 4),
      vsync: this,
    );

    _seaweedSway = Tween<double>(
      begin: -0.05,
      end: 0.05,
    ).animate(CurvedAnimation(
      parent: _seaweedController,
      curve: Curves.easeInOut,
    ));

    if (widget.showSeaweed) {
      _seaweedController.repeat(reverse: true);
    }
  }

  void _initBubblesAnimation() {
    _bubblesController = AnimationController(
      duration: const Duration(seconds: 35),
      vsync: this,
    );

    _bubblesPosition = Tween<double>(
      begin: 0.5,
      end: -0.5,
    ).animate(CurvedAnimation(
      parent: _bubblesController,
      curve: Curves.linear,
    ));

    if (widget.showBubbles) {
      _bubblesController.repeat();
    }
  }

  @override
  void dispose() {
    for (final controller in _jellyfishControllers) {
      controller.dispose();
    }
    _seaweedController.dispose();
    _bubblesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final screenWidth = MediaQuery.of(context).size.width;

    return Stack(
      children: [
        // Background
        Container(
          width: double.infinity,
          height: double.infinity,
          decoration: BoxDecoration(
            image: DecorationImage(
              image: AssetImage(
                widget.useFullBackground
                    ? AppAssets.backgroundFull
                    : AppAssets.backgroundLight,
              ),
              fit: BoxFit.cover,
            ),
          ),
        ),

        // Jellyfish behind content
        if (widget.showJellyfish)
          ..._buildJellyfishWidgets(screenHeight, screenWidth, behind: true),

        // Bubbles behind content
        if (widget.showBubbles) _buildBubblesWidget(screenHeight, screenWidth),

        // Main content
        widget.child,

        // Seaweed at bottom (in front of content)
        if (widget.showSeaweed) _buildSeaweedWidget(screenHeight, screenWidth),

        // Some jellyfish in front of content for depth
        if (widget.showJellyfish && _jellyfishControllers.length > 1)
          _buildJellyfishWidgets(screenHeight, screenWidth, behind: false)
              .last,
      ],
    );
  }

  List<Widget> _buildJellyfishWidgets(
    double screenHeight,
    double screenWidth, {
    required bool behind,
  }) {
    final widgets = <Widget>[];
    final count = _jellyfishControllers.length;

    // Behind: all except last, In front: only last
    final startIndex = behind ? 0 : count - 1;
    final endIndex = behind ? count - 1 : count;

    for (int i = startIndex; i < endIndex; i++) {
      final config = _jellyfishConfigs[i];
      final controller = _jellyfishControllers[i];
      final position = _jellyfishPositions[i];

      widgets.add(
        AnimatedBuilder(
          animation: position,
          builder: (context, child) {
            return Positioned(
              top: screenHeight * position.value,
              left: screenWidth * config.horizontalPosition -
                  (config.size / 2),
              child: IgnorePointer(
                child: Opacity(
                  opacity: config.opacity,
                  child: Lottie.asset(
                    'assets/animations/jellyfish.json',
                    width: config.size.toDouble(),
                    height: config.size.toDouble(),
                    repeat: true,
                    controller: controller,
                  ),
                ),
              ),
            );
          },
        ),
      );
    }

    return widgets;
  }

  Widget _buildSeaweedWidget(double screenHeight, double screenWidth) {
    return AnimatedBuilder(
      animation: _seaweedSway,
      builder: (context, child) {
        return Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: Transform.rotate(
              angle: _seaweedSway.value,
              alignment: Alignment.bottomCenter,
              child: Opacity(
                opacity: 0.7,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Lottie.asset(
                      'assets/animations/seaweed.json',
                      width: 80,
                      height: 150,
                      repeat: true,
                    ),
                    Transform.scale(
                      scaleX: -1, // Mirror
                      child: Lottie.asset(
                        'assets/animations/seaweed.json',
                        width: 60,
                        height: 120,
                        repeat: true,
                      ),
                    ),
                    Lottie.asset(
                      'assets/animations/seaweed.json',
                      width: 70,
                      height: 130,
                      repeat: true,
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildBubblesWidget(double screenHeight, double screenWidth) {
    return AnimatedBuilder(
      animation: _bubblesPosition,
      builder: (context, child) {
        return Positioned(
          top: screenHeight * _bubblesPosition.value,
          left: screenWidth * 0.3,
          child: IgnorePointer(
            child: Opacity(
              opacity: 0.4,
              child: Lottie.asset(
                'assets/animations/bubbles.json',
                width: 200,
                height: 300,
                repeat: true,
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Configuration for individual jellyfish
class _JellyfishConfig {
  final int duration;
  final int startDelay;
  final double horizontalPosition; // 0.0 = left, 1.0 = right
  final int size;
  final double opacity;
  final double startY; // Starting Y position (1.0 = bottom of screen)
  final double endY; // Ending Y position (negative = above screen)

  const _JellyfishConfig({
    required this.duration,
    required this.startDelay,
    required this.horizontalPosition,
    required this.size,
    required this.opacity,
    required this.startY,
    required this.endY,
  });
}
