import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import '../models/session_message.dart' show MessageAttachment;

class VideoAttachment extends StatefulWidget {
  final MessageAttachment attachment;
  final bool compact;

  const VideoAttachment({
    super.key,
    required this.attachment,
    this.compact = false,
  });

  @override
  State<VideoAttachment> createState() => _VideoAttachmentState();
}

class _VideoAttachmentState extends State<VideoAttachment> {
  VideoPlayerController? _controller;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    final controller = VideoPlayerController.networkUrl(
      Uri.parse(widget.attachment.url),
    );

    try {
      await controller.initialize();
      controller.setLooping(false);
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() {
        _controller = controller;
        _failed = false;
      });
    } catch (_) {
      await controller.dispose();
      if (mounted) {
        setState(() => _failed = true);
      }
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final width = widget.compact ? 180.0 : 260.0;
    final height = widget.compact ? 120.0 : 180.0;
    final controller = _controller;

    return GestureDetector(
      onTap: controller != null
          ? () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => _FullScreenVideoView(
                    attachment: widget.attachment,
                  ),
                ),
              );
            }
          : null,
      child: Container(
        width: width,
        margin: const EdgeInsets.only(top: 8),
        padding:
            controller == null ? const EdgeInsets.all(12) : EdgeInsets.zero,
        decoration: BoxDecoration(
          color: Colors.black,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white24),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            width: width,
            height: height,
            child: controller == null
                ? _buildPlaceholder(context, height)
                : Stack(
                    alignment: Alignment.center,
                    children: [
                      AspectRatio(
                        aspectRatio: controller.value.aspectRatio,
                        child: VideoPlayer(controller),
                      ),
                      _PlayPauseButton(controller: controller),
                      Positioned(
                        bottom: 8,
                        left: 8,
                        right: 8,
                        child: Text(
                          widget.attachment.filename,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            shadows: [
                              Shadow(color: Colors.black87, blurRadius: 8),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }

  Widget _buildPlaceholder(BuildContext context, double height) {
    if (_failed) {
      return Container(
        height: height,
        color: Colors.black87,
        child: const Center(
          child: Icon(Icons.videocam_off, color: Colors.white70, size: 32),
        ),
      );
    }

    return Container(
      height: height,
      color: Colors.black87,
      child: const Center(
        child: CircularProgressIndicator(color: Colors.white),
      ),
    );
  }
}

class _PlayPauseButton extends StatelessWidget {
  final VideoPlayerController controller;

  const _PlayPauseButton({required this.controller});

  @override
  Widget build(BuildContext context) {
    final isPlaying = controller.value.isPlaying;

    return GestureDetector(
      onTap: () {
        if (isPlaying) {
          controller.pause();
        } else {
          controller.play();
        }
      },
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.black54,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Icon(
          isPlaying ? Icons.pause : Icons.play_arrow,
          color: Colors.white,
          size: 28,
        ),
      ),
    );
  }
}

class _FullScreenVideoView extends StatefulWidget {
  final MessageAttachment attachment;

  const _FullScreenVideoView({required this.attachment});

  @override
  State<_FullScreenVideoView> createState() => _FullScreenVideoViewState();
}

class _FullScreenVideoViewState extends State<_FullScreenVideoView> {
  VideoPlayerController? _controller;

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    final controller = VideoPlayerController.networkUrl(
      Uri.parse(widget.attachment.url),
    );
    await controller.initialize();
    if (!mounted) {
      await controller.dispose();
      return;
    }
    setState(() => _controller = controller);
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: Text(
          widget.attachment.filename,
          style: const TextStyle(color: Colors.white, fontSize: 14),
        ),
      ),
      body: Center(
        child: controller == null
            ? const CircularProgressIndicator(color: Colors.white)
            : Stack(
                alignment: Alignment.center,
                children: [
                  AspectRatio(
                    aspectRatio: controller.value.aspectRatio,
                    child: VideoPlayer(controller),
                  ),
                  _PlayPauseButton(controller: controller),
                ],
              ),
      ),
    );
  }
}
