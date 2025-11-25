import 'dart:io';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import '../../config/account_codes.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../providers/expense_provider.dart';
import '../../utils/date_formatter.dart';

/// Écran de création d'une demande de remboursement
class CreateExpenseScreen extends StatefulWidget {
  const CreateExpenseScreen({Key? key}) : super(key: key);

  @override
  State<CreateExpenseScreen> createState() => _CreateExpenseScreenState();
}

class _CreateExpenseScreenState extends State<CreateExpenseScreen> {
  final _formKey = GlobalKey<FormState>();
  final _montantController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _imagePicker = ImagePicker();

  DateTime _selectedDate = DateTime.now();
  AccountCode? _selectedAccountCode;
  List<File> _selectedPhotos = [];
  bool _isSubmitting = false;

  @override
  void dispose() {
    _montantController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _pickImageFromCamera() async {
    try {
      final XFile? photo = await _imagePicker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1920,
        maxHeight: 1080,
        imageQuality: 85,
      );

      if (photo != null) {
        setState(() {
          _selectedPhotos.add(File(photo.path));
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur lors de la prise de photo: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _pickImageFromGallery() async {
    try {
      final List<XFile> photos = await _imagePicker.pickMultiImage(
        maxWidth: 1920,
        maxHeight: 1080,
        imageQuality: 85,
      );

      if (photos.isNotEmpty) {
        setState(() {
          _selectedPhotos.addAll(photos.map((photo) => File(photo.path)));
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur lors de la sélection: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _removePhoto(int index) {
    setState(() {
      _selectedPhotos.removeAt(index);
    });
  }

  Future<void> _selectDate() async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      locale: const Locale('fr', 'FR'),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: Colors.orange,
              onPrimary: Colors.white,
              surface: Colors.white,
              onSurface: Colors.black,
            ),
          ),
          child: child!,
        );
      },
    );

    if (picked != null && picked != _selectedDate) {
      setState(() {
        _selectedDate = picked;
      });
    }
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    // Note: Photos sont optionnelles (web browser ne supporte pas toujours la caméra)
    // if (_selectedPhotos.isEmpty) {
    //   ScaffoldMessenger.of(context).showSnackBar(
    //     const SnackBar(
    //       content: Text('⚠️ Veuillez ajouter au moins un justificatif'),
    //       backgroundColor: Colors.orange,
    //     ),
    //   );
    //   return;
    // }

    setState(() {
      _isSubmitting = true;
    });

    try {
      final authProvider = context.read<AuthProvider>();
      final expenseProvider = context.read<ExpenseProvider>();
      final clubId = FirebaseConfig.defaultClubId;
      final userId = authProvider.currentUser?.uid ?? '';
      final userName = authProvider.currentUser?.displayName ?? authProvider.currentUser?.email ?? 'Utilisateur';

      final montant = double.parse(_montantController.text.trim());
      final description = _descriptionController.text.trim();

      await expenseProvider.createExpense(
        clubId: clubId,
        userId: userId,
        userName: userName,
        montant: montant,
        description: description,
        dateDepense: _selectedDate,
        categorie: _selectedAccountCode?.category,
        codeComptable: _selectedAccountCode?.code,
        codeComptableLabel: _selectedAccountCode?.label,
        photoFiles: _selectedPhotos,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Demande créée avec succès'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Nouvelle demande', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.orange,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Montant
              TextFormField(
                controller: _montantController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: 'Montant (€)',
                  prefixIcon: Icon(Icons.euro, color: Colors.orange),
                  border: OutlineInputBorder(),
                  helperText: 'Ex: 25.50',
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Le montant est requis';
                  }
                  final montant = double.tryParse(value.trim());
                  if (montant == null || montant <= 0) {
                    return 'Montant invalide';
                  }
                  return null;
                },
              ),

              const SizedBox(height: 16),

              // Description
              TextFormField(
                controller: _descriptionController,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Description',
                  prefixIcon: Icon(Icons.description, color: Colors.orange),
                  border: OutlineInputBorder(),
                  helperText: 'Décrivez la dépense',
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'La description est requise';
                  }
                  if (value.trim().length < 5) {
                    return 'Description trop courte (min 5 caractères)';
                  }
                  return null;
                },
              ),

              const SizedBox(height: 16),

              // Date de la dépense
              InkWell(
                onTap: _selectDate,
                child: InputDecorator(
                  decoration: const InputDecoration(
                    labelText: 'Date de la dépense',
                    prefixIcon: Icon(Icons.calendar_today, color: Colors.orange),
                    border: OutlineInputBorder(),
                  ),
                  child: Text(
                    DateFormatter.formatMedium(_selectedDate),
                    style: const TextStyle(fontSize: 16),
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // Code comptable
              DropdownButtonFormField<AccountCode>(
                value: _selectedAccountCode,
                decoration: const InputDecoration(
                  labelText: 'Code comptable',
                  prefixIcon: Icon(Icons.account_balance, color: Colors.orange),
                  border: OutlineInputBorder(),
                ),
                items: getSortedExpenseAccountCodes().map((code) {
                  return DropdownMenuItem(
                    value: code,
                    child: Text(
                      code.isFavorite
                          ? '⭐ ${code.code} - ${code.label}'
                          : '${code.code} - ${code.label}',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: code.isFavorite ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                  );
                }).toList(),
                onChanged: (value) {
                  setState(() {
                    _selectedAccountCode = value;
                  });
                },
                validator: (value) {
                  if (value == null) {
                    return 'Le code comptable est requis';
                  }
                  return null;
                },
              ),

              const SizedBox(height: 24),

              // Section Justificatifs
              const Text(
                'Justificatifs',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),

              // Boutons photo
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _isSubmitting ? null : _pickImageFromCamera,
                      icon: const Icon(Icons.camera_alt, color: Colors.white),
                      label: const Text('Appareil photo', style: TextStyle(color: Colors.white)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _isSubmitting ? null : _pickImageFromGallery,
                      icon: const Icon(Icons.photo_library, color: Colors.white),
                      label: const Text('Galerie', style: TextStyle(color: Colors.white)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 16),

              // Photos preview (disabled on web - Image.file not supported)
              if (_selectedPhotos.isNotEmpty && !kIsWeb) ...[
                Text(
                  '${_selectedPhotos.length} photo(s) sélectionnée(s)',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[600],
                  ),
                ),
                const SizedBox(height: 8),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    crossAxisSpacing: 8,
                    mainAxisSpacing: 8,
                  ),
                  itemCount: _selectedPhotos.length,
                  itemBuilder: (context, index) {
                    return Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.file(
                            _selectedPhotos[index],
                            width: double.infinity,
                            height: double.infinity,
                            fit: BoxFit.cover,
                          ),
                        ),
                        Positioned(
                          top: 4,
                          right: 4,
                          child: InkWell(
                            onTap: () => _removePhoto(index),
                            child: Container(
                              padding: const EdgeInsets.all(4),
                              decoration: BoxDecoration(
                                color: Colors.red,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                Icons.close,
                                color: Colors.white,
                                size: 16,
                              ),
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ] else if (_selectedPhotos.isNotEmpty && kIsWeb)
                // Web: show text only (no image preview)
                Text(
                  '📷 ${_selectedPhotos.length} photo(s) sélectionnée(s)',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[600],
                  ),
                )
              else
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey[300]!),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    children: [
                      Icon(Icons.photo_camera, size: 48, color: Colors.grey[400]),
                      const SizedBox(height: 8),
                      Text(
                        'Aucune photo ajoutée',
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                    ],
                  ),
                ),

              const SizedBox(height: 24),

              // Submit button
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _isSubmitting ? null : _handleSubmit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.orange,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : const Text(
                          'Soumettre la demande',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
