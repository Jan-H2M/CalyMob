/// Phase C follow-up (2026-05-13) — TankPickerField widget.
///
/// "Mes bouteilles" picker for the logbook entry screen. Per Jan's
/// 2026-05-13 feedback: instead of offering a fixed list of common
/// volumes (10/12/15 L), each diver maintains his own catalogue of
/// tanks under `members/{uid}.dive_tanks` and picks from it.
///
/// Storage shape (array on the member doc, persistent across entries):
///
///   dive_tanks: [
///     { id: 'auto1', volume_l: 15, pressure_bar: 200, label: 'Mono 15L 200' },
///     { id: 'auto2', volume_l: 12, pressure_bar: 230, label: 'Acier 12L'    },
///   ]
///
/// The picker:
///   1. Lists the diver's tanks as a dropdown.
///   2. Bottom option `+ Ajouter une bouteille…` opens a modal sheet
///      with three fields (volume, pression, étiquette).
///   3. The added tank is persisted on the member doc and added to the
///      list immediately — so the same tank is reusable for future dives.
///
/// Output via [onChanged] is a [TankSelection] with the snapshotted fields
/// (volume_l, pressure_bar, label, source_tank_id). The logbook entry
/// stores the snapshot, not just an id, so historic entries stay
/// readable even if a tank is later renamed/removed.

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../config/app_colors.dart';
import '../config/firebase_config.dart';

class TankSelection {
  final String? sourceTankId;
  final double volumeL;
  final double pressureBar;
  final String? label;

  const TankSelection({
    this.sourceTankId,
    required this.volumeL,
    required this.pressureBar,
    this.label,
  });

  /// Human-readable summary: "15 L · 200 bar" or "Acier 12L · 230 bar".
  String get summary {
    final base =
        '${_fmt(volumeL)} L · ${_fmt(pressureBar)} bar';
    if (label != null && label!.trim().isNotEmpty) {
      return '${label!.trim()} · $base';
    }
    return base;
  }

  Map<String, dynamic> toMap() {
    return {
      'volume_l': volumeL,
      'pressure_bar': pressureBar,
      if (label != null && label!.trim().isNotEmpty) 'label': label!.trim(),
      if (sourceTankId != null) 'source_tank_id': sourceTankId,
    };
  }

  static String _fmt(double n) {
    final asInt = n.toInt();
    if (asInt.toDouble() == n) return asInt.toString();
    return n.toStringAsFixed(1);
  }
}

class _Tank {
  final String id;
  final double volumeL;
  final double pressureBar;
  final String? label;
  final bool isDefault;

  const _Tank({
    required this.id,
    required this.volumeL,
    required this.pressureBar,
    this.label,
    this.isDefault = false,
  });

  factory _Tank.fromMap(Map<String, dynamic> m) {
    return _Tank(
      id: (m['id'] as String?) ?? '',
      volumeL: (m['volume_l'] as num?)?.toDouble() ?? 0,
      pressureBar: (m['pressure_bar'] as num?)?.toDouble() ?? 0,
      label: m['label'] as String?,
      isDefault: (m['is_default'] as bool?) ?? false,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'volume_l': volumeL,
      'pressure_bar': pressureBar,
      if (label != null && label!.trim().isNotEmpty) 'label': label!.trim(),
      if (isDefault) 'is_default': true,
    };
  }
}

class TankPickerField extends StatefulWidget {
  final String userId;
  final TankSelection? value;
  final ValueChanged<TankSelection?> onChanged;
  /// Optional section label rendered above the dropdown. Defaults to
  /// "BOUTEILLE". Pass null to suppress the title row entirely.
  final String? title;

  const TankPickerField({
    super.key,
    required this.userId,
    required this.value,
    required this.onChanged,
    this.title = 'BOUTEILLE',
  });

  @override
  State<TankPickerField> createState() => _TankPickerFieldState();
}

class _TankPickerFieldState extends State<TankPickerField> {
  List<_Tank> _tanks = const [];
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<DocumentReference<Map<String, dynamic>>> _memberRef() async {
    const clubId = FirebaseConfig.defaultClubId;
    return FirebaseFirestore.instance
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .doc(widget.userId);
  }

  Future<void> _load() async {
    try {
      final ref = await _memberRef();
      final snap = await ref.get();
      final data = snap.data() ?? {};
      final raw = data['dive_tanks'] as List? ?? const [];
      final tanks = raw
          .whereType<Map>()
          .map((m) => _Tank.fromMap(Map<String, dynamic>.from(m)))
          .where((t) => t.volumeL > 0)
          .toList();
      if (!mounted) return;
      setState(() {
        _tanks = tanks;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _persistTanks(List<_Tank> next) async {
    final ref = await _memberRef();
    await ref.set(
      {'dive_tanks': next.map((t) => t.toMap()).toList()},
      SetOptions(merge: true),
    );
  }

  Future<void> _openAddModal() async {
    final created = await showModalBottomSheet<_Tank>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _TankFormSheet(),
    );
    if (created == null) return;
    final newTank = _Tank(
      id: created.id.isEmpty
          ? 'tank_${DateTime.now().millisecondsSinceEpoch}'
          : created.id,
      volumeL: created.volumeL,
      pressureBar: created.pressureBar,
      label: created.label,
    );
    final next = [..._tanks, newTank];
    try {
      await _persistTanks(next);
      if (!mounted) return;
      setState(() => _tanks = next);
      widget.onChanged(TankSelection(
        sourceTankId: newTank.id,
        volumeL: newTank.volumeL,
        pressureBar: newTank.pressureBar,
        label: newTank.label,
      ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Impossible de sauver la bouteille : $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 10),
            Text('Chargement de tes bouteilles…'),
          ],
        ),
      );
    }
    if (_error.isNotEmpty) {
      return Text(
        'Bouteilles indisponibles : $_error',
        style: TextStyle(color: Colors.red.shade700, fontSize: 12),
      );
    }
    final selectedId = widget.value?.sourceTankId;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.title != null)
          Row(
            children: [
              Text(
                widget.title!,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: Colors.grey.shade600,
                  letterSpacing: 1,
                ),
              ),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.tune, size: 18),
                color: AppColors.middenblauw,
                tooltip: 'Gérer mes bouteilles',
                visualDensity: VisualDensity.compact,
                constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                padding: EdgeInsets.zero,
                onPressed: _openManageDialog,
              ),
            ],
          ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: _tanks.isEmpty
                  ? InkWell(
                      onTap: _openManageDialog,
                      borderRadius: BorderRadius.circular(8),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Text(
                          'Aucune bouteille — tape ⚙ pour en ajouter',
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.grey.shade500,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ),
                    )
                  : DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        isExpanded: true,
                        isDense: true,
                        value: selectedId,
                        hint: Text(
                          'Choisis une bouteille…',
                          style: TextStyle(
                            color: Colors.grey.shade500,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                        items: [
                          for (final t in _tanks)
                            DropdownMenuItem<String>(
                              value: t.id,
                              child: Row(
                                children: [
                                  const Icon(
                                    Icons.scuba_diving,
                                    size: 18,
                                    color: AppColors.middenblauw,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      _label(t),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                        ],
                        onChanged: (id) {
                          if (id == null) return;
                          final t = _tanks.firstWhere((x) => x.id == id);
                          widget.onChanged(TankSelection(
                            sourceTankId: t.id,
                            volumeL: t.volumeL,
                            pressureBar: t.pressureBar,
                            label: t.label,
                          ));
                        },
                      ),
                    ),
            ),
            if (widget.value != null)
              IconButton(
                icon: const Icon(Icons.close, size: 18),
                color: Colors.grey.shade600,
                tooltip: 'Retirer',
                visualDensity: VisualDensity.compact,
                constraints:
                    const BoxConstraints(minWidth: 28, minHeight: 28),
                padding: EdgeInsets.zero,
                onPressed: () => widget.onChanged(null),
              ),
          ],
        ),
      ],
    );
  }

  Future<void> _openManageDialog() async {
    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocalState) {
            return AlertDialog(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              titlePadding: const EdgeInsets.fromLTRB(20, 18, 16, 0),
              contentPadding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
              title: const Row(
                children: [
                  Icon(Icons.scuba_diving, color: AppColors.middenblauw),
                  SizedBox(width: 8),
                  Text('Mes bouteilles'),
                ],
              ),
              content: SizedBox(
                width: 360,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () async {
                        final created = await showDialog<_Tank>(
                          context: ctx,
                          builder: (dctx) => Dialog(
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                            insetPadding: const EdgeInsets.symmetric(
                              horizontal: 24,
                              vertical: 40,
                            ),
                            child: SingleChildScrollView(
                              child: ConstrainedBox(
                                constraints:
                                    const BoxConstraints(maxWidth: 400),
                                child: const _TankFormSheet(
                                  insideDialog: true,
                                ),
                              ),
                            ),
                          ),
                        );
                        if (created == null) return;
                        final newTank = _Tank(
                          id: 'tank_${DateTime.now().millisecondsSinceEpoch}',
                          volumeL: created.volumeL,
                          pressureBar: created.pressureBar,
                          label: created.label,
                        );
                        final next = [..._tanks, newTank];
                        try {
                          await _persistTanks(next);
                          if (!mounted) return;
                          setState(() => _tanks = next);
                          setLocalState(() {});
                          widget.onChanged(TankSelection(
                            sourceTankId: newTank.id,
                            volumeL: newTank.volumeL,
                            pressureBar: newTank.pressureBar,
                            label: newTank.label,
                          ));
                        } catch (e) {
                          if (!mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Impossible de sauver : $e')),
                          );
                        }
                      },
                      icon: const Icon(Icons.add, size: 18),
                      label: const Text('Ajouter une bouteille'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.middenblauw,
                        side: const BorderSide(color: AppColors.middenblauw),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (_tanks.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text(
                          'Aucune bouteille enregistrée pour l\'instant.',
                          style: TextStyle(color: Colors.grey.shade600),
                          textAlign: TextAlign.center,
                        ),
                      )
                    else
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 320),
                        child: ListView.separated(
                          shrinkWrap: true,
                          itemCount: _tanks.length,
                          separatorBuilder: (_, __) => Divider(
                              height: 1, color: Colors.grey.shade200),
                          itemBuilder: (_, i) {
                            final t = _tanks[i];
                            return ListTile(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              leading: const Icon(
                                Icons.scuba_diving,
                                color: AppColors.middenblauw,
                              ),
                              title: Text(_label(t),
                                  style: const TextStyle(fontSize: 14)),
                            trailing: IconButton(
                              icon: Icon(Icons.delete_outline,
                                  color: Colors.red.shade400),
                              tooltip: 'Supprimer',
                              onPressed: () async {
                                final confirmed = await showDialog<bool>(
                                  context: ctx,
                                  builder: (cctx) => AlertDialog(
                                    title: Text(
                                        'Supprimer « ${_label(t)} » ?'),
                                    content: const Text(
                                      'Tu peux toujours en recréer une plus tard. Les plongées déjà enregistrées avec cette bouteille restent intactes.',
                                    ),
                                    actions: [
                                      TextButton(
                                        onPressed: () =>
                                            Navigator.pop(cctx, false),
                                        child: const Text('Annuler'),
                                      ),
                                      TextButton(
                                        onPressed: () =>
                                            Navigator.pop(cctx, true),
                                        style: TextButton.styleFrom(
                                            foregroundColor: Colors.red),
                                        child: const Text('Supprimer'),
                                      ),
                                    ],
                                  ),
                                );
                                if (confirmed != true) return;
                                await _deleteTank(t);
                                setLocalState(() {});
                              },
                            ),
                            );
                          },
                        ),
                      ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Fermer'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _deleteTank(_Tank target) async {
    final next = _tanks.where((t) => t.id != target.id).toList();
    try {
      await _persistTanks(next);
      if (!mounted) return;
      setState(() => _tanks = next);
      if (widget.value?.sourceTankId == target.id) {
        widget.onChanged(null);
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Suppression impossible : $e')),
      );
    }
  }

  String _label(_Tank t) {
    final volume = t.volumeL.toInt() == t.volumeL
        ? t.volumeL.toInt().toString()
        : t.volumeL.toStringAsFixed(1);
    final pressure = t.pressureBar.toInt() == t.pressureBar
        ? t.pressureBar.toInt().toString()
        : t.pressureBar.toStringAsFixed(0);
    final base = '$volume L · $pressure bar';
    if (t.label != null && t.label!.trim().isNotEmpty) {
      return '${t.label!.trim()} · $base';
    }
    return base;
  }
}

class _TankMiniAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _TankMiniAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TankFormSheet extends StatefulWidget {
  /// When true, render without the bottom-sheet container so the form
  /// can be embedded inside a centered AlertDialog.
  final bool insideDialog;
  const _TankFormSheet({this.insideDialog = false});

  @override
  State<_TankFormSheet> createState() => _TankFormSheetState();
}

class _TankFormSheetState extends State<_TankFormSheet> {
  final TextEditingController _volume = TextEditingController();
  final TextEditingController _pressure = TextEditingController(text: '200');
  final TextEditingController _label = TextEditingController();

  bool get _canSave {
    final v = double.tryParse(_volume.text.replaceAll(',', '.'));
    final p = double.tryParse(_pressure.text.replaceAll(',', '.'));
    return v != null && v > 0 && p != null && p > 0;
  }

  @override
  void dispose() {
    _volume.dispose();
    _pressure.dispose();
    _label.dispose();
    super.dispose();
  }

  void _save() {
    final v = double.tryParse(_volume.text.replaceAll(',', '.'));
    final p = double.tryParse(_pressure.text.replaceAll(',', '.'));
    if (v == null || p == null) return;
    Navigator.pop(
      context,
      _Tank(
        id: '',
        volumeL: v,
        pressureBar: p,
        label: _label.text.trim().isEmpty ? null : _label.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final viewInsets = MediaQuery.of(context).viewInsets.bottom;
    final body = Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (!widget.insideDialog) ...[
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
          const Row(
            children: [
              Icon(Icons.scuba_diving, color: AppColors.middenblauw),
              SizedBox(width: 8),
              Text(
                'Nouvelle bouteille',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
              ),
            ],
          ),
              const SizedBox(height: 4),
              Text(
                'Elle sera sauvée dans ton profil pour les prochaines plongées.',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: _numField(
                      label: 'Volume',
                      controller: _volume,
                      suffix: 'L',
                      hint: '12',
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _numField(
                      label: 'Pression',
                      controller: _pressure,
                      suffix: 'bar',
                      hint: '200',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _field(
                label: 'Étiquette (optionnel)',
                controller: _label,
                hint: 'Acier 12L, Carbone 7L…',
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Annuler'),
                    ),
                  ),
                  const SizedBox(width: 10),
          Expanded(
            child: ElevatedButton(
              onPressed: _canSave ? _save : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.middenblauw,
                foregroundColor: Colors.white,
              ),
              child: const Text('Ajouter'),
            ),
          ),
        ],
      ),
    ],
      ),
    );
    if (widget.insideDialog) return body;
    return Padding(
      padding: EdgeInsets.only(bottom: viewInsets),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: body,
      ),
    );
  }

  Widget _numField({
    required String label,
    required TextEditingController controller,
    required String suffix,
    required String hint,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: Colors.black87,
          ),
        ),
        const SizedBox(height: 4),
        TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(
              color: Colors.grey.shade400,
              fontStyle: FontStyle.italic,
            ),
            suffixText: suffix,
            filled: true,
            fillColor: Colors.grey.shade100,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide.none,
            ),
            isDense: true,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
        ),
      ],
    );
  }

  Widget _field({
    required String label,
    required TextEditingController controller,
    required String hint,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: Colors.black87,
          ),
        ),
        const SizedBox(height: 4),
        TextField(
          controller: controller,
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(
              color: Colors.grey.shade400,
              fontStyle: FontStyle.italic,
            ),
            filled: true,
            fillColor: Colors.grey.shade100,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide.none,
            ),
            isDense: true,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
        ),
      ],
    );
  }
}
