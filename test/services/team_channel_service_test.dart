import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/models/poll.dart';
import 'package:calymob/models/team_channel.dart';
import 'package:calymob/utils/club_role_utils.dart';

void main() {
  const clubId = 'club1';
  const userId = 'user1';

  group('Team channel visibility', () {
    test('accueil role sees general and accueil', () {
      final availableTypes = ClubRoleUtils.getVisibleTeamChannelTypes(
        ['accueil'],
      );

      expect(availableTypes, [
        TeamChannelType.general,
        TeamChannelType.accueil,
      ]);
    });

    test('mixed coded roles are normalized', () {
      final availableTypes = ClubRoleUtils.getVisibleTeamChannelTypes(
        ['E', 'G'],
      );

      expect(availableTypes, contains(TeamChannelType.general));
      expect(availableTypes, contains(TeamChannelType.encadrants));
      expect(availableTypes, contains(TeamChannelType.gonflage));
    });

    test('includeAllChannels exposes every type for admins with BS', () {
      final availableTypes = ClubRoleUtils.getVisibleTeamChannelTypes(
        const ['BS'],
        includeAllChannels: true,
      );

      expect(availableTypes, TeamChannelType.values);
    });

    test('member without team role still sees general', () {
      final availableTypes = ClubRoleUtils.getVisibleTeamChannelTypes(
        ['membre'],
      );

      expect(availableTypes, [TeamChannelType.general]);
    });

    test('formation audiences require active formation', () {
      final availableTypes = ClubRoleUtils.getVisibleTeamChannelTypes(
        ['membre'],
        plongeurCode: '1*',
      );

      expect(availableTypes, isNot(contains(TeamChannelType.formation2)));
    });

    test('active formation audiences map current level to target formation', () {
      expect(
        ClubRoleUtils.getVisibleTeamChannelTypes(
          ['membre'],
          plongeurCode: 'NB',
          formationActive: true,
        ),
        contains(TeamChannelType.formation1),
      );
      expect(
        ClubRoleUtils.getVisibleTeamChannelTypes(
          ['membre'],
          plongeurCode: '1*',
          formationActive: true,
        ),
        contains(TeamChannelType.formation2),
      );
      expect(
        ClubRoleUtils.getVisibleTeamChannelTypes(
          ['membre'],
          plongeurCode: '2*',
          formationActive: true,
        ),
        contains(TeamChannelType.formation3),
      );
      expect(
        ClubRoleUtils.getVisibleTeamChannelTypes(
          ['membre'],
          plongeurCode: '3*',
          formationActive: true,
        ),
        contains(TeamChannelType.formation4),
      );
      expect(
        ClubRoleUtils.getVisibleTeamChannelTypes(
          ['membre'],
          plongeurCode: '4*',
          formationActive: true,
        ),
        contains(TeamChannelType.formationAM),
      );
    });

    test('explicit formation target overrides current brevet', () {
      final availableTypes = ClubRoleUtils.getVisibleTeamChannelTypes(
        ['membre'],
        plongeurCode: '1*',
        targetFormationLevel: 'AM',
        formationActive: true,
      );

      expect(availableTypes, contains(TeamChannelType.formationAM));
      expect(availableTypes, isNot(contains(TeamChannelType.formation2)));
    });
  });

  group('TeamMessage model', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    test('fromFirestore parses attachments, reactions and poll', () async {
      final channelId = TeamChannelType.encadrants.id;
      final messagesPath = 'clubs/$clubId/team_channels/$channelId/messages';

      final docRef = await firestore.collection(messagesPath).add({
        'sender_id': userId,
        'sender_name': 'Test User',
        'message': 'Hello',
        'attachments': [
          {
            'type': 'video',
            'url': 'https://example.com/video.mp4',
            'filename': 'video.mp4',
            'size': 4096,
            'storage_path':
                'clubs/$clubId/team_channels/$channelId/attachments/video.mp4',
          }
        ],
        'reactions': {
          '👍': [userId, 'other'],
        },
        'poll': {
          'question': 'Qui vient ?',
          'allow_multiple': false,
          'options': [
            {
              'id': 'yes',
              'text': 'Oui',
              'votes': [userId]
            },
            {'id': 'no', 'text': 'Non', 'votes': []},
          ],
        },
        'created_at': Timestamp.fromDate(DateTime(2024, 6, 15, 14, 30)),
      });

      final doc = await docRef.get();
      final message = TeamMessage.fromFirestore(doc);

      expect(message.id, docRef.id);
      expect(message.senderId, userId);
      expect(message.senderName, 'Test User');
      expect(message.message, 'Hello');
      expect(message.formattedTime, '14:30');
      expect(message.attachments, hasLength(1));
      expect(message.attachments.first.isVideo, isTrue);
      expect(message.attachments.first.storagePath, isNotNull);
      expect(message.reactions['👍'], hasLength(2));
      expect(message.hasPoll, isTrue);
      expect(message.poll!.question, 'Qui vient ?');
      expect(message.poll!.options.first.votes, contains(userId));
    });

    test('toFirestore roundtrip preserves poll and reactions', () async {
      final channelId = TeamChannelType.ca.id;
      final messagesPath = 'clubs/$clubId/team_channels/$channelId/messages';

      final original = TeamMessage(
        id: '',
        senderId: userId,
        senderName: 'User',
        message: 'Test',
        createdAt: DateTime(2024, 6, 15),
        reactions: const {
          '🎉': ['user1'],
        },
        poll: const Poll(
          question: 'Option ?',
          options: [
            PollOption(id: 'a', text: 'A', votes: ['user1']),
            PollOption(id: 'b', text: 'B'),
          ],
        ),
        attachments: [
          TeamMessageAttachment(
            type: 'pdf',
            url: 'https://example.com/doc.pdf',
            filename: 'doc.pdf',
            size: 4096,
            storagePath: 'storage/doc.pdf',
          ),
        ],
      );

      final docRef =
          await firestore.collection(messagesPath).add(original.toFirestore());
      final roundtrip = TeamMessage.fromFirestore(await docRef.get());

      expect(roundtrip.senderId, userId);
      expect(roundtrip.message, 'Test');
      expect(roundtrip.attachments, hasLength(1));
      expect(roundtrip.attachments.first.filename, 'doc.pdf');
      expect(roundtrip.reactions['🎉'], ['user1']);
      expect(roundtrip.poll?.question, 'Option ?');
      expect(roundtrip.poll?.options.first.votes, ['user1']);
    });
  });

  group('TeamChannel model', () {
    test('defaultForType creates correct defaults for all current channels',
        () {
      expect(TeamChannel.defaultForType(TeamChannelType.general).id, 'general');
      expect(TeamChannel.defaultForType(TeamChannelType.ca).id, 'equipe_ca');
      expect(
        TeamChannel.defaultForType(TeamChannelType.accueil).id,
        'equipe_accueil',
      );
      expect(
        TeamChannel.defaultForType(TeamChannelType.encadrants).id,
        'equipe_encadrants',
      );
      expect(
        TeamChannel.defaultForType(TeamChannelType.gonflage).id,
        'equipe_gonflage',
      );
      expect(TeamChannel.defaultForType(TeamChannelType.bureau).id, 'bureau');
      expect(
        TeamChannel.defaultForType(TeamChannelType.formation1).id,
        'formation_1_etoile',
      );
      expect(
        TeamChannel.defaultForType(TeamChannelType.formation2).id,
        'formation_2_etoiles',
      );
      expect(
        TeamChannel.defaultForType(TeamChannelType.formation3).id,
        'formation_3_etoiles',
      );
      expect(
        TeamChannel.defaultForType(TeamChannelType.formation4).id,
        'formation_4_etoiles',
      );
      expect(
        TeamChannel.defaultForType(TeamChannelType.formationAM).id,
        'formation_AM',
      );
    });

    test('fromString resolves newly added channels', () {
      expect(
        TeamChannelTypeExtension.fromString('general'),
        TeamChannelType.general,
      );
      expect(
        TeamChannelTypeExtension.fromString('ca'),
        TeamChannelType.ca,
      );
      expect(
        TeamChannelTypeExtension.fromString('bureau'),
        TeamChannelType.bureau,
      );
      expect(
        TeamChannelTypeExtension.fromString('formation_2_etoiles'),
        TeamChannelType.formation2,
      );
      expect(
        TeamChannelTypeExtension.fromString('formation_AM'),
        TeamChannelType.formationAM,
      );
      expect(
        TeamChannelTypeExtension.fromString('unknown'),
        TeamChannelType.encadrants,
      );
    });
  });
}
