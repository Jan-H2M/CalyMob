class EmergencyContact {
  final String name;
  final String relation;
  final String phone;
  final String? email;
  final int priority;

  const EmergencyContact({
    required this.name,
    required this.relation,
    required this.phone,
    this.email,
    required this.priority,
  });

  factory EmergencyContact.fromMap(Map<String, dynamic> map) {
    return EmergencyContact(
      name: map['name'] ?? '',
      relation: map['relation'] ?? '',
      phone: map['phone'] ?? '',
      email: map['email'],
      priority: (map['priority'] as num?)?.toInt() ?? 1,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'name': name,
      'relation': relation,
      'phone': phone,
      'email': email,
      'priority': priority,
    };
  }
}
