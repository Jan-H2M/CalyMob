import 'dart:async';

import 'package:flutter/foundation.dart';

/// Keeps the last complete stream value visible while reconnecting.
///
/// A source that produces neither data nor an error is marked stalled after
/// [timeout]. The subscription remains alive, and [retry] starts a fresh one.
class RetainedStreamLoader<T> extends ChangeNotifier {
  RetainedStreamLoader({
    required Stream<T> Function() streamFactory,
    this.timeout = const Duration(seconds: 8),
  }) : _streamFactory = streamFactory;

  Stream<T> Function() _streamFactory;
  final Duration timeout;
  StreamSubscription<T>? _subscription;
  Timer? _timer;
  int _generation = 0;
  T? _value;
  bool _hasValue = false;
  bool _isLoading = false;
  bool _isStalled = false;
  Object? _error;

  T? get value => _value;
  bool get hasValue => _hasValue;
  bool get isLoading => _isLoading;
  bool get isStalled => _isStalled;
  Object? get error => _error;

  void replaceFactory(Stream<T> Function() streamFactory) {
    _streamFactory = streamFactory;
  }

  Future<void> start() async {
    final generation = ++_generation;
    _timer?.cancel();
    await _subscription?.cancel();
    if (generation != _generation) return;
    _isLoading = true;
    _isStalled = false;
    _error = null;
    notifyListeners();
    _timer = Timer(timeout, () {
      if (generation != _generation || !_isLoading) return;
      _isLoading = false;
      _isStalled = true;
      notifyListeners();
    });
    try {
      _subscription = _streamFactory().listen(
        (value) {
          if (generation != _generation) return;
          _timer?.cancel();
          _value = value;
          _hasValue = true;
          _isLoading = false;
          _isStalled = false;
          _error = null;
          notifyListeners();
        },
        onError: (Object error, StackTrace stackTrace) {
          if (generation != _generation) return;
          _timer?.cancel();
          _isLoading = false;
          _isStalled = false;
          _error = error;
          notifyListeners();
        },
      );
    } catch (error) {
      if (generation != _generation) return;
      _timer?.cancel();
      _isLoading = false;
      _error = error;
      notifyListeners();
    }
  }

  Future<void> retry() => start();

  @override
  void dispose() {
    _generation++;
    _timer?.cancel();
    _subscription?.cancel();
    super.dispose();
  }
}
