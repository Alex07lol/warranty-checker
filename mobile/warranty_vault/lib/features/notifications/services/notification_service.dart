import "../../../shared/services/api_service.dart";
import "../models/notification_model.dart";

class NotificationService {
  final ApiService api;

  NotificationService(this.api);

  Future<List<NotificationModel>> getNotifications() async {
    final response = await api.get("/notifications");
    return List<Map<String, dynamic>>.from(
      response.data["data"].map((item) => Map<String, dynamic>.from(item)),
    ).map(NotificationModel.fromJson).toList();
  }

  Future<void> markRead(String id) async {
    await api.put("/notifications/$id/read");
  }

  Future<void> markAllRead() async {
    await api.put("/notifications/read-all");
  }

  Future<void> delete(String id) async {
    await api.delete("/notifications/$id");
  }
}
