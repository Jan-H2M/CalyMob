import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../models/expense_claim.dart';
import '../../providers/expense_provider.dart';
import '../../utils/date_formatter.dart';

/// Écran d'édition d'une demande de remboursement
class EditExpenseScreen extends StatefulWidget {
  final ExpenseClaim expense;

  const EditExpenseScreen({
    Key? key,
    required this.expense,
  }) : super(key: key);

  @override
  State<EditExpenseScreen> createState() => _EditExpenseScreenState();
}

class _EditExpenseScreenState extends State<EditExpenseScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _montantController;
  late final TextEditingController _descriptionController;

  late DateTime _selectedDate;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _montantController = TextEditingController(text: widget.expense.montant.toString());
    _descriptionController = TextEditingController(text: widget.expense.description);
    _selectedDate = widget.expense.dateDepense;
  }

  @override
  void dispose() {
    _montantController.dispose();
    _descriptionController.dispose();
    super.dispose();
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
            colorScheme: ColorScheme.light(
              primary: AppColors.middenblauw,
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

    setState(() {
      _isSubmitting = true;
    });

    try {
      final expenseProvider = context.read<ExpenseProvider>();
      final montant = double.parse(_montantController.text.trim());
      final description = _descriptionController.text.trim();

      await expenseProvider.updateExpense(
        clubId: widget.expense.clubId ?? 'calypso',
        expenseId: widget.expense.id,
        userId: widget.expense.demandeurId,
        montant: montant,
        description: description,
        dateDepense: _selectedDate,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Demande mise à jour'),
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
    return Container(
      decoration: BoxDecoration(
        image: DecorationImage(
          image: AssetImage(AppAssets.backgroundFull),
          fit: BoxFit.cover,
        ),
      ),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          title: const Text('Modifier la demande', style: TextStyle(color: Colors.white)),
          backgroundColor: Colors.transparent,
          elevation: 0,
          iconTheme: const IconThemeData(color: Colors.white),
        ),
        body: SafeArea(
          child: GestureDetector(
            onTap: () => FocusScope.of(context).unfocus(),
            child: LayoutBuilder(
              builder: (context, constraints) {
                return SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: constraints.maxHeight - 32, // Account for padding
                    ),
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.lichtblauw.withOpacity(0.3),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.lichtblauw.withOpacity(0.5)),
                      ),
                      child: Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Montant
                            TextFormField(
                              controller: _montantController,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              decoration: InputDecoration(
                                hintText: 'Montant (€)',
                                prefixIcon: Icon(Icons.euro, color: AppColors.middenblauw),
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                                filled: true,
                                fillColor: Colors.white,
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

                            const SizedBox(height: 12),

                            // Description
                            TextFormField(
                              controller: _descriptionController,
                              maxLines: 2,
                              textInputAction: TextInputAction.done,
                              onFieldSubmitted: (_) => FocusScope.of(context).unfocus(),
                              decoration: InputDecoration(
                                hintText: 'Description de la dépense',
                                prefixIcon: Icon(Icons.description, color: AppColors.middenblauw),
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                                filled: true,
                                fillColor: Colors.white,
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

                            const SizedBox(height: 12),

                            // Date de la dépense
                            InkWell(
                              onTap: _selectDate,
                              borderRadius: BorderRadius.circular(12),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: Colors.grey.shade400),
                                ),
                                child: Row(
                                  children: [
                                    Icon(Icons.calendar_today, color: AppColors.middenblauw),
                                    const SizedBox(width: 12),
                                    Text(
                                      DateFormatter.formatMedium(_selectedDate),
                                      style: const TextStyle(fontSize: 16),
                                    ),
                                  ],
                                ),
                              ),
                            ),

                            const SizedBox(height: 24),

                            // Submit button - round blue
                            Center(
                              child: FloatingActionButton.extended(
                                onPressed: _isSubmitting ? null : _handleSubmit,
                                backgroundColor: AppColors.middenblauw,
                                icon: _isSubmitting
                                    ? const SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(
                                          color: Colors.white,
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : const Icon(Icons.save, color: Colors.white),
                                label: Text(
                                  _isSubmitting ? 'Enregistrement...' : 'Enregistrer',
                                  style: const TextStyle(
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
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}
