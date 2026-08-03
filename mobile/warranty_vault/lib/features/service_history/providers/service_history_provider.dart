import "package:flutter/foundation.dart";
import "../models/service_history_model.dart";
import "../services/service_history_service.dart";

class ServiceHistoryProvider extends ChangeNotifier {
  final ServiceHistoryService service;
  List<ServiceHistoryModel> records = [];
  bool isLoading = false;
  String? error;

  ServiceHistoryProvider(this.service);

  Future<void> fetch(String productId) async {
    isLoading = true;
    notifyListeners();

    try {
      records = await service.get(productId);
      error = null;
    } catch (e) {
      error = e.toString();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> add(String productId, Map<String, dynamic> data) async {
    try {
      await service.add(productId, data);
      await fetch(productId);
    } catch (e) {
      error = e.toString();
      notifyListeners();
    }
  }

  Future<void> delete(String productId, String id) async {
    try {
      await service.delete(productId, id);
      await fetch(productId);
    } catch (e) {
      error = e.toString();
      notifyListeners();
    }
  }
}
