class UserModel {
  final String id;
  final String name;
  final String email;
  final DateTime? createdAt;
  final Map<String, dynamic> notificationPreferences;

  UserModel({
    required this.id,
    required this.name,
    required this.email,
    this.createdAt,
    this.notificationPreferences = const {},
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: (json["_id"] ?? json["id"]).toString(),
      name: json["name"] as String? ?? "",
      email: json["email"] as String? ?? "",
      createdAt: json["createdAt"] == null
          ? null
          : DateTime.tryParse(json["createdAt"].toString()),
      notificationPreferences:
          Map<String, dynamic>.from(json["notificationPreferences"] ?? {}),
    );
  }
}
