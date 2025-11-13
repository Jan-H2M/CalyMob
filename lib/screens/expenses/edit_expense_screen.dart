import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/account_codes.dart';
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
  AccountCode? _selectedAccountCode;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _montantController = TextEditingController(text: widget.expense.montant.toString());
    _descriptionController = TextEditingController(text: widget.expense.description);
    _selectedDate = widget.expense.dateDepense;

    // Trouver le code comptable correspondant
    if (widget.expense.codeComptable != null) {
      _selectedAccountCode = getSortedExpenseAccountCodes().firstWhere(
        (code) => code.code == widget.expense.codeComptable,
        orElse: () => getSortedExpenseAccountCodes().first,
      );
    }
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
        categorie: _selectedAccountCode?.category,
        codeComptable: _selectedAccountCode?.code,
        codeComptableLabel: _selectedAccountCode?.label,
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Modifier la demande', style: TextStyle(color: Colors.white)),
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
                          'Enregistrer les modifications',
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
