import "package:flutter/foundation.dart";
import "../models/notification_model.dart";
import "../services/notification_service.dart";

class NotificationProvider extends ChangeNotifier {
  final NotificationService service;
  List<NotificationModel> notifications = [];
  bool isLoading = false;
  String? error;

  NotificationProvider(this.service);

  int get unreadCount => notifications.where((n) => !n.isRead).length;

  Future<void> fetch() async {
    isLoading = true;
    notifyListeners();

    try {
      notifications = await service.getNotifications();
      error = null;
    } catch (e) {
      error = e.toString();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> markRead(String id) async {
    await service.markRead(id);
    await fetch();
  }

  Future<void> markAllRead() async {
    await service.markAllRead();
    await fetch();
  }

  Future<void> delete(String id) async {
    await service.delete(id);
    await fetch();
  }
}
