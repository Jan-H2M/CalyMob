import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../config/app_colors.dart';
import '../../config/piscine_slots.dart';
import '../../providers/auth_provider.dart';
import '../../models/piscine_session.dart';
import '../../models/session_message.dart';
import '../../services/session_message_service.dart';
import '../../services/local_read_tracker.dart';
import '../../widgets/piscine_animated_background.dart';
import '../../config/firebase_config.dart';

/// Page complète pour une séance piscine d'une date donnée.
/// Combine la sélection de disponibilité (créneaux) et la discussion
/// de la chatgroup correspondant au rôle de l'utilisateur.
class SessionAvailabilityPage extends StatefulWidget {
  final DateTime date;
  final String role;
  final List<String> slots;
  final List<String> initialSelectedSlots;
  final dynamic currentAvailability;
  final Future<void> Function(List<String> selectedSlots) onConfirmAvailable;
  final Future<void> Function() onMarkUnavailable;
  final Future<void> Function()? onDelete;

  const SessionAvailabilityPage({
    super.key,
    required this.date,
    required this.role,
    required this.slots,
    required this.initialSelectedSlots,
    required this.currentAvailability,
    required this.onConfirmAvailable,
    required this.onMarkUnavailable,
    this.onDelete,
  });

  @override
  State<SessionAvailabilityPage> createState() =>
      _SessionAvailabilityPageState();
}

class _SessionAvailabilityPageState extends State<SessionAvailabilityPage> {
  late List<String> _selectedSlots;
  bool _isSaving = false;
  
  // Session lookup
  PiscineSession? _session;
  bool _sessionLoading = true;
  SessionChatGroup? _chatGroup;

  // Chat
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  bool _isSendingMessage = false;

  @override
  void initState() {
    super.initState();
    _selectedSlots = List<String>.from(widget.initialSelectedSlots);
    _lookupSession();
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  /// Find the piscine_session for this date
  Future<void> _lookupSession() async {
    try {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      final clubId = FirebaseConfig.defaultClubId;

      // Query for session matching this Tuesday's date
      final startOfDay = DateTime(widget.date.year, widget.date.month, widget.date.day);
      final endOfDay = startOfDay.add(const Duration(days: 1));

      final snapshot = await FirebaseFirestore.instance
          .collection('clubs')
          .doc(clubId)
          .collection('piscine_sessions')
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(startOfDay))
          .where('date', isLessThan: Timestamp.fromDate(endOfDay))
          .where('statut', isEqualTo: PiscineSessionStatus.publie)
          .limit(1)
          .get();

      if (snapshot.docs.isNotEmpty) {
        final session = PiscineSession.fromFirestore(snapshot.docs.first);
        final userId = authProvider.currentUser?.uid;
        if (userId != null) {
          final msgService = SessionMessageService();
          final groups = msgService.getAvailableGroups(
            session: session,
            userId: userId,
          );

          // Find the chat group matching the current role
          SessionChatGroup? matchingGroup;
          if (widget.role == 'accueil') {
            matchingGroup = groups.where(
              (g) => g.type == SessionGroupType.accueil,
            ).firstOrNull;
          } else if (widget.role == 'encadrant') {
            matchingGroup = groups.where(
              (g) => g.type == SessionGroupType.encadrants,
            ).firstOrNull;
          } else if (widget.role == 'gonflage') {
            // Gonflage uses encadrants chat group (they don't have a specific one)
            matchingGroup = groups.where(
              (g) => g.type == SessionGroupType.encadrants,
            ).firstOrNull;
          }

          setState(() {
            _session = session;
            _chatGroup = matchingGroup;
            _sessionLoading = false;
          });

          // Mark messages as read
          if (matchingGroup != null) {
            await LocalReadTracker().markAsRead(
              'session_${session.id}_${matchingGroup.id}',
            );
          }
          return;
        }
      }
      setState(() => _sessionLoading = false);
    } catch (e) {
      debugPrint('Error looking up session: $e');
      setState(() => _sessionLoading = false);
    }
  }

  void _toggleSlot(String slot) {
    setState(() {
      if (_selectedSlots.contains(slot)) {
        _selectedSlots.remove(slot);
      } else {
        _selectedSlots.add(slot);
      }
    });
  }

  String _getRoleTitle() {
    switch (widget.role) {
      case 'encadrant':
        return 'Encadrant';
      case 'gonflage':
        return 'Gonflage';
      case 'accueil':
        return 'Accueil';
      default:
        return 'Disponibilité';
    }
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty || _session == null || _chatGroup == null) return;

    setState(() => _isSendingMessage = true);
    try {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      final clubId = FirebaseConfig.defaultClubId;
      final msgService = SessionMessageService();

      await msgService.sendMessage(
        clubId: clubId,
        sessionId: _session!.id!,
        groupType: _chatGroup!.type,
        groupLevel: _chatGroup!.level,
        message: text,
        senderId: authProvider.currentUser!.uid,
        senderName: authProvider.displayName ?? 'Membre',
      );

      _messageController.clear();
      // Scroll to bottom after sending
      Future.delayed(const Duration(milliseconds: 300), () {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
          );
        }
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Erreur lors de l\'envoi du message')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSendingMessage = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('EEEE d MMMM yyyy', 'fr_FR');
    final formattedDate = dateFormat.format(widget.date);
    final displayDate = formattedDate[0].toUpperCase() + formattedDate.substring(1);

    return Scaffold(
      resizeToAvoidBottomInset: true,
      body: PiscineAnimatedBackground(
        showJellyfish: false,
        showSeaweed: true,
        child: SafeArea(
          child: Column(
            children: [
              // Header
              _buildHeader(displayDate),
              // Body
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 8),
                      // Availability section
                      _buildAvailabilitySection(),
                      const SizedBox(height: 24),
                      // Discussion section
                      _buildDiscussionSection(),
                      const SizedBox(height: 100), // Space for input
                    ],
                  ),
                ),
              ),
              // Message input (only if session has chat)
              if (_session != null && _chatGroup != null)
                _buildMessageInput(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(String displayDate) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${_getRoleTitle()} — Séance Piscine',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  displayDate,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.8),
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAvailabilitySection() {
    final isCurrentlyAvailable = widget.currentAvailability?.available == true;
    final bool hasSlots = widget.slots.isNotEmpty;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.12),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section title
          Row(
            children: [
              Icon(Icons.event_available, color: Colors.white.withOpacity(0.9), size: 20),
              const SizedBox(width: 8),
              const Text(
                'Ma disponibilité',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Slot chips (only for roles with slots)
          if (hasSlots) ...[
            Text(
              'Sélectionnez vos créneaux :',
              style: TextStyle(
                color: Colors.white.withOpacity(0.8),
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: widget.slots.map((slot) {
                final isSelected = _selectedSlots.contains(slot);
                final label = getSlotLabel(widget.role, slot);
                return GestureDetector(
                  onTap: _isSaving ? null : () => _toggleSlot(slot),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? AppColors.success.withOpacity(0.3)
                          : Colors.white.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(
                        color: isSelected
                            ? AppColors.success
                            : Colors.white.withOpacity(0.3),
                        width: 2,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (isSelected)
                          const Padding(
                            padding: EdgeInsets.only(right: 6),
                            child: Icon(Icons.check, color: Colors.white, size: 16),
                          ),
                        Text(
                          label,
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 16),
          ],

          // Action buttons
          Row(
            children: [
              // Available button
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _isSaving
                      ? null
                      : () async {
                          setState(() => _isSaving = true);
                          try {
                            await widget.onConfirmAvailable(_selectedSlots);
                            if (mounted) Navigator.pop(context);
                          } finally {
                            if (mounted) setState(() => _isSaving = false);
                          }
                        },
                  icon: _isSaving
                      ? const SizedBox(
                          width: 16, height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.check_circle, size: 18),
                  label: Text(isCurrentlyAvailable ? 'Mettre à jour' : 'Disponible'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.success,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              // Unavailable button
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _isSaving
                      ? null
                      : () async {
                          setState(() => _isSaving = true);
                          try {
                            await widget.onMarkUnavailable();
                            if (mounted) Navigator.pop(context);
                          } finally {
                            if (mounted) setState(() => _isSaving = false);
                          }
                        },
                  icon: const Icon(Icons.cancel, size: 18),
                  label: const Text('Non disponible'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: BorderSide(color: Colors.white.withOpacity(0.5)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
            ],
          ),

          // Delete button (if existing availability)
          if (widget.onDelete != null) ...[
            const SizedBox(height: 8),
            Center(
              child: TextButton.icon(
                onPressed: _isSaving
                    ? null
                    : () async {
                        setState(() => _isSaving = true);
                        try {
                          await widget.onDelete!();
                          if (mounted) Navigator.pop(context);
                        } finally {
                          if (mounted) setState(() => _isSaving = false);
                        }
                      },
                icon: Icon(Icons.delete_outline, size: 16, color: Colors.red.shade300),
                label: Text('Supprimer', style: TextStyle(color: Colors.red.shade300)),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildDiscussionSection() {
    if (_sessionLoading) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.12),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withOpacity(0.2)),
        ),
        child: const Center(
          child: CircularProgressIndicator(color: Colors.white),
        ),
      );
    }

    if (_session == null) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.08),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            Icon(Icons.info_outline, color: Colors.white.withOpacity(0.6), size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'Pas encore de séance planifiée pour cette date.',
                style: TextStyle(
                  color: Colors.white.withOpacity(0.7),
                  fontSize: 13,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
          ],
        ),
      );
    }

    if (_chatGroup == null) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.08),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            Icon(Icons.chat_bubble_outline, color: Colors.white.withOpacity(0.6), size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'Aucune discussion disponible pour votre rôle.',
                style: TextStyle(
                  color: Colors.white.withOpacity(0.7),
                  fontSize: 13,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
          ],
        ),
      );
    }

    // We have a session and a chat group — show the discussion
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final clubId = FirebaseConfig.defaultClubId;
    final msgService = SessionMessageService();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.12),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section title
          Row(
            children: [
              Icon(Icons.chat, color: Colors.white.withOpacity(0.9), size: 20),
              const SizedBox(width: 8),
              Text(
                'Discussion — ${_chatGroup!.displayName}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Messages stream
          StreamBuilder<List<SessionMessage>>(
            stream: msgService.getMessages(
              clubId: clubId,
              sessionId: _session!.id!,
              groupType: _chatGroup!.type,
              groupLevel: _chatGroup!.level,
            ),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: CircularProgressIndicator(color: Colors.white)),
                );
              }

              final messages = snapshot.data ?? [];
              if (messages.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 20),
                  child: Center(
                    child: Text(
                      'Aucun message. Soyez le premier à écrire !',
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.6),
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
                );
              }

              return ListView.builder(
                controller: _scrollController,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: messages.length,
                itemBuilder: (context, index) {
                  final message = messages[index];
                  final isMe = message.senderId == authProvider.currentUser?.uid;
                  return _buildMessageBubble(message, isMe);
                },
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildMessageBubble(SessionMessage message, bool isMe) {
    final timeFormat = DateFormat('HH:mm', 'fr_FR');
    final time = timeFormat.format(message.createdAt);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isMe) ...[
            CircleAvatar(
              radius: 14,
              backgroundColor: AppColors.middenblauw,
              child: Text(
                message.senderName.isNotEmpty ? message.senderName[0].toUpperCase() : '?',
                style: const TextStyle(color: Colors.white, fontSize: 12),
              ),
            ),
            const SizedBox(width: 6),
          ],
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: isMe
                    ? AppColors.middenblauw.withOpacity(0.7)
                    : Colors.white.withOpacity(0.15),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(12),
                  topRight: const Radius.circular(12),
                  bottomLeft: Radius.circular(isMe ? 12 : 2),
                  bottomRight: Radius.circular(isMe ? 2 : 12),
                ),
              ),
              child: Column(
                crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                children: [
                  if (!isMe)
                    Text(
                      message.senderName,
                      style: TextStyle(
                        color: AppColors.lichtblauw,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  Text(
                    message.message,
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    time,
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.5),
                      fontSize: 10,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageInput() {
    return Container(
      padding: EdgeInsets.only(
        left: 12, right: 8, top: 8,
        bottom: MediaQuery.of(context).viewInsets.bottom + 8,
      ),
      decoration: BoxDecoration(
        color: AppColors.donkerblauw.withOpacity(0.9),
        border: Border(
          top: BorderSide(color: Colors.white.withOpacity(0.15)),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _messageController,
              style: const TextStyle(color: Colors.white),
              maxLines: null,
              decoration: InputDecoration(
                hintText: 'Écrire un message...',
                hintStyle: TextStyle(color: Colors.white.withOpacity(0.4)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: Colors.white.withOpacity(0.1),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              ),
              onSubmitted: (_) => _sendMessage(),
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            onPressed: _isSendingMessage ? null : _sendMessage,
            icon: _isSendingMessage
                ? const SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.send, color: Colors.white),
          ),
        ],
      ),
    );
  }
}
