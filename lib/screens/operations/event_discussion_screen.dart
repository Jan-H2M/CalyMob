import 'package:flutter/material.dart';
import '../../widgets/event_discussion_tab.dart';

class EventDiscussionScreen extends StatelessWidget {
  final String clubId;
  final String operationId;
  final String operationTitle;

  const EventDiscussionScreen({
    super.key,
    required this.clubId,
    required this.operationId,
    required this.operationTitle,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Discussion',
              style: TextStyle(color: Colors.white, fontSize: 18),
            ),
            Text(
              operationTitle,
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 14,
                fontWeight: FontWeight.normal,
              ),
            ),
          ],
        ),
        backgroundColor: Colors.teal,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: EventDiscussionTab(
        clubId: clubId,
        operationId: operationId,
      ),
    );
  }
}
