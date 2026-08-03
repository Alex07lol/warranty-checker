class NotificationModel {
  final String id;
  final String title;
  final String message;
  final bool isRead;
  final DateTime? createdAt;
  final String? productId;

  NotificationModel({
    required this.id,
    required this.title,
    required this.message,
    required this.isRead,
    this.createdAt,
    this.productId,
  });

  factory NotificationModel.fromJson(Map<String, dynamic> json) {
    final product = json["productId"];
    return NotificationModel(
      id: (json["_id"] ?? json["id"]).toString(),
      title: json["title"].toString(),
      message: json["message"].toString(),
      isRead: json["isRead"] as bool? ?? false,
      createdAt: json["createdAt"] == null ? null : DateTime.tryParse(json["createdAt"].toString()),
      productId: product is Map ? product["_id"]?.toString() : product?.toString(),
    );
  }
}
