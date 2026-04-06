import 'package:flutter/material.dart';
import '../../config/app_colors.dart';
import '../../widgets/ocean/ocean_config.dart';
import '../../widgets/ocean_background.dart';

/// Écran de réglages pour l'animation océan
class OceanSettingsScreen extends StatefulWidget {
  const OceanSettingsScreen({super.key});

  @override
  State<OceanSettingsScreen> createState() => _OceanSettingsScreenState();
}

class _OceanSettingsScreenState extends State<OceanSettingsScreen> {
  OceanParams _params = OceanParams();
  bool _loaded = false;
  double _previewHour = 12;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final p = await OceanParams.load();
    if (mounted) {
      setState(() {
        _params = p;
        _loaded = true;
        // Set preview hour to current time
        final now = DateTime.now();
        _previewHour = now.hour + now.minute / 60.0;
      });
    }
  }

  Future<void> _save() async {
    await _params.save();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Réglages sauvegardés'),
          backgroundColor: AppColors.middenblauw,
          duration: Duration(seconds: 1),
        ),
      );
    }
  }

  Future<void> _reset() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Réinitialiser'),
        content: const Text('Remettre tous les réglages à leurs valeurs par défaut ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Réinitialiser'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      setState(() => _params = OceanParams());
      await _params.save();
    }
  }

  String _hourLabel(double h) {
    final hours = h.floor();
    final minutes = ((h - hours) * 60).round();
    return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Live preview behind the controls
          OceanBackground(
            params: _params,
            fixedHour: _params.useRealTime ? null : _previewHour,
            child: const SizedBox.expand(),
          ),

          // Semi-transparent overlay for readability
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withOpacity( 0.3),
                    Colors.black.withOpacity( 0.6),
                    Colors.black.withOpacity( 0.8),
                  ],
                  stops: const [0.0, 0.4, 1.0],
                ),
              ),
            ),
          ),

          // Controls
          SafeArea(
            child: Column(
              children: [
                // App bar
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back, color: Colors.white),
                        onPressed: () => Navigator.pop(context),
                      ),
                      const Expanded(
                        child: Text(
                          'Fond océan',
                          style: TextStyle(
                            color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed: _reset,
                        child: const Text('Réinitialiser', style: TextStyle(color: Colors.white60)),
                      ),
                    ],
                  ),
                ),

                // Scrollable settings
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                    children: [
                      // === TIME ===
                      _sectionTitle('HEURE DU JOUR'),

                      // Toggle: follow real time
                      _toggleRow(
                        'Suivre l\'heure du jour',
                        Icons.access_time,
                        _params.useRealTime,
                        (val) => setState(() => _params.useRealTime = val),
                      ),

                      // Manual hour slider (only when not following real time)
                      if (!_params.useRealTime) ...[
                        const SizedBox(height: 8),
                        _sliderRow(
                          'Heure',
                          _previewHour,
                          0, 24,
                          _hourLabel(_previewHour),
                          (v) => setState(() => _previewHour = v),
                        ),
                      ],

                      const SizedBox(height: 20),

                      // === WATER SURFACE ===
                      _sectionTitle('SURFACE DE L\'EAU'),
                      _sliderRow('Amplitude des vagues', _params.waveAmp, 0, 0.1, null,
                        (v) => setState(() => _params.waveAmp = v)),
                      _sliderRow('Vitesse des vagues', _params.waveSpeed, 0.1, 1.5, null,
                        (v) => setState(() => _params.waveSpeed = v)),

                      const SizedBox(height: 20),

                      // === UNDERWATER ===
                      _sectionTitle('SOUS L\'EAU'),
                      _sliderRow('Caustiques (motifs de lumière)', _params.caustics, 0, 2.0, null,
                        (v) => setState(() => _params.caustics = v)),
                      _sliderRow('Intensité des rayons', _params.rays, 0, 3.0, null,
                        (v) => setState(() => _params.rays = v)),
                      _sliderRow('Nombre de rayons', _params.rayCount, 2, 10,
                        _params.rayCount.round().toString(),
                        (v) => setState(() => _params.rayCount = v.roundToDouble())),

                      const SizedBox(height: 20),

                      // === CREATURES ===
                      _sectionTitle('CRÉATURES VIVANTES'),
                      _sliderRow('Poissons', _params.fishCount.toDouble(), 0, 8,
                        _params.fishCount.toString(),
                        (v) => setState(() => _params.fishCount = v.round())),
                      _sliderRow('Méduses', _params.jellyfishCount.toDouble(), 0, 5,
                        _params.jellyfishCount.toString(),
                        (v) => setState(() => _params.jellyfishCount = v.round())),
                      _sliderRow('Bulles', _params.bubbleCount.toDouble(), 0, 30,
                        _params.bubbleCount.toString(),
                        (v) => setState(() => _params.bubbleCount = v.round())),
                      _sliderRow('Raies manta', _params.mantaCount.toDouble(), 0, 3,
                        _params.mantaCount.toString(),
                        (v) => setState(() => _params.mantaCount = v.round())),

                      const SizedBox(height: 30),

                      // Save button
                      SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton.icon(
                          onPressed: _save,
                          icon: const Icon(Icons.save, color: Colors.white),
                          label: const Text(
                            'Sauvegarder',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.middenblauw,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),

                      const SizedBox(height: 40),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 4),
      child: Text(
        title,
        style: TextStyle(
          color: AppColors.lichtblauw.withOpacity( 0.7),
          fontSize: 12,
          fontWeight: FontWeight.w600,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  Widget _sliderRow(String label, double value, double min, double max,
      String? valueLabel, ValueChanged<double> onChanged) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 140,
            child: Text(label, style: const TextStyle(color: Colors.white70, fontSize: 13)),
          ),
          Expanded(
            child: SliderTheme(
              data: SliderThemeData(
                activeTrackColor: AppColors.lichtblauw,
                inactiveTrackColor: Colors.white12,
                thumbColor: Colors.white,
                overlayColor: AppColors.lichtblauw.withOpacity( 0.2),
                trackHeight: 3,
              ),
              child: Slider(
                value: value.clamp(min, max),
                min: min,
                max: max,
                onChanged: onChanged,
              ),
            ),
          ),
          if (valueLabel != null)
            SizedBox(
              width: 40,
              child: Text(
                valueLabel,
                style: const TextStyle(color: Colors.white54, fontSize: 12),
                textAlign: TextAlign.right,
              ),
            ),
        ],
      ),
    );
  }

  Widget _toggleRow(String label, IconData icon, bool value, ValueChanged<bool> onChanged) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity( 0.05),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withOpacity( 0.1)),
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.lichtblauw, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 14)),
          ),
          Switch.adaptive(
            value: value,
            onChanged: onChanged,
            activeColor: AppColors.lichtblauw,
          ),
        ],
      ),
    );
  }
}
