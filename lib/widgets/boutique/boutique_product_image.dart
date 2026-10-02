import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../config/app_colors.dart';

/// Displays a boutique product image backed by the persistent on-device cache.
///
/// A successfully downloaded image is reused by URL across the catalogue,
/// product gallery and cart, including when the network is temporarily
/// unavailable.
class BoutiqueProductImage extends StatelessWidget {
  final String? imageUrl;
  final BoxFit fit;
  final IconData errorIcon;
  final Color placeholderColor;
  final double errorIconSize;
  final double loadingIndicatorSize;

  const BoutiqueProductImage({
    super.key,
    required this.imageUrl,
    this.fit = BoxFit.contain,
    this.errorIcon = Icons.shopping_bag_outlined,
    this.placeholderColor = AppColors.middenblauw,
    this.errorIconSize = 34,
    this.loadingIndicatorSize = 24,
  });

  /// Returns the first product image URL supported by the mobile client.
  static String? firstUrl(Iterable<String> images) {
    for (final imageUrl in images) {
      final resolved = resolveUrl(imageUrl);
      if (resolved != null) return resolved;
    }
    return null;
  }

  /// Resolves website-relative product images and rejects unsupported values.
  static String? resolveUrl(String? imageUrl) {
    final trimmed = imageUrl?.trim() ?? '';
    if (trimmed.isEmpty) return null;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    if (trimmed.startsWith('/')) {
      return 'https://caly.club$trimmed';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final resolvedUrl = resolveUrl(imageUrl);
    if (resolvedUrl == null) return _errorPlaceholder();

    return CachedNetworkImage(
      imageUrl: resolvedUrl,
      // cached_network_image's default cache manager persists files on disk.
      // Using the resolved URL explicitly as key lets every boutique surface
      // share the same cached file.
      cacheKey: resolvedUrl,
      fit: fit,
      placeholder: (_, __) => Center(
        child: SizedBox.square(
          dimension: loadingIndicatorSize,
          child: CircularProgressIndicator(
            strokeWidth: 2.5,
            color: placeholderColor,
          ),
        ),
      ),
      errorWidget: (_, __, ___) => _errorPlaceholder(),
    );
  }

  Widget _errorPlaceholder() {
    return Center(
      child: Icon(errorIcon, color: placeholderColor, size: errorIconSize),
    );
  }
}
