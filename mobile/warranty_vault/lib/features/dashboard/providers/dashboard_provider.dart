import "package:flutter/foundation.dart";
import "../models/dashboard_model.dart";
import "../services/dashboard_service.dart";

class DashboardProvider extends ChangeNotifier {
  final DashboardService service;

  DashboardModel? dashboard;
  bool isLoading = false;
  String? error;

  DashboardProvider(this.service);

  Future<void> fetch() async {
    isLoading = true;
    error = null;
    notifyListeners();

    try {
      dashboard = await service.getDashboard();
    } catch (e) {
      error = e.toString();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }
}
