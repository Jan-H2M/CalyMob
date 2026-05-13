/// Phase C follow-up (2026-05-13) — CombiPickerField widget.
///
/// "Mes combinaisons" picker for the logbook entry screen. Mirrors the
/// approach of `TankPickerField` (Jan's 2026-05-13 feedback): instead of
/// offering a fixed humide/étanche choice, each diver maintains a personal
/// catalogue of suits and picks from it.
///
/// Storage shape (array on the member doc, persistent across entries):
///
///   dive_combis: [
///     { id: 'auto1', type: 'humide',  thickness_mm: 7, brand: 'Bare',
///       label: 'Humide 7mm Bare' },
///     { id: 'auto2', type: 'etanche', brand: 'DUI',
///       label: 'Étanche DUI' },
///   ]
///
/// The picker:
///   1. Lists the diver's combinaisons as a dropdown.
///   2. Bottom option `+ Ajouter une combinaison…` opens a modal sheet
///      with type chips (humide/étanche), optional thickness (mm) for
///      humide, brand and a free-text label.
///   3. The added combi is persisted on the member doc and added to the
///      list immediately — reusable across future dives.
///
/// Output via [onChanged] is a [CombiSelection] snapshot (so historic
/// entries stay readable even after a combi is renamed/removed).

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../config/app_colors.dart';
import '../config/firebase_config.dart';

class CombiSelection {
  final String? sourceCombiId;
  final String type; // 'humide' | 'etanche'
  final int? thicknessMm;
  final String? brand;
  final String? label;

  const CombiSelection({
    this.sourceCombiId,
    required this.type,
    this.thicknessMm,
    this.brand,
    this.label,
  });

  Map<String, dynamic> toMap() {
    return {
      'type': type,
      if (thicknessMm != null) 'thickness_mm': thicknessMm,
      if (brand != null && brand!.trim().isNotEmpty) 'brand': brand!.trim(),
      if (label != null && label!.trim().isNotEmpty) 'label': label!.trim(),
      if (sourceCombiId != null) 'source_combi_id': sourceCombiId,
    };
  }

  String get summary {
    final parts = <String>[
      type == 'etanche' ? 'Étanche' : 'Humide',
      if (type == 'humide' && thicknessMm != null) '${thicknessMm} mm',
      if (brand != null && brand!.trim().isNotEmpty) brand!.trim(),
    ];
    final base = parts.join(' · ');
    if (label != null && label!.trim().isNotEmpty) return label!.trim();
    return base;
  }
}

class _Combi {
  final String id;
  final String type;
  final int? thicknessMm;
  final String? brand;
  final String? label;

  const _Combi({
    required this.id,
    required this.type,
    this.thicknessMm,
    this.brand,
    this.label,
  });

  factory _Combi.fromMap(Map<String, dynamic> m) {
    return _Combi(
      id: (m['id'] as String?) ?? '',
      type: (m['type'] as String?) ?? 'humide',
      thicknessMm: (m['thickness_mm'] as num?)?.toInt(),
      brand: m['brand'] as String?,
      label: m['label'] as String?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'type': type,
      if (thicknessMm != null) 'thickness_mm': thicknessMm,
      if (brand != null && brand!.trim().isNotEmpty) 'brand': brand!.trim(),
      if (label != null && label!.trim().isNotEmpty) 'label': label!.trim(),
    };
  }
}

class CombiPickerField extends StatefulWidget {
  final String userId;
  final CombiSelection? value;
  final ValueChanged<CombiSelection?> onChanged;

  const CombiPickerField({
    super.key,
    required this.userId,
    required this.value,
    required this.onChanged,
  });

  @override
  State<CombiPickerField> createState() => _CombiPickerFieldState();
}

class _CombiPickerFieldState extends State<CombiPickerField> {
  List<_Combi> _combis = const [];
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
      final raw = data['dive_combis'] as List? ?? const [];
      final combis = raw
          .whereType<Map>()
          .map((m) => _Combi.fromMap(Map<String, dynamic>.from(m)))
          .where((c) => c.type.isNotEmpty)
          .toList();
      if (!mounted) return;
      setState(() {
        _combis = combis;
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

  Future<void> _persistCombis(List<_Combi> next) async {
    final ref = await _memberRef();
    await ref.set(
      {'dive_combis': next.map((c) => c.toMap()).toList()},
      SetOptions(merge: true),
    );
  }

  Future<void> _openAddModal() async {
    final created = await showModalBottomSheet<_Combi>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _CombiFormSheet(),
    );
    if (created == null) return;
    final newCombi = _Combi(
      id: created.id.isEmpty
          ? 'combi_${DateTime.now().millisecondsSinceEpoch}'
          : created.id,
      type: created.type,
      thicknessMm: created.thicknessMm,
      brand: created.brand,
      label: created.label,
    );
    final next = [..._combis, newCombi];
    try {
      await _persistCombis(next);
      if (!mounted) return;
      setState(() => _combis = next);
      widget.onChanged(CombiSelection(
        sourceCombiId: newCombi.id,
        type: newCombi.type,
        thicknessMm: newCombi.thicknessMm,
        brand: newCombi.brand,
        label: newCombi.label,
      ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Impossible de sauver la combinaison : $e')),
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
            Text('Chargement de tes combinaisons…'),
          ],
        ),
      );
    }
    if (_error.isNotEmpty) {
      return Text(
        'Combinaisons indisponibles : $_error',
        style: TextStyle(color: Colors.red.shade700, fontSize: 12),
      );
    }
    final selectedId = widget.value?.sourceCombiId;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_combis.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Text(
              'Pas encore de combinaison enregistrée — ajoute la tienne pour pouvoir la sélectionner ensuite.',
              style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700),
            ),
          )
        else
          DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              isExpanded: true,
              value: selectedId,
              hint: const Text('Choisis une combinaison…'),
              items: [
                for (final c in _combis)
                  DropdownMenuItem<String>(
                    value: c.id,
                    child: Row(
                      children: [
                        Icon(
                          c.type == 'etanche'
                              ? Icons.shield_outlined
                              : Icons.opacity,
                          size: 18,
                          color: AppColors.middenblauw,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _label(c),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
              onChanged: (id) {
                if (id == null) return;
                final c = _combis.firstWhere((x) => x.id == id);
                widget.onChanged(CombiSelection(
                  sourceCombiId: c.id,
                  type: c.type,
                  thicknessMm: c.thicknessMm,
                  brand: c.brand,
                  label: c.label,
                ));
              },
            ),
          ),
        const SizedBox(height: 4),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: _openAddModal,
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Ajouter une combinaison…'),
            style: TextButton.styleFrom(
              foregroundColor: AppColors.middenblauw,
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
              minimumSize: const Size(0, 30),
            ),
          ),
        ),
        if (widget.value != null)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: () => widget.onChanged(null),
                icon: const Icon(Icons.close, size: 14),
                label: const Text('Retirer'),
                style: TextButton.styleFrom(
                  foregroundColor: Colors.grey.shade600,
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  minimumSize: const Size(0, 26),
                  textStyle: const TextStyle(fontSize: 12),
                ),
              ),
            ),
          ),
      ],
    );
  }

  String _label(_Combi c) {
    if (c.label != null && c.label!.trim().isNotEmpty) return c.label!.trim();
    final parts = <String>[
      c.type == 'etanche' ? 'Étanche' : 'Humide',
      if (c.type == 'humide' && c.thicknessMm != null) '${c.thicknessMm} mm',
      if (c.brand != null && c.brand!.trim().isNotEmpty) c.brand!.trim(),
    ];
    return parts.join(' · ');
  }
}

class _CombiFormSheet extends StatefulWidget {
  const _CombiFormSheet();

  @override
  State<_CombiFormSheet> createState() => _CombiFormSheetState();
}

class _CombiFormSheetState extends State<_CombiFormSheet> {
  String _type = 'humide';
  final TextEditingController _thickness = TextEditingController(text: '5');
  final TextEditingController _brand = TextEditingController();
  final TextEditingController _label = TextEditingController();

  bool get _canSave {
    if (_type == 'humide') {
      final t = int.tryParse(_thickness.text.trim());
      return t != null && t > 0;
    }
    // étanche has no required field
    return true;
  }

  @override
  void dispose() {
    _thickness.dispose();
    _brand.dispose();
    _label.dispose();
    super.dispose();
  }

  void _save() {
    final t = int.tryParse(_thickness.text.trim());
    Navigator.pop(
      context,
      _Combi(
        id: '',
        type: _type,
        thicknessMm: _type == 'humide' ? t : null,
        brand: _brand.text.trim().isEmpty ? null : _brand.text.trim(),
        label: _label.text.trim().isEmpty ? null : _label.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final viewInsets = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: viewInsets),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
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
              const Row(
                children: [
                  Icon(Icons.dry_cleaning, color: AppColors.middenblauw),
                  SizedBox(width: 8),
                  Text(
                    'Nouvelle combinaison',
                    style:
                        TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'Elle sera sauvée dans ton profil pour les prochaines plongées.',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
              const SizedBox(height: 14),
              // Type chips
              Row(
                children: [
                  Expanded(
                    child: _typeChip(
                      label: 'Humide',
                      icon: Icons.opacity,
                      active: _type == 'humide',
                      onTap: () => setState(() => _type = 'humide'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _typeChip(
                      label: 'Étanche',
                      icon: Icons.shield_outlined,
                      active: _type == 'etanche',
                      onTap: () => setState(() => _type = 'etanche'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (_type == 'humide')
                _numField(
                  label: 'Épaisseur',
                  controller: _thickness,
                  suffix: 'mm',
                  hint: '5',
                ),
              if (_type == 'humide') const SizedBox(height: 12),
              _field(
                label: 'Marque (optionnel)',
                controller: _brand,
                hint: 'Bare, Mares, Aqualung…',
              ),
              const SizedBox(height: 12),
              _field(
                label: 'Étiquette (optionnel)',
                controller: _label,
                hint: 'Humide 7mm noire, Étanche DUI…',
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
        ),
      ),
    );
  }

  Widget _typeChip({
    required String label,
    required IconData icon,
    required bool active,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color:
                active ? AppColors.middenblauw : Colors.grey.shade100,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: active ? AppColors.middenblauw : Colors.grey.shade300,
              width: active ? 1.5 : 1,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon,
                  size: 16,
                  color: active ? Colors.white : Colors.grey.shade700),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: active ? Colors.white : Colors.grey.shade800,
                ),
              ),
            ],
          ),
        ),
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
          keyboardType: TextInputType.number,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            hintText: hint,
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
