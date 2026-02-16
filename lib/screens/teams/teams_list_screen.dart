import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/team_channel.dart';
import '../../services/team_channel_service.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../config/firebase_config.dart';
import '../../widgets/piscine_animated_background.dart';
import '../../theme/calypso_theme.dart';
import 'team_chat_screen.dart';

class TeamsListScreen extends StatefulWidget {
  const TeamsListScreen({super.key});

  @override
  State<TeamsListScreen> createState() => _TeamsListScreenState();
}

class _TeamsListScreenState extends State<TeamsListScreen> {
  final TeamChannelService _channelService = TeamChannelService();

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    final memberProvider = Provider.of<MemberProvider>(context);
    final clubId = FirebaseConfig.defaultClubId;
    final userId = authProvider.currentUser?.uid;
    final userRoles = memberProvider.clubStatuten;

    if (userId == null) {
      return const Scaffold(
        body: Center(child: Text('Niet verbonden')),
      );
    }

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text(
          'Équipes',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: PiscineAnimatedBackground(
        showJellyfish: true,
        showBubbles: true,
        jellyfishCount: 2,
        child: SafeArea(
          child: StreamBuilder<List<TeamChannel>>(
            stream: _channelService.getChannelsForUser(clubId, userRoles),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(
                  child: CircularProgressIndicator(color: Colors.white),
                );
              }

              final channels = snapshot.data ?? [];

              if (channels.isEmpty) {
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.groups_outlined,
                        size: 64,
                        color: Colors.white.withOpacity(0.5),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Aucune équipe disponible',
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.7),
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Vous avez besoin du rôle "Accueil" ou "Encadrant"',
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.5),
                          fontSize: 14,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                );
              }

              return ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: channels.length,
                itemBuilder: (context, index) {
                  final channel = channels[index];
                  return _ChannelCard(
                    channel: channel,
                    clubId: clubId,
                    userId: userId,
                    channelService: _channelService,
                  );
                },
              );
            },
          ),
        ),
      ),
    );
  }
}

class _ChannelCard extends StatelessWidget {
  final TeamChannel channel;
  final String clubId;
  final String userId;
  final TeamChannelService channelService;

  const _ChannelCard({
    required this.channel,
    required this.clubId,
    required this.userId,
    required this.channelService,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      elevation: 4,
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => TeamChatScreen(channel: channel),
            ),
          );
        },
        borderRadius: BorderRadius.circular(16),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Colors.white,
                channel.type == TeamChannelType.accueil
                    ? Colors.blue.shade50
                    : Colors.purple.shade50,
              ],
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                // Icon
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: channel.type == TeamChannelType.accueil
                        ? Colors.blue.withOpacity(0.1)
                        : Colors.purple.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    channel.type.icon,
                    style: const TextStyle(fontSize: 32),
                  ),
                ),

                const SizedBox(width: 16),

                // Content
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        channel.name,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: CalypsoTheme.donkerblauw,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        channel.description ?? channel.type.description,
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey.shade600,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),

                // Arrow indicator
                Icon(
                  Icons.chevron_right,
                  color: Colors.grey.shade400,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
